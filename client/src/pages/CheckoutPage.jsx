/**
 * CheckoutPage — the storefront subscription checkout (what a customer of
 * "MySaas" — or of YOUR brand, via the config panel — would see).
 *
 * Integration walkthrough (the order matters):
 *
 *   1. Our backend creates a checkout session       POST /api/session
 *      (server-side, with the secret key — see server/src/routes.js)
 *   2. The Altruon JS SDK binds to that session     altruon.init(pk, tenant)
 *      and renders the payment component             .setSession(id)
 *      into a container we own                       .renderComponent('#...')
 *   3. The shopper fills the form; we forward        altruon.setCustomer(...)
 *      their details to the session                  altruon.setAddresses(...)
 *   4. Pay button                                    altruon.processPaymentAndSubscription()
 *   5. The SDK reports the outcome via callbacks registered in step 2:
 *        onSuccess        → navigate to /result?trx_id=...
 *        onFailure        → FailureModal (new session needed to retry)
 *        onActionRequired → REDIRECT → RedirectModal (disclaimer + countdown)
 *                           QR_CODE  → QrOverlay (scan-to-pay; Pix sandbox also
 *                                      offers an "Open simulator" button)
 *
 * Sessions are SINGLE-USE: whenever pricing inputs change (coupons, config
 * panel overrides) or a payment fails, we create a fresh session.
 *
 * Docs: https://docs.altruon.io/docs/developers/altruon-js/quick-start
 *       https://docs.altruon.io/docs/developers/altruon-js/callbacks
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDemoConfig } from "../context/DemoConfigContext.jsx";
import { createCheckoutSession } from "../services/api.js";
import { formatDecimalMoney } from "../utils/money.js";
import OrderSummary from "../components/OrderSummary.jsx";
import RedirectModal from "../components/RedirectModal.jsx";
import QrOverlay from "../components/QrOverlay.jsx";
import FailureModal from "../components/FailureModal.jsx";
import ProcessingOverlay from "../components/ProcessingOverlay.jsx";
import BrandMark from "../components/BrandMark.jsx";
import SandboxTestCredentials from "../components/SandboxTestCredentials.jsx";
import {
  BR_STATES,
  postalRuleFor,
  requiresBrazilBilling,
  toApiBillingAddress,
  toSdkBillingAddress,
  validateCheckoutForm,
} from "../utils/addressValidation.js";
import { extractTransactionId } from "../utils/transactionId.js";
import {
  getDummyCheckoutData,
  isSandboxEnvironment,
} from "../utils/testFixtures.js";
import "./CheckoutPage.css";

/** Display labels for Altruon payment method identifiers. */
const METHOD_LABELS = {
  card: "Card",
  pix: "Pix",
  upi: "UPI",
  openbanking: "Open Banking",
  open_banking: "Open Banking",
  sepa: "SEPA Direct Debit",
  boleto: "Boleto",
  wallet: "Wallet",
};

function methodLabel(method) {
  if (METHOD_LABELS[method]) return METHOD_LABELS[method];
  // Fallback: "some_method" → "Some Method"
  return String(method)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Billing countries offered in the form — the selection drives tax. */
const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "ES", name: "Spain" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "PT", name: "Portugal" },
  { code: "BR", name: "Brazil" },
  { code: "IN", name: "India" },
  { code: "MX", name: "Mexico" },
  { code: "JP", name: "Japan" },
];

/** Sensible default billing country for a currency. */
function defaultCountryFor(currency) {
  const map = { EUR: "ES", USD: "US", GBP: "GB", BRL: "BR", INR: "IN", JPY: "JP", MXN: "MX" };
  return map[currency] || "US";
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { brand, checkout, checkoutOverrides, serverConfig } = useDemoConfig();

  /* ── Form state ─────────────────────────────────────────────────────── */
  const [customer, setCustomer] = useState({ firstName: "", lastName: "", email: "", phone: "" });
  const [billingAddress, setBillingAddress] = useState({
    street: "",
    number: "",
    city: "",
    state: "",
    zipCode: "",
  });
  const [country, setCountry] = useState(defaultCountryFor(checkout.currency));
  const [couponCodes, setCouponCodes] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [routedGateway, setRoutedGateway] = useState(null);

  /* ── Session / SDK state ────────────────────────────────────────────── */
  const [sessionId, setSessionId] = useState(null);
  const [sessionError, setSessionError] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  /* ── Payment method selection ───────────────────────────────────────────
   * The first (unscoped) session creation DISCOVERS which methods are
   * routed for this currency (e.g. ["card", "pix"]). If there's more than
   * one, we render our own selector and create a session SCOPED to the
   * chosen method — so the embedded component shows a single, focused form
   * instead of every method expanded at once. */
  const [availableMethods, setAvailableMethods] = useState(null); // null = not discovered yet
  const [selectedMethod, setSelectedMethod] = useState(null);
  const methodsRef = useRef(null); // discovery guard (refs don't retrigger the effect)

  /* ── Action / outcome state (from SDK callbacks) ────────────────────── */
  const [redirectAction, setRedirectAction] = useState(null); // { url, message }
  const [qrAction, setQrAction] = useState(null); // { qrData, redirectUrl, message }
  const [awaitingOutcome, setAwaitingOutcome] = useState(false); // simulator / off-tab wait
  const [failure, setFailure] = useState(null); // error message string
  const [paymentConfirmed, setPaymentConfirmed] = useState(null); // success without trx id

  /* ── Estimate (shared with the pay button label) ────────────────────── */
  const [estimate, setEstimate] = useState(null);

  // Refs so SDK callbacks (registered once per session) always see the
  // latest values without re-binding.
  const countryRef = useRef(country);
  countryRef.current = country;
  const billingAddressRef = useRef(billingAddress);
  billingAddressRef.current = billingAddress;
  const activeMethodRef = useRef(null);
  activeMethodRef.current =
    selectedMethod || (availableMethods?.length === 1 ? availableMethods[0] : null);

  const brazilLocked = requiresBrazilBilling({
    currency: checkout.currency,
    gateway: routedGateway,
  });
  const postalRule = postalRuleFor(country);
  const isSandbox = isSandboxEnvironment(serverConfig);
  const isPagbrasil =
    String(routedGateway || "").toLowerCase() === "pagbrasil" || brazilLocked;
  const activePaymentMethod =
    selectedMethod || (availableMethods?.length === 1 ? availableMethods[0] : null);

  // PagBrasil (and BRL checkouts) require billing country BR — lock it.
  useEffect(() => {
    if (brazilLocked) setCountry("BR");
  }, [brazilLocked]);

  // When currency changes in the config panel, pick a sensible default country.
  useEffect(() => {
    if (!brazilLocked) setCountry(defaultCountryFor(checkout.currency));
  }, [checkout.currency, brazilLocked]);

  // Monotonic run id: initializeCheckout is async and can be superseded
  // (config arriving, coupon changes, React StrictMode double-mount). Only
  // the LATEST run may write state, otherwise a slow stale run could e.g.
  // overwrite a successful mount with its error.
  const runIdRef = useRef(0);

  /* ────────────────────────────────────────────────────────────────────
   * Session creation + SDK mounting
   * ──────────────────────────────────────────────────────────────────── */

  const initializeCheckout = useCallback(async () => {
    // Wait for the public config (publishable key + tenant). SetupGate may
    // render us before GET /api/config resolves when a previous validation
    // was cached — this effect re-runs automatically once config arrives.
    if (!serverConfig) return;

    const runId = ++runIdRef.current;
    const isCurrent = () => runId === runIdRef.current;

    setSessionLoading(true);
    setSessionError(null);
    setSessionId(null);

    try {
      // Step 1 — our backend creates the session with the SECRET key.
      const { sessionId: id, availablePaymentMethods } = await createCheckoutSession({
        country: countryRef.current,
        billingAddress: toApiBillingAddress(countryRef.current, billingAddressRef.current),
        couponCodes,
        paymentMethod: selectedMethod || undefined,
        branding: { primaryColor: brand.primaryColor },
        overrides: checkoutOverrides,
      });
      if (!isCurrent()) return; // superseded while awaiting — discard

      // Remember which gateway was routed (PagBrasil → lock BR address).
      const gateway = availablePaymentMethods?.[0]?.gateway;
      if (gateway) setRoutedGateway(gateway);

      // Method discovery (first creation only): learn what's routed for
      // this currency. With 2+ methods, pre-select the first and bail out —
      // the effect re-runs and creates a session scoped to that method.
      if (methodsRef.current === null) {
        const unique = [
          ...new Set(
            (availablePaymentMethods || []).map((m) => m.payment_method).filter(Boolean)
          ),
        ];
        methodsRef.current = unique;
        setAvailableMethods(unique);
        if (!selectedMethod && unique.length > 1) {
          setSelectedMethod(unique[0]);
          return;
        }
      }

      setSessionId(id);

      // Step 2 — bind the SDK to the session and mount the component.
      const altruon = window.altruon;
      if (!altruon) {
        throw new Error(
          "The Altruon SDK failed to load. Check your network and refresh the page."
        );
      }

      altruon
        .init(serverConfig.publishableKey, serverConfig.tenant)
        .on("onSuccess", handleSuccess)
        .on("onFailure", handleFailure)
        .on("onActionRequired", handleActionRequired)
        .on("onDataRequired", handleDataRequired);

      altruon.setSession(id);

      // The SDK appends an iframe to the container; clear any previous
      // mount first (sessions are recreated on retry / config changes).
      const container = document.querySelector("#altruon-payment-container");
      if (container) container.innerHTML = "";
      await altruon.renderComponent("#altruon-payment-container");
    } catch (err) {
      if (isCurrent()) setSessionError(err.message || "Could not initialize the checkout.");
    } finally {
      if (isCurrent()) setSessionLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponCodes, JSON.stringify(checkoutOverrides), brand.primaryColor, serverConfig, selectedMethod]);

  // Config-panel changes (e.g. another currency) can change which payment
  // methods are routed — forget the previous discovery and start over.
  useEffect(() => {
    methodsRef.current = null;
    setAvailableMethods(null);
    setSelectedMethod(null);
    setRoutedGateway(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(checkoutOverrides)]);

  // (Re)create the session whenever pricing inputs or the chosen payment
  // method change. Country changes do NOT require a new session — the SDK
  // syncs the address before payment.
  useEffect(() => {
    initializeCheckout();
  }, [initializeCheckout]);

  /* ────────────────────────────────────────────────────────────────────
   * SDK callbacks
   * ──────────────────────────────────────────────────────────────────── */

  /** Payment confirmed → hand over to the result page for the full report. */
  function handleSuccess(data) {
    setIsProcessing(false);
    setAwaitingOutcome(false);
    setQrAction(null);
    setFailure(null);

    const trxId = extractTransactionId(data);
    if (trxId) {
      navigate(`/result?trx_id=${encodeURIComponent(trxId)}`);
      return;
    }

    console.warn("Success callback without a valid transaction id:", data);
    setPaymentConfirmed({
      message:
        "Your payment was received. A confirmation email will follow — transaction details are not available in this demo yet.",
    });
  }

  /** Payment declined / errored. Retrying requires a NEW session. */
  function handleFailure(error) {
    setIsProcessing(false);
    setAwaitingOutcome(false);
    setQrAction(null);
    setFailure(error?.message || "The payment could not be completed.");
  }

  /**
   * The payment needs an extra step. Altruon normalizes these into two
   * shapes, but we read defensively since gateways vary:
   *   REDIRECT → { actionType, redirectUrl, message }
   *   QR_CODE  → { actionType, qrData (base64 PNG data URI), message }
   */
  function handleActionRequired(action) {
    setIsProcessing(false);
    setAwaitingOutcome(false);

    const type = String(action?.actionType || "").toLowerCase();
    const url = action?.redirectUrl || action?.url || action?.data?.url;
    const qrData =
      action?.qrData || action?.qrCodeUrl || action?.qrCode || action?.data?.qrData;

    const method = String(activeMethodRef.current || "").toLowerCase();
    const isPixLike = method === "pix" || type.includes("qr") || Boolean(qrData);

    // Pix / QR flows: never same-page redirect — show QR (+ simulator button) and
    // keep this page alive for onSuccess / onFailure. Merge split callbacks.
    if (isPixLike && (qrData || url)) {
      setRedirectAction(null);
      setQrAction((prev) => ({
        qrData: qrData || prev?.qrData || null,
        redirectUrl: url || prev?.redirectUrl || null,
        message: action?.message || prev?.message,
      }));
      return;
    }

    if (url) {
      setQrAction(null);
      setRedirectAction({ url, message: action?.message });
      return;
    }

    setFailure("The payment requires an unsupported additional step.");
    console.warn("Unhandled onActionRequired payload:", action);
  }

  /** Open PagBrasil sandbox simulator in a new tab; stay here and wait for outcome. */
  function handleOpenSimulator() {
    if (qrAction?.redirectUrl) {
      window.open(qrAction.redirectUrl, "_blank", "noopener,noreferrer");
    }
    setQrAction(null);
    setAwaitingOutcome(true);
  }

  /** Cancel while waiting for Pix simulator / off-site confirmation. */
  function handleCancelAwaiting() {
    setAwaitingOutcome(false);
    handleRetry();
  }

  /** Cancel QR modal before opening simulator. */
  function handleCancelQr() {
    setQrAction(null);
    handleRetry();
  }

  /** The gateway needs a field we didn't collect (rare in this demo setup). */
  function handleDataRequired(info) {
    setIsProcessing(false);
    setFailure(
      info?.message || "Additional customer data is required for this payment method."
    );
    console.warn("onDataRequired:", info);
  }

  /* ────────────────────────────────────────────────────────────────────
   * Pay button
   * ──────────────────────────────────────────────────────────────────── */

  const formIsValid = validateCheckoutForm({
    customer,
    billingAddress,
    country,
    brazilLocked,
  }).ok;

  const canPay =
    Boolean(sessionId) && !sessionLoading && !isProcessing && formIsValid;

  const handlePay = () => {
    const validation = validateCheckoutForm({
      customer,
      billingAddress,
      country,
      brazilLocked,
    });
    setFieldErrors(validation.errors);
    if (!validation.ok || !sessionId || sessionLoading || isProcessing) return;

    const altruon = window.altruon;
    const sdkBilling = toSdkBillingAddress(country, billingAddress);

    // Step 3 — sync the shopper's details onto the session. The SDK sends
    // them with the next session update (before the payment call).
    altruon.setCustomer({
      firstName: customer.firstName.trim(),
      lastName: customer.lastName.trim(),
      email: customer.email.trim(),
      phone: customer.phone.trim() || undefined,
    });
    altruon.setAddresses({ billing: sdkBilling });

    // PagBrasil (BRL) requires a CPF/CNPJ document on the payment payload.
    if (country === "BR" || checkout.currency === "BRL") {
      altruon.setPaymentExtra({ document: "91051605962" });
    }

    // Step 4 — process. The outcome arrives via the callbacks above.
    setIsProcessing(true);
    try {
      altruon.processPaymentAndSubscription();
    } catch (err) {
      setIsProcessing(false);
      setFailure(err.message || "Failed to start the payment.");
    }
  };

  /** Retry after a failure or cancelled redirect: fresh single-use session. */
  const handleRetry = () => {
    setFailure(null);
    setPaymentConfirmed(null);
    setAwaitingOutcome(false);
    setRedirectAction(null);
    setQrAction(null);
    initializeCheckout();
  };

  const setField = (name) => (e) =>
    setCustomer((c) => ({ ...c, [name]: e.target.value }));

  const setAddressField = (name) => (e) => {
    setBillingAddress((a) => ({ ...a, [name]: e.target.value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  const handleCountryChange = (e) => {
    if (brazilLocked) return;
    setCountry(e.target.value);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.zipCode;
      delete next.country;
      return next;
    });
  };

  /** Prefill merchant-side fields with sandbox-safe dummy data. */
  function fillWithDummyData() {
    const fixture = getDummyCheckoutData({ brazilLocked, country });
    setCustomer(fixture.customer);
    setBillingAddress(fixture.billingAddress);
    if (fixture.country) setCountry(fixture.country);
    setFieldErrors({});
  }

  /* ────────────────────────────────────────────────────────────────────
   * Render
   * ──────────────────────────────────────────────────────────────────── */

  return (
    <div className="checkout-page">
      {/* Merchant-branded header (MySaas by default, yours via the panel) */}
      <header className="checkout-header">
        <div className="checkout-header-inner">
          <div className="checkout-header-left">
            {isSandbox && (
              <button
                type="button"
                className="sandbox-fill-btn"
                onClick={fillWithDummyData}
                disabled={isProcessing || awaitingOutcome}
              >
                Fill with dummy data
              </button>
            )}
            <BrandMark brand={brand} />
          </div>
          <span className="checkout-secure">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
              <path d="M8 11V8a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="2" />
            </svg>
            Secure checkout
          </span>
        </div>
      </header>

      <main className="checkout-main">
        <div className="checkout-grid">
          {/* ── Left column: customer details + payment component ───────── */}
          <section className="checkout-form card fade-up">
            <h2>Complete your subscription</h2>

            {paymentConfirmed && (
              <div className="checkout-success-banner" role="status">
                <strong>Payment successful.</strong> {paymentConfirmed.message}
              </div>
            )}

            <div className="checkout-section">
              <h4>Your details</h4>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="firstName">First name</label>
                  <input id="firstName" value={customer.firstName} onChange={setField("firstName")} placeholder="Ada" autoComplete="given-name" />
                </div>
                <div className="field">
                  <label htmlFor="lastName">Last name</label>
                  <input id="lastName" value={customer.lastName} onChange={setField("lastName")} placeholder="Lovelace" autoComplete="family-name" />
                </div>
              </div>

              <div className="field">
                <label htmlFor="email">
                  Email <span className="required-mark">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={customer.email}
                  onChange={setField("email")}
                  placeholder="ada@example.com"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email ? (
                  <span className="field-error">{fieldErrors.email}</span>
                ) : (
                  <span className="hint">Your receipt and subscription details go here.</span>
                )}
              </div>

              <div className="field">
                <label htmlFor="phone">Phone (optional)</label>
                <input
                  id="phone"
                  type="tel"
                  value={customer.phone}
                  onChange={setField("phone")}
                  placeholder={brazilLocked ? "+55 11 99999-9999" : "+1 555 000 0000"}
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="checkout-section">
              <h4>Billing address</h4>
              {brazilLocked && (
                <p className="checkout-address-note">
                  PagBrasil requires a complete Brazilian billing address. Country is locked to
                  Brazil.
                </p>
              )}

              <div className="field">
                <label htmlFor="street">
                  Address line 1 <span className="required-mark">*</span>
                </label>
                <input
                  id="street"
                  value={billingAddress.street}
                  onChange={setAddressField("street")}
                  placeholder={brazilLocked ? "Rua das Flores, 123" : "123 Main Street"}
                  autoComplete="address-line1"
                  aria-invalid={Boolean(fieldErrors.street)}
                />
                {fieldErrors.street && <span className="field-error">{fieldErrors.street}</span>}
              </div>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="number">Number (optional)</label>
                  <input
                    id="number"
                    value={billingAddress.number}
                    onChange={setAddressField("number")}
                    placeholder="123"
                    autoComplete="address-line2"
                  />
                </div>
                <div className="field">
                  <label htmlFor="city">
                    City <span className="required-mark">*</span>
                  </label>
                  <input
                    id="city"
                    value={billingAddress.city}
                    onChange={setAddressField("city")}
                    placeholder={brazilLocked ? "São Paulo" : "San Francisco"}
                    autoComplete="address-level2"
                    aria-invalid={Boolean(fieldErrors.city)}
                  />
                  {fieldErrors.city && <span className="field-error">{fieldErrors.city}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className="field">
                  <label htmlFor="zipCode">
                    {postalRule.label} <span className="required-mark">*</span>
                  </label>
                  <input
                    id="zipCode"
                    value={billingAddress.zipCode}
                    onChange={setAddressField("zipCode")}
                    placeholder={postalRule.placeholder}
                    autoComplete="postal-code"
                    aria-invalid={Boolean(fieldErrors.zipCode)}
                  />
                  {fieldErrors.zipCode ? (
                    <span className="field-error">{fieldErrors.zipCode}</span>
                  ) : (
                    <span className="hint">{postalRule.hint}</span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="country">
                    Country <span className="required-mark">*</span>
                  </label>
                  <select
                    id="country"
                    value={country}
                    onChange={handleCountryChange}
                    disabled={brazilLocked}
                    aria-invalid={Boolean(fieldErrors.country)}
                  >
                    {brazilLocked ? (
                      <option value="BR">Brazil</option>
                    ) : (
                      COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))
                    )}
                  </select>
                  {fieldErrors.country ? (
                    <span className="field-error">{fieldErrors.country}</span>
                  ) : (
                    <span className="hint">Used to calculate tax on your subscription.</span>
                  )}
                </div>
              </div>

              {(brazilLocked || country === "BR") && (
                <div className="field">
                  <label htmlFor="state">
                    State <span className="required-mark">*</span>
                  </label>
                  <select
                    id="state"
                    value={billingAddress.state}
                    onChange={setAddressField("state")}
                    aria-invalid={Boolean(fieldErrors.state)}
                  >
                    <option value="">Select state…</option>
                    {BR_STATES.map((s) => (
                      <option key={s.code} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.state ? (
                    <span className="field-error">{fieldErrors.state}</span>
                  ) : (
                    <span className="hint">Sent to the gateway as a two-letter UF code (e.g. SP, RJ).</span>
                  )}
                </div>
              )}
            </div>

            <div className="checkout-section">
              <h4>Payment method</h4>

              {/* Our own method selector (shown when 2+ methods are routed).
                  Selecting one creates a session scoped to that method, so
                  the embedded form below only shows the relevant fields. */}
              {availableMethods && availableMethods.length > 1 && (
                <div className="method-selector" role="radiogroup" aria-label="Payment method">
                  {availableMethods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      role="radio"
                      aria-checked={selectedMethod === method}
                      className={`method-option${selectedMethod === method ? " selected" : ""}`}
                      onClick={() => selectedMethod !== method && setSelectedMethod(method)}
                      disabled={sessionLoading || isProcessing}
                    >
                      <span className="method-radio" />
                      {methodLabel(method)}
                    </button>
                  ))}
                </div>
              )}

              {isSandbox && isPagbrasil && activePaymentMethod && (
                <SandboxTestCredentials method={activePaymentMethod} />
              )}

              {/* The Altruon SDK mounts its payment component (an iframe)
                  into #altruon-payment-container — see initializeCheckout().

                  IMPORTANT: that div must stay EMPTY from React's point of
                  view. The SDK appends DOM nodes into it (and we clear it
                  between sessions), so if React also rendered children there
                  the two would fight over the same nodes and React would
                  crash with removeChild errors. The loading state is a
                  SIBLING for exactly that reason. */}
              <div className="altruon-container">
                <div id="altruon-payment-container" />
                {sessionLoading && (
                  <div className="altruon-loading" style={{ color: "var(--sf-primary)" }}>
                    <div className="spinner spinner-lg" />
                    <span>Loading secure payment form…</span>
                  </div>
                )}
              </div>

              {sessionError && (
                <div className="error-banner">
                  <span>{sessionError}</span>
                  <button className="sf-button secondary retry-inline" onClick={initializeCheckout}>
                    Retry
                  </button>
                </div>
              )}
            </div>

            <button className="sf-button checkout-pay" onClick={handlePay} disabled={!canPay}>
              {isProcessing ? (
                <span className="spinner small" />
              ) : (
                <>
                  Subscribe
                  {estimate?.futureInvoiceAmountDue !== undefined &&
                    estimate?.futureInvoiceAmountDue !== null && (
                      <span className="checkout-pay-amount">
                        · {formatDecimalMoney(estimate.futureInvoiceAmountDue, estimate.currency || checkout.currency)}
                      </span>
                    )}
                </>
              )}
            </button>

            <p className="checkout-terms">
              By subscribing you agree to the {brand.displayName} terms of service. Your
              subscription renews automatically — cancel anytime.
            </p>
          </section>

          {/* ── Right column: live-priced order summary ─────────────────── */}
          <OrderSummary
            country={country}
            billingAddress={toApiBillingAddress(country, billingAddress)}
            couponCodes={couponCodes}
            onApplyCoupon={(code) =>
              setCouponCodes((codes) => (codes.includes(code) ? codes : [...codes, code]))
            }
            onRemoveCoupon={(code) => setCouponCodes((codes) => codes.filter((c) => c !== code))}
            onEstimate={setEstimate}
          />
        </div>
      </main>

      <footer className="checkout-footer">
        Powered by{" "}
        <a href="https://www.altruon.io" target="_blank" rel="noopener noreferrer">
          <img src="/altruon/logo.svg" alt="Altruon" />
        </a>
        <span className="checkout-footer-sep">·</span>
        <a href="https://docs.altruon.io/docs/intro" target="_blank" rel="noopener noreferrer">
          Developer docs
        </a>
      </footer>

      {/* ── Overlays & modals ──────────────────────────────────────────── */}
      {isProcessing && (
        <ProcessingOverlay
          label="Processing your payment…"
          hint="Please don't close or refresh this page."
        />
      )}

      {awaitingOutcome && !isProcessing && (
        <ProcessingOverlay
          label="Waiting for payment confirmation…"
          hint="Complete the payment in the simulator tab. This page will update automatically once confirmed."
          onCancel={handleCancelAwaiting}
          cancelLabel="Cancel payment"
        />
      )}

      {redirectAction && !qrAction && (
        <RedirectModal
          url={redirectAction.url}
          message={redirectAction.message}
          onCancel={() => {
            setRedirectAction(null);
            handleRetry();
          }}
        />
      )}

      {qrAction && (
        <QrOverlay
          qrData={qrAction.qrData}
          redirectUrl={qrAction.redirectUrl}
          message={qrAction.message}
          onOpenSimulator={handleOpenSimulator}
          onClose={handleCancelQr}
        />
      )}

      {failure && (
        <FailureModal error={failure} onRetry={handleRetry} onClose={() => setFailure(null)} />
      )}
    </div>
  );
}
