/**
 * SandboxTestCredentials — copyable PagBrasil test values for the SDK iframe.
 *
 * Card and Pix fields live inside the Altruon checkout iframe (PCI scope),
 * so we cannot auto-fill them from the merchant page. Instead we show a
 * compact, copy-friendly reference panel — the same pattern Stripe and
 * Adyen use in their test-mode docs.
 */

import React, { useState } from "react";
import { PAGBRASIL_SANDBOX } from "../utils/testFixtures.js";
import "./SandboxTestCredentials.css";

function CopyRow({ label, value }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="sandbox-cred-row">
      <span className="sandbox-cred-label">{label}</span>
      <span className="sandbox-cred-value mono">{value}</span>
      <button
        type="button"
        className="sandbox-cred-copy"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function SandboxTestCredentials({ method }) {
  const normalized = String(method || "").toLowerCase();
  const isCard = normalized === "card";
  const isPix = normalized === "pix";

  if (!isCard && !isPix) return null;

  const rows = isCard ? PAGBRASIL_SANDBOX.card : PAGBRASIL_SANDBOX.pix;
  const title = isCard ? "PagBrasil sandbox card" : "PagBrasil sandbox Pix";
  const hint = isCard
    ? "Paste these into the secure payment form below."
    : "Enter this CPF in the Pix form below.";

  return (
    <aside className="sandbox-creds" aria-label="Sandbox test credentials">
      <div className="sandbox-creds-header">
        <span className="sandbox-creds-badge">Sandbox</span>
        <strong>{title}</strong>
      </div>
      <p className="sandbox-creds-hint">{hint}</p>
      <div className="sandbox-creds-list">
        {rows.map((row) => (
          <CopyRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </aside>
  );
}
