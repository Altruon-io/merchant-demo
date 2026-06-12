/**
 * ResultPage — post-payment landing page (/result?trx_id=...).
 *
 * Two paths lead here:
 *   1. In-page success: the SDK's onSuccess callback navigates here with
 *      the transaction id.
 *   2. Redirect flows (3-D Secure, bank login, QR app handoff, ...): the
 *      checkout session's `redirectUrl` points here, and Altruon appends
 *      ?trx_id=<id> when sending the shopper back.
 *
 * Either way we fetch the full transaction report from our backend
 * (GET /api/transactions/:id — secret key stays server-side) and render:
 *   - a status hero (success / failed / pending) with the charged amount
 *   - detail cards with deep links into the payment gateway and billing
 *     provider dashboards (see TransactionDetails.jsx)
 */

import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDemoConfig } from "../context/DemoConfigContext.jsx";
import { fetchTransaction } from "../services/api.js";
import { formatDisplayAmount } from "../utils/money.js";
import { isValidTransactionId } from "../utils/transactionId.js";
import TransactionDetails from "../components/TransactionDetails.jsx";
import BrandMark from "../components/BrandMark.jsx";
import ProcessingOverlay from "../components/ProcessingOverlay.jsx";
import "./ResultPage.css";

/** Map Altruon transaction status → hero variant. */
function statusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "succeeded") return "success";
  if (s === "failed" || s === "failure" || s === "declined") return "failed";
  return "pending"; // processing / requires_action / unknown
}

const HERO_COPY = {
  success: {
    title: "Payment successful",
    text: "Your subscription is active. A receipt has been sent to your email.",
  },
  failed: {
    title: "Payment unsuccessful",
    text: "The payment could not be completed. You have not been charged.",
  },
  pending: {
    title: "Payment processing",
    text: "Your payment is being confirmed. This usually takes just a moment.",
  },
};

export default function ResultPage() {
  const [searchParams] = useSearchParams();
  const { brand } = useDemoConfig();

  const trxId = searchParams.get("trx_id");
  const validTrxId = isValidTransactionId(trxId) ? trxId.trim() : null;

  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(Boolean(validTrxId));
  const [error, setError] = useState(() => {
    if (!trxId) return "No transaction reference found in the URL.";
    if (!validTrxId) {
      return "The transaction reference in the URL is invalid. Return to checkout and try again, or use the link from your payment confirmation email.";
    }
    return null;
  });

  useEffect(() => {
    if (!validTrxId) return;
    let cancelled = false;

    fetchTransaction(validTrxId)
      .then((data) => !cancelled && setDetails(data))
      .catch((err) => !cancelled && setError(err.message || "Could not load the transaction."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [validTrxId]);

  const variant = statusVariant(details?.transaction?.status);
  const copy = HERO_COPY[variant];

  return (
    <div className="result-page">
      {/* Same merchant-branded header as the checkout */}
      <header className="checkout-header">
        <div className="checkout-header-inner">
          <BrandMark brand={brand} />
        </div>
      </header>

      <main className="result-main">
        {loading ? (
          <ProcessingOverlay
            label="Confirming your payment…"
            hint="Retrieving your transaction details. This usually takes just a moment."
          />
        ) : error ? (
          <div className="result-hero failed card fade-up">
            <StatusIcon variant="failed" />
            <h1>Something went wrong</h1>
            <p>{error}</p>
            <Link to="/" className="sf-button result-cta">
              Back to checkout
            </Link>
          </div>
        ) : (
          <>
            {/* ── Status hero ──────────────────────────────────────────── */}
            <div className={`result-hero ${variant} card fade-up`}>
              <StatusIcon variant={variant} />
              <h1>{copy.title}</h1>
              <p>{copy.text}</p>
              {(details?.transaction?.amountInMajorUnit ?? details?.transaction?.amount) && (
                <div className="result-amount">
                  {formatDisplayAmount(details.transaction)}
                </div>
              )}
            </div>

            {/* ── Full report: gateway + billing provider deep links ───── */}
            <TransactionDetails details={details} />

            <div className="result-actions fade-up">
              <Link to="/" className="sf-button">
                {variant === "failed" ? "Try again" : "Start a new purchase"}
              </Link>
            </div>
          </>
        )}
      </main>

      <footer className="checkout-footer">
        Powered by{" "}
        <a href="https://www.altruon.io" target="_blank" rel="noopener noreferrer">
          <img src="/altruon/logo.svg" alt="Altruon" />
        </a>
      </footer>
    </div>
  );
}

/** Big circular status icon for the hero. */
function StatusIcon({ variant }) {
  if (variant === "success") {
    return (
      <div className="result-icon success">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5L10 17.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }
  if (variant === "failed") {
    return (
      <div className="result-icon failed">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  return (
    <div className="result-icon pending">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
        <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    </div>
  );
}
