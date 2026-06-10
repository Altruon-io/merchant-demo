/**
 * OrderSummary — the live-priced order panel on the checkout page.
 *
 * Uses Altruon's estimate-subscription API (proxied by our backend as
 * POST /api/estimate) to show EXACTLY what the first invoice will charge:
 *
 *   ┌──────────────────────────────┐
 *   │ Pro plan            €29.00   │  ← lineItems[] from the estimate
 *   │ Extra seats addon   €10.00   │
 *   │ ──────────────────────────   │
 *   │ Subtotal            €39.00   │  ← invoiceSubtotal
 *   │ Discount (SAVE10)   −€3.90   │  ← totalDiscountAmount (when coupons)
 *   │ Tax                  €7.39   │  ← totalTaxAmount
 *   │ ──────────────────────────   │
 *   │ Due today           €42.49   │  ← futureInvoiceAmountDue
 *   └──────────────────────────────┘
 *
 * The estimate re-runs whenever the shopper changes billing country (tax!)
 * or applies/removes a coupon. All amounts arrive in minor units.
 *
 * Props:
 *   country      — ISO country code from the customer form
 *   couponCodes  — array of applied coupon codes
 *   onApplyCoupon / onRemoveCoupon — coupon input handlers
 *   onEstimate   — optional callback receiving the latest estimate
 */

import React, { useEffect, useState } from "react";
import { useDemoConfig } from "../context/DemoConfigContext.jsx";
import { fetchEstimate } from "../services/api.js";
import { formatDecimalMoney } from "../utils/money.js";
import "./OrderSummary.css";

export default function OrderSummary({ country, billingAddress, couponCodes, onApplyCoupon, onRemoveCoupon, onEstimate }) {
  const { checkout, checkoutOverrides, brand } = useDemoConfig();

  const [estimate, setEstimate] = useState(null);
  const [estimating, setEstimating] = useState(true);
  const [estimateError, setEstimateError] = useState(null);

  // Coupon input is local state; the *applied* codes live in the parent so
  // they can also be attached to the checkout session.
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState(null);

  /* Re-estimate whenever pricing inputs change. */
  useEffect(() => {
    let cancelled = false;
    setEstimating(true);
    setEstimateError(null);

    fetchEstimate({ country, billingAddress, couponCodes, overrides: checkoutOverrides })
      .then((data) => {
        if (cancelled) return;
        setEstimate(data);
        setCouponError(null);
        onEstimate?.(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (couponCodes.length) {
          // Most common failure with coupons applied: the billing provider
          // rejected the code. Surface it next to the input and roll back.
          setCouponError(err.message || "This coupon could not be applied.");
          onRemoveCoupon(couponCodes[couponCodes.length - 1]);
        } else {
          setEstimateError(err.message || "Could not load the price estimate.");
        }
      })
      .finally(() => !cancelled && setEstimating(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, JSON.stringify(billingAddress), couponCodes.join(","), JSON.stringify(checkoutOverrides)]);

  const currency = estimate?.currency || checkout.currency;
  const hasDiscount = Number(estimate?.totalDiscountAmount) > 0;
  const hasTax = estimate?.totalTaxAmount !== null && estimate?.totalTaxAmount !== undefined;

  const submitCoupon = (e) => {
    e.preventDefault();
    const code = couponInput.trim();
    if (!code) return;
    setCouponInput("");
    setCouponError(null);
    onApplyCoupon(code);
  };

  return (
    <aside className="order-summary card fade-up">
      <h3>Order summary</h3>
      <p className="order-brand-line">
        {brand.displayName} subscription
        {estimate?.priceType ? ` · ${estimate.priceType}` : ""}
      </p>

      {estimateError ? (
        <div className="error-banner">{estimateError}</div>
      ) : (
        <>
          {/* ── Line items ─────────────────────────────────────────────── */}
          <ul className="order-lines">
            {estimating && !estimate
              ? // First load: skeleton placeholders for a calm loading state.
                [0, 1].map((i) => (
                  <li key={i} className="order-line">
                    <span className="skeleton" style={{ width: "55%" }} />
                    <span className="skeleton" style={{ width: "20%" }} />
                  </li>
                ))
              : (estimate?.lineItems || []).map((line) => (
                  <li key={line.id || line.entityId} className="order-line">
                    <span className="order-line-desc">
                      {line.description || line.entityId}
                      {Number(line.quantity) > 1 && (
                        <span className="order-line-qty"> × {line.quantity}</span>
                      )}
                    </span>
                    <span className="order-line-amount">
                      {formatDecimalMoney(line.totalAmount ?? line.unitAmount, currency)}
                    </span>
                  </li>
                ))}
          </ul>

          {/* ── Coupon input ───────────────────────────────────────────── */}
          <form className="order-coupon" onSubmit={submitCoupon}>
            <input
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="Coupon code"
              aria-label="Coupon code"
              disabled={estimating}
            />
            <button type="submit" className="sf-button secondary" disabled={estimating || !couponInput.trim()}>
              Apply
            </button>
          </form>
          {couponError && <div className="order-coupon-error">{couponError}</div>}
          {couponCodes.length > 0 && (
            <div className="order-coupon-chips">
              {couponCodes.map((code) => (
                <span key={code} className="order-chip">
                  {code}
                  <button onClick={() => onRemoveCoupon(code)} aria-label={`Remove coupon ${code}`}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* ── Totals ─────────────────────────────────────────────────── */}
          <dl className="order-totals" aria-busy={estimating}>
            <div>
              <dt>Subtotal</dt>
              <dd>
                {estimating ? (
                  <span className="skeleton" style={{ width: 64, display: "inline-block" }} />
                ) : (
                  formatDecimalMoney(estimate?.invoiceSubtotal, currency)
                )}
              </dd>
            </div>

            {hasDiscount && !estimating && (
              <div className="order-discount">
                <dt>Discount</dt>
                <dd>−{formatDecimalMoney(estimate.totalDiscountAmount, currency)}</dd>
              </div>
            )}

            {hasTax && (
              <div>
                <dt>Tax</dt>
                <dd>
                  {estimating ? (
                    <span className="skeleton" style={{ width: 48, display: "inline-block" }} />
                  ) : (
                    formatDecimalMoney(estimate?.totalTaxAmount, currency)
                  )}
                </dd>
              </div>
            )}

            <div className="order-total">
              <dt>Due today</dt>
              <dd>
                {estimating ? (
                  <span className="skeleton" style={{ width: 80, display: "inline-block" }} />
                ) : (
                  formatDecimalMoney(estimate?.futureInvoiceAmountDue, currency)
                )}
              </dd>
            </div>
          </dl>

          <p className="order-note">
            Prices include applicable taxes based on your billing country. You can cancel
            anytime.
          </p>
        </>
      )}
    </aside>
  );
}
