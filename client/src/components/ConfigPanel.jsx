/**
 * ConfigPanel — floating gear button + Altruon-branded settings drawer.
 *
 * Lets a merchant (or prospect) reconfigure the demo WITHOUT restarting:
 *
 *   1. Altruon settings — billing connection id, plan id, addon ids and
 *      currency. These are sent as overrides with every estimate / session
 *      call; the server keeps using its .env values for anything not set.
 *
 *   2. Storefront branding — display name, logo (URL or uploaded file) and
 *      primary color. Changing these instantly re-brands the checkout, so a
 *      prospect can see THEIR OWN brand on an Altruon checkout in seconds.
 *
 * Secrets are intentionally absent: the secret key can only be set in
 * server/.env (see the security note in the README).
 *
 * Everything is persisted in sessionStorage (via DemoConfigContext), which
 * survives payment redirects but resets when the tab closes.
 */

import React, { useEffect, useRef, useState } from "react";
import { useDemoConfig, MYSAAS_BRAND } from "../context/DemoConfigContext.jsx";
import "./ConfigPanel.css";

/** Currencies offered in the picker — extend freely. */
const CURRENCIES = ["EUR", "USD", "GBP", "BRL", "INR", "JPY", "MXN", "PLN", "SEK", "CHF"];

/** Max uploaded logo size — data URLs live in sessionStorage, keep them small. */
const MAX_LOGO_BYTES = 200 * 1024;

export default function ConfigPanel() {
  const { serverConfig, checkout, brand, overrides, setOverrides, resetOverrides } =
    useDemoConfig();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [logoError, setLogoError] = useState("");
  const fileInputRef = useRef(null);

  // (Re)build the editable draft each time the drawer opens.
  useEffect(() => {
    if (open) {
      setDraft({
        billingConnectionId: checkout.billingConnectionId,
        planId: checkout.planId,
        addonIds: checkout.addonIds.join(", "),
        currency: checkout.currency,
        displayName: brand.displayName,
        logoUrl: brand.logoUrl,
        primaryColor: brand.primaryColor,
      });
      setLogoError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!serverConfig) return null; // nothing to configure until config loads

  const setField = (name, value) => setDraft((d) => ({ ...d, [name]: value }));

  /** Convert an uploaded image to a data URL so it needs no hosting. */
  const handleLogoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Please choose an image under 200 KB (SVG or PNG works best).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoError("");
      setField("logoUrl", reader.result);
    };
    reader.readAsDataURL(file);
  };

  /** Commit the draft to the shared context (and sessionStorage). */
  const apply = () => {
    setOverrides({
      billingConnectionId: draft.billingConnectionId.trim(),
      planId: draft.planId.trim(),
      addonIds: draft.addonIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      currency: draft.currency,
      // Only store branding values that differ from the MySaas defaults, so
      // "no customization" cleanly falls back to .env → MySaas.
      displayName: draft.displayName !== MYSAAS_BRAND.displayName ? draft.displayName.trim() : "",
      logoUrl: draft.logoUrl !== MYSAAS_BRAND.logoUrl ? draft.logoUrl : "",
      primaryColor:
        draft.primaryColor.toLowerCase() !== MYSAAS_BRAND.primaryColor.toLowerCase()
          ? draft.primaryColor
          : "",
    });
    setOpen(false);
  };

  const reset = () => {
    resetOverrides();
    setOpen(false);
  };

  const hasOverrides = Object.values(overrides).some((v) =>
    Array.isArray(v) ? v.length : Boolean(v)
  );

  return (
    <>
      {/* Floating gear button — always available, on every page. */}
      <button
        className="config-fab"
        onClick={() => setOpen(true)}
        title="Demo configuration"
        aria-label="Open demo configuration"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
        {hasOverrides && <span className="config-fab-dot" title="Custom configuration active" />}
      </button>

      {open && draft && (
        <div className="overlay config-overlay" onClick={() => setOpen(false)}>
          <aside className="config-drawer" onClick={(e) => e.stopPropagation()}>
            {/* Navy header with the white Altruon logo, like docs.altruon.io */}
            <header className="config-header">
              <img src="/altruon/logo-white.svg" alt="Altruon" />
              <h2>Demo configuration</h2>
              <button className="config-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>

            <div className="config-body">
              {/* ── Read-only environment info ───────────────────────────── */}
              <section>
                <h3>Environment</h3>
                <p className="config-hint">
                  Keys and domain are loaded from <code>server/.env</code> and can&apos;t be
                  changed here — the secret key never reaches the browser.
                </p>
                <dl className="config-env">
                  <div>
                    <dt>Tenant</dt>
                    <dd className="mono">{serverConfig.tenant || "—"}</dd>
                  </div>
                  <div>
                    <dt>API</dt>
                    <dd className="mono">{serverConfig.apiBaseUrl || "—"}</dd>
                  </div>
                  <div>
                    <dt>Publishable key</dt>
                    <dd className="mono">
                      {serverConfig.publishableKey
                        ? `${serverConfig.publishableKey.slice(0, 14)}…`
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* ── Altruon checkout settings ────────────────────────────── */}
              <section>
                <h3>Altruon settings</h3>

                <div className="field">
                  <label htmlFor="cfg-bcid">Billing connection ID</label>
                  <input
                    id="cfg-bcid"
                    className="mono"
                    value={draft.billingConnectionId}
                    onChange={(e) => setField("billingConnectionId", e.target.value)}
                    placeholder="00000000-0000-0000-0000-000000000000"
                  />
                  <span className="hint">
                    UUID of the billing provider connection (Stripe, Chargebee, Recurly, …) the
                    subscription is created on. Find it in your{" "}
                    <a
                      href="https://docs.altruon.io/docs/category/integrations"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Altruon dashboard
                    </a>{" "}
                    under Integrations → Billing Providers.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="cfg-plan">Plan ID</label>
                  <input
                    id="cfg-plan"
                    className="mono"
                    value={draft.planId}
                    onChange={(e) => setField("planId", e.target.value)}
                    placeholder="price_..."
                  />
                  <span className="hint">
                    The plan&apos;s item-price id at your billing provider (e.g. a Stripe price
                    id). Exactly one plan per checkout — see the{" "}
                    <a
                      href="https://docs.altruon.io/docs/developers/altruon-js/session-api"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Session API docs
                    </a>
                    .
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="cfg-addons">Addon IDs (optional)</label>
                  <input
                    id="cfg-addons"
                    className="mono"
                    value={draft.addonIds}
                    onChange={(e) => setField("addonIds", e.target.value)}
                    placeholder="price_addon_a, price_addon_b"
                  />
                  <span className="hint">
                    Comma-separated recurring addon item-price ids, added on top of the plan.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="cfg-currency">Currency</label>
                  <select
                    id="cfg-currency"
                    value={draft.currency}
                    onChange={(e) => setField("currency", e.target.value)}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <span className="hint">
                    Must exist on the plan price at your billing provider.
                  </span>
                </div>
              </section>

              {/* ── Storefront branding ──────────────────────────────────── */}
              <section>
                <h3>Storefront branding</h3>
                <p className="config-hint">
                  Make the checkout look like <em>your</em> product — the header, summary and the
                  embedded Altruon payment component all follow these settings.
                </p>

                <div className="field">
                  <label htmlFor="cfg-name">Display name</label>
                  <input
                    id="cfg-name"
                    value={draft.displayName}
                    onChange={(e) => setField("displayName", e.target.value)}
                    placeholder="MySaas"
                  />
                </div>

                <div className="field">
                  <label htmlFor="cfg-logo">Logo URL</label>
                  <input
                    id="cfg-logo"
                    value={draft.logoUrl.startsWith("data:") ? "(uploaded file)" : draft.logoUrl}
                    onChange={(e) => setField("logoUrl", e.target.value)}
                    placeholder="https://yourcdn.com/logo.svg"
                    readOnly={draft.logoUrl.startsWith("data:")}
                  />
                  <span className="hint">
                    Paste a URL, or{" "}
                    <button
                      type="button"
                      className="config-upload-link"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      upload an image
                    </button>{" "}
                    (SVG/PNG, &lt; 200 KB).
                    {draft.logoUrl.startsWith("data:") && (
                      <>
                        {" "}
                        <button
                          type="button"
                          className="config-upload-link"
                          onClick={() => setField("logoUrl", MYSAAS_BRAND.logoUrl)}
                        >
                          Remove upload
                        </button>
                      </>
                    )}
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleLogoUpload}
                  />
                  {logoError && <span className="hint config-error">{logoError}</span>}
                </div>

                <div className="field">
                  <label htmlFor="cfg-color">Primary color</label>
                  <div className="config-color-row">
                    <input
                      id="cfg-color"
                      type="color"
                      value={draft.primaryColor}
                      onChange={(e) => setField("primaryColor", e.target.value)}
                    />
                    <span className="mono">{draft.primaryColor}</span>
                  </div>
                </div>

                {/* Live preview of the brand header */}
                <div className="config-preview">
                  <span className="config-preview-label">Preview</span>
                  <div className="config-preview-card">
                    <img src={draft.logoUrl} alt="" onError={(e) => (e.target.style.display = "none")} />
                    <strong>{draft.displayName || "MySaas"}</strong>
                    <button style={{ background: draft.primaryColor }}>Subscribe</button>
                  </div>
                </div>
              </section>
            </div>

            <footer className="config-footer">
              <button className="at-button ghost" onClick={reset}>
                Reset to .env defaults
              </button>
              <button className="at-button" onClick={apply}>
                Apply changes
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
