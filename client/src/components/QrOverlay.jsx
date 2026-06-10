/**
 * QrOverlay — scan-to-pay popup (Pix, UPI, …).
 *
 * PagBrasil Pix in sandbox often returns BOTH a QR image and a redirect URL
 * for the provider simulator. We show the QR for real-device testing and an
 * "Open simulator" button that opens the URL in a new tab while this page
 * waits for onSuccess / onFailure.
 */

import React from "react";
import "./ActionModals.css";

export default function QrOverlay({ qrData, redirectUrl, message, onOpenSimulator, onClose }) {
  const hasSimulator = Boolean(redirectUrl);

  return (
    <div className="overlay overlay-blocking">
      <div className="modal action-modal qr-modal" role="dialog" aria-modal="true">
        <button className="qr-close" onClick={onClose} aria-label="Cancel payment">
          ✕
        </button>

        <h3>{hasSimulator ? "Complete your Pix payment" : "Scan to pay"}</h3>
        <p className="action-text">
          {message ||
            (hasSimulator
              ? "Scan the QR code with your banking app, or open the PagBrasil sandbox simulator in a new tab."
              : "Open your banking app and scan this code to complete the payment.")}
        </p>

        <div className="qr-frame">
          {qrData ? (
            <img src={qrData} alt="Payment QR code" />
          ) : (
            <div className="processing-spinner-wrap" style={{ color: "var(--sf-primary)" }}>
              <div className="spinner spinner-lg" />
            </div>
          )}
        </div>

        {hasSimulator && (
          <div className="action-buttons">
            <button type="button" className="sf-button" onClick={onOpenSimulator}>
              Open simulator
            </button>
            <button type="button" className="sf-button secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        )}

        {!hasSimulator && (
          <>
            <div className="qr-waiting">
              <span className="qr-pulse" />
              Waiting for payment confirmation…
            </div>
            <p className="action-footnote">
              This screen updates automatically once your bank confirms the payment.
            </p>
          </>
        )}

        {hasSimulator && (
          <p className="action-footnote">
            Use <strong>Open simulator</strong> to complete payment in a new tab — this page stays
            open and updates automatically when payment confirms.
          </p>
        )}
      </div>
    </div>
  );
}
