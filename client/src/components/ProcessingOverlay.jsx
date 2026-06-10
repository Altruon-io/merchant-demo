/**
 * ProcessingOverlay — full-screen blocking state while a payment is in flight
 * or we are waiting for an off-site / simulator outcome.
 *
 * Uses an opaque scrim so nothing bleeds through from the checkout beneath.
 * Optional cancel for "waiting for outcome" flows (Pix simulator tab open).
 */

import React from "react";
import "./ActionModals.css";

export default function ProcessingOverlay({
  label = "Processing your payment…",
  hint = "Please don't close or refresh this page.",
  onCancel,
  cancelLabel = "Cancel payment",
}) {
  return (
    <div className="overlay overlay-blocking processing-overlay" aria-live="polite" aria-busy="true">
      <div className="processing-card" role="status">
        <div className="processing-spinner-wrap" style={{ color: "var(--sf-primary)" }}>
          <div className="spinner spinner-lg" />
        </div>
        <h3>{label}</h3>
        <p>{hint}</p>
        {onCancel && (
          <button type="button" className="sf-button secondary processing-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
