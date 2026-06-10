/**
 * RedirectModal — disclaimer shown before sending the shopper off-site.
 *
 * Fired by the SDK's `onActionRequired` callback with actionType REDIRECT
 * (3-D Secure verification, bank login for open banking, wallet apps, ...).
 *
 * Best practice: never yank the shopper to another domain without warning.
 * We explain where they're going, show a short countdown, and offer an
 * explicit "Continue" — with auto-redirect as a safety net so the payment
 * isn't abandoned if they hesitate.
 */

import React, { useEffect, useState } from "react";
import "./ActionModals.css";

const COUNTDOWN_SECONDS = 8;

export default function RedirectModal({ url, message, onCancel }) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  const proceed = () => {
    // Full-page navigation: the payment provider will eventually send the
    // shopper back to our /result page (the session's redirectUrl).
    window.location.href = url;
  };

  // Tick once per second; auto-continue at zero.
  useEffect(() => {
    if (secondsLeft <= 0) {
      proceed();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* invalid URL — leave host empty */
  }

  return (
    <div className="overlay overlay-blocking">
      <div className="modal action-modal" role="dialog" aria-modal="true">
        <div className="action-icon redirect">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path
              d="M10 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5M14 3h7v7M21 3l-9 9"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h3>You&apos;re being redirected</h3>
        <p className="action-text">
          {message ||
            "To complete this payment securely, you'll be redirected to your bank or payment provider to confirm."}
        </p>
        {host && (
          <p className="action-destination">
            Destination: <span className="mono">{host}</span>
          </p>
        )}

        <div className="action-buttons">
          <button className="sf-button" onClick={proceed}>
            Continue ({secondsLeft}s)
          </button>
          <button className="sf-button secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>

        <p className="action-footnote">
          You&apos;ll be brought back here automatically once you&apos;re done.
        </p>
      </div>
    </div>
  );
}
