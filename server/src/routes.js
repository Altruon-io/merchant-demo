/**
 * routes.js — the demo's own HTTP API (consumed by the React frontend).
 *
 * Why does this demo have a backend at all?
 * -----------------------------------------
 * Creating Altruon checkout sessions and reading transaction details require
 * your SECRET key. A secret key in browser code is visible to anyone who opens
 * DevTools — so, exactly like in a real integration, the key lives here in the
 * server environment (server/.env) and the browser only ever talks to these
 * routes. This is the same pattern you should use in production.
 *
 * Route map (all JSON):
 *   GET  /api/config            → public config for the frontend (no secrets)
 *   POST /api/validate          → credential & configuration health-check
 *   POST /api/estimate          → price preview (subtotal / discount / tax)
 *   POST /api/session           → create an Altruon checkout session
 *   GET  /api/transactions/:id  → transaction report after payment
 */

import { Router } from "express";
import {
  AltruonApiError,
  createSession,
  estimateSubscription,
  getConfig,
  getTransactionDetails,
} from "./altruonClient.js";

export const router = Router();

/**
 * Merge .env defaults with per-request overrides coming from the demo's
 * configuration panel. Only NON-SECRET values are overridable — the secret
 * key always comes from the server environment.
 */
function resolveCheckoutConfig(overrides = {}) {
  const env = getConfig();
  return {
    billingConnectionId: (overrides.billingConnectionId || env.billingConnectionId || "").trim(),
    planId: (overrides.planId || env.planId || "").trim(),
    addonIds: Array.isArray(overrides.addonIds)
      ? overrides.addonIds.map((s) => String(s).trim()).filter(Boolean)
      : env.addonIds,
    currency: (overrides.currency || env.currency || "EUR").trim().toUpperCase(),
  };
}

/**
 * Build the billingData.lineItems array for session creation.
 *
 * Altruon enforces a strict ordering (see the Session API docs):
 *   1. exactly ONE item of type "plan", and it must come first
 *   2. zero or more "addon" items (recurring add-ons) after the plan
 * One-time addons are automatically re-classified as charges by Altruon.
 */
function buildLineItems({ planId, addonIds }) {
  return [
    { type: "plan", id: planId, quantity: 1 },
    ...addonIds.map((id) => ({ type: "addon", id, quantity: 1 })),
  ];
}

/**
 * Map the storefront branding (MySaas defaults or merchant overrides from the
 * config panel) onto Altruon's `styleCustomization` so the embedded payment
 * component visually matches the host page.
 */
function buildStyleCustomization(branding = {}) {
  return {
    backgroundColor: "#FFFFFF",
    primaryColor: "#E2E8F0", // input borders / dividers inside the component
    secondaryColor: "#FFFFFF",
    accentColor: branding.primaryColor || "#6366F1", // buttons & focus states
    borderRadius: "10px",
    headerTextColor: "#0F172A",
    textColor: "#0F172A",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    dropShadow: false,
  };
}

/** Uniform error responder: keeps upstream status codes when we have them. */
function sendAltruonError(res, error, fallbackMessage) {
  if (error instanceof AltruonApiError) {
    return res.status(error.status || 502).json({
      error: error.message,
      upstreamStatus: error.status,
      details: error.body,
    });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
}

/**
 * Merge a country code with optional billing address fields from the
 * frontend. PagBrasil and tax engines need street / city / zipCode, not
 * just country.
 */
function buildBillingAddressPayload(country, billingAddress) {
  if (!country && !billingAddress) return undefined;
  const addr = billingAddress || {};
  return {
    country: country || addr.country,
    ...(addr.street ? { street: addr.street } : {}),
    ...(addr.number ? { number: addr.number } : {}),
    ...(addr.city ? { city: addr.city } : {}),
    ...(addr.state ? { state: addr.state } : {}),
    ...(addr.zipCode ? { zipCode: addr.zipCode } : {}),
  };
}

/*
 * GET /api/config — public configuration for the frontend.
 *
 * Returns everything the browser is ALLOWED to know:
 *   - the publishable key + tenant (needed by the Altruon JS SDK)
 *   - the checkout defaults (billing connection, plan, addons, currency)
 *   - storefront branding defaults
 * The secret key is deliberately absent.
 */
router.get("/config", (_req, res) => {
  const env = getConfig();
  res.json({
    publishableKey: env.publishableKey,
    tenant: env.tenant,
    apiBaseUrl: env.apiBaseUrl, // shown (read-only) in the config panel for clarity
    defaults: {
      billingConnectionId: env.billingConnectionId,
      planId: env.planId,
      addonIds: env.addonIds,
      currency: env.currency,
    },
    branding: {
      displayName: env.merchantDisplayName, // empty string → frontend falls back to "MySaas"
      logoUrl: env.merchantLogoUrl,
    },
  });
});

/*
 * POST /api/validate — credential & configuration health-check.
 *
 * Altruon has no dedicated "ping" endpoint, so we validate the way a real
 * integration would discover problems: by creating a throw-away checkout
 * session and classifying the outcome.
 *
 *   - missing env values        → caught before any network call
 *   - network / DNS failure     → ALTRUON_DOMAIN is wrong
 *   - HTTP 401 / 403            → secret key invalid (or wrong tenant)
 *   - other 4xx                 → credentials OK, but billing connection /
 *                                 plan id / currency need attention
 *   - 200                       → everything works (the probe session simply
 *                                 expires unused after ~15 minutes)
 *
 * Body (optional): { overrides: { billingConnectionId, planId, addonIds, currency } }
 * Response: { ok, checks: [{ id, label, ok, message }] }
 */
router.post("/validate", async (req, res) => {
  const env = getConfig();
  const cfg = resolveCheckoutConfig(req.body?.overrides);

  const checks = [];
  const push = (id, label, ok, message = "") => checks.push({ id, label, ok, message });

  // 1. Static checks — things we can verify without calling Altruon.
  push("secretKey", "Secret key configured", Boolean(env.secretKey),
    env.secretKey ? "" : "Set ALTRUON_SECRET_KEY in server/.env");
  push("publishableKey", "Publishable key configured", Boolean(env.publishableKey),
    env.publishableKey ? "" : "Set ALTRUON_PUBLISHABLE_KEY in server/.env");
  push("domain", "Altruon domain configured", Boolean(env.tenant),
    env.tenant ? "" : "Set ALTRUON_DOMAIN in server/.env (e.g. mycompany.sandbox.altruon.io)");
  push("billingConnectionId", "Billing connection id set", Boolean(cfg.billingConnectionId),
    cfg.billingConnectionId ? "" : "Set BILLING_CONNECTION_ID (Dashboard → Integrations → Billing Providers)");
  push("planId", "Plan id set", Boolean(cfg.planId),
    cfg.planId ? "" : "Set PLAN_ID to an item price id from your billing provider");

  if (checks.some((c) => !c.ok)) {
    return res.json({ ok: false, checks });
  }

  // 2. Live probe — one real session-create call against the Altruon API.
  try {
    await createSession({
      paymentData: { currency: cfg.currency },
      // The probe session is never rendered; any https URL satisfies the API.
      redirectUrl: "https://example.com/altruon-demo-validation",
      billingData: {
        billingPlatformId: cfg.billingConnectionId,
        lineItems: buildLineItems(cfg),
      },
    });
    push("api", "Altruon API reachable & credentials accepted", true,
      "A probe checkout session was created successfully.");
    return res.json({ ok: true, checks });
  } catch (error) {
    if (!(error instanceof AltruonApiError)) throw error;

    if (error.status === null) {
      // fetch() itself failed → DNS / connectivity → wrong domain.
      push("api", "Altruon API reachable", false, error.message);
    } else if (error.status === 401 || error.status === 403) {
      push("api", "Secret key accepted by Altruon", false,
        "Altruon rejected the secret key (401). Check ALTRUON_SECRET_KEY and that it belongs " +
        `to the "${env.tenant}" tenant.`);
    } else {
      // Credentials fine — the checkout configuration needs attention.
      push("api", "Checkout configuration accepted", false,
        `Credentials look valid, but session creation failed (${error.status}): ${error.message} — ` +
        "check BILLING_CONNECTION_ID, PLAN_ID and CURRENCY.");
    }
    return res.json({ ok: false, checks });
  }
});

/*
 * POST /api/estimate — live price preview for the order summary.
 *
 * Proxies Altruon's estimate-subscription endpoint, which asks your billing
 * provider (Stripe / Chargebee / Recurly / ...) to price the subscription
 * exactly as the first invoice would be: line items, coupon discount, tax
 * for the shopper's country, and the resulting total.
 *
 * Body: { country?, couponCodes?, overrides? }
 * Response (passthrough from Altruon):
 *   { invoiceSubtotal, totalDiscountAmount, totalTaxAmount,
 *     futureInvoiceAmountDue, currency, lineItems: [...] }
 * Amounts are in MINOR units (cents) — the frontend formats them.
 */
router.post("/estimate", async (req, res) => {
  const { country, billingAddress, couponCodes, overrides } = req.body || {};
  const cfg = resolveCheckoutConfig(overrides);
  const addressPayload = buildBillingAddressPayload(country, billingAddress);

  try {
    const estimate = await estimateSubscription(cfg.billingConnectionId, {
      currency: cfg.currency,
      ...(Array.isArray(couponCodes) && couponCodes.length ? { couponCodes } : {}),
      ...(addressPayload
        ? { customerBillingInfo: { billingAddress: addressPayload } }
        : {}),
      // The plan and each addon are "subscription items" for estimation.
      subscriptionItems: [
        { itemPriceId: cfg.planId, quantity: 1 },
        ...cfg.addonIds.map((id) => ({ itemPriceId: id, quantity: 1 })),
      ],
    });

    res.json(estimate);
  } catch (error) {
    sendAltruonError(res, error, "Failed to estimate the subscription price.");
  }
});

/*
 * POST /api/session — create the Altruon checkout session.
 *
 * Called when the checkout page mounts (and again if the shopper changes
 * something that requires re-pricing, e.g. country or coupons — sessions are
 * cheap and single-use).
 *
 * Body: {
 *   customer?:      { email, firstName, lastName, phone },
 *   country?:       ISO 3166-1 alpha-2 (drives tax),
 *   couponCodes?:   string[],
 *   paymentMethod?: scope the session to ONE method (e.g. "card", "pix").
 *                   Omitted → Altruon returns every routed method in
 *                   `available_payment_methods`, which the frontend uses to
 *                   render its own method selector; it then re-creates the
 *                   session scoped to the shopper's choice so the embedded
 *                   component shows only that method's form.
 *   redirectUrl:    where Altruon sends the shopper back after off-site
 *                   payment flows (we use the demo's /result page),
 *   branding?:      { primaryColor } → styleCustomization,
 *   overrides?:     config panel overrides (non-secret values only)
 * }
 * Response: { sessionId, availablePaymentMethods }
 */
router.post("/session", async (req, res) => {
  const { customer, country, billingAddress, couponCodes, paymentMethod, redirectUrl, branding, overrides } =
    req.body || {};
  const cfg = resolveCheckoutConfig(overrides);
  const addressPayload = buildBillingAddressPayload(country, billingAddress);

  try {
    const data = await createSession({
      paymentData: {
        currency: cfg.currency,
        ...(paymentMethod ? { paymentMethod } : {}),
      },
      // After a redirect flow (3-D Secure, bank login, ...) Altruon returns
      // the shopper to this URL with ?trx_id=<transaction id> appended.
      redirectUrl,
      billingData: {
        billingPlatformId: cfg.billingConnectionId,
        lineItems: buildLineItems(cfg),
        ...(Array.isArray(couponCodes) && couponCodes.length ? { couponCodes } : {}),
      },
      customerData: {
        email: customer?.email || undefined,
        firstName: customer?.firstName || undefined,
        lastName: customer?.lastName || undefined,
        phone: customer?.phone || undefined,
        ...(addressPayload ? { billingAddress: addressPayload } : {}),
      },
      // Make the embedded payment component match the storefront brand.
      styleCustomization: buildStyleCustomization(branding),
    });

    // Response shape differs by request: without a paymentMethod Altruon
    // returns `available_payment_methods[]`; with one it returns a single
    // `payment_method` + `gateway`. Normalize to one array for the frontend.
    const availablePaymentMethods =
      data.available_payment_methods ??
      (data.payment_method
        ? [
            {
              payment_method: data.payment_method,
              gateway: data.gateway,
              gateway_connection_id: data.gateway_connection_id,
            },
          ]
        : []);

    res.json({
      sessionId: data.session_id,
      availablePaymentMethods,
    });
  } catch (error) {
    sendAltruonError(res, error, "Failed to create the checkout session.");
  }
});

/*
 * GET /api/transactions/:id — post-payment transaction report.
 *
 * Used by the /result page after Altruon redirects back with ?trx_id=...
 * (and after in-page successes). The response contains everything needed
 * for a back-office-grade receipt: gateway transaction + deep link, billing
 * provider customer / invoice / subscription + deep links, next billing date.
 */
router.get("/transactions/:id", async (req, res) => {
  try {
    const details = await getTransactionDetails(req.params.id);
    res.json(details);
  } catch (error) {
    sendAltruonError(res, error, "Failed to fetch transaction details.");
  }
});
