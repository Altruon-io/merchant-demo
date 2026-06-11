/**
 * FailureModal — shown when the SDK fires `onFailure`.
 *
 * Important integration detail: Altruon checkout sessions are SINGLE-USE.
 * After a failed payment attempt, "Try again" must create a brand-new
 * session (the parent's onRetry handler does exactly that) rather than
 * re-submitting the old one.
 */

import React from "react";
import "./ActionModals.css";

export default function FailureModal({ error, onRetry, onClose }) {
  return (
    <div className="overlay overlay-blocking">
      <div className="modal action-modal" role="dialog" aria-modal="true">
        <div className="action-icon failure">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <h3>Payment unsuccessful</h3>
        <p className="action-text">
          {error || "Your payment could not be processed. No charge was made."}
        </p>

        <div className="action-buttons">
          <button className="sf-button" onClick={onRetry}>
            Try again
          </button>
          <button className="sf-button secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="action-footnote">
          If the problem persists, try a different payment method or contact support.
        </p>
      </div>
    </div>
  );
}
