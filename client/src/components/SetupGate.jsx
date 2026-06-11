/**
 * SetupGate — Altruon-branded onboarding & credential validation screen.
 *
 * Before showing the storefront, the gate runs one health-check against the
 * demo backend (POST /api/validate), which in turn probes the Altruon API
 * with your configured credentials. The result is a checklist:
 *
 *   ✓ Secret key configured            (server/.env)
 *   ✓ Publishable key configured       (server/.env)
 *   ✓ Altruon domain configured        (server/.env)
 *   ✓ Billing connection id set        (.env or config panel)
 *   ✓ Plan id set                      (.env or config panel)
 *   ✓ Altruon API reachable & credentials accepted   (live probe)
 *
 * If everything passes the gate renders its children (the storefront).
 * Otherwise it explains exactly what to fix, with links to the Altruon docs —
 * a merchant should never see a broken checkout without knowing why.
 *
 * The "validated" flag is cached in sessionStorage so returning from a
 * payment redirect (3-D Secure etc.) doesn't re-run the probe.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useDemoConfig } from "../context/DemoConfigContext.jsx";
import { validateCredentials } from "../services/api.js";
import "./SetupGate.css";

const VALIDATED_FLAG = "altruon-merchant-demo-validated";

const CheckIcon = ({ ok }) =>
  ok ? (
    <svg className="check-icon ok" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#01AB4B" fillOpacity="0.12" />
      <path d="M6 10.2L8.6 12.8L14 7.4" stroke="#01AB4B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg className="check-icon fail" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#EF4444" fillOpacity="0.12" />
      <path d="M7 7L13 13M13 7L7 13" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );

export default function SetupGate({ children }) {
  const { serverConfig, configError, checkoutOverrides } = useDemoConfig();

  // 'idle' → waiting for config | 'checking' | 'ok' | 'failed'
  const [status, setStatus] = useState(
    sessionStorage.getItem(VALIDATED_FLAG) === "1" ? "ok" : "idle"
  );
  const [checks, setChecks] = useState([]);

  const runValidation = useCallback(async () => {
    setStatus("checking");
    try {
      const result = await validateCredentials(checkoutOverrides);
      setChecks(result.checks || []);
      if (result.ok) {
        sessionStorage.setItem(VALIDATED_FLAG, "1");
        setStatus("ok");
      } else {
        sessionStorage.removeItem(VALIDATED_FLAG);
        setStatus("failed");
      }
    } catch (err) {
      // The backend itself errored / is unreachable.
      setChecks([
        {
          id: "backend",
          label: "Demo backend reachable",
          ok: false,
          message: `${err.message} — start it with \`npm run dev\` from the project root.`,
        },
      ]);
      setStatus("failed");
    }
  }, [checkoutOverrides]);

  // Kick off validation once the public config has loaded (skipped entirely
  // when a previous validation already succeeded in this browser session).
  useEffect(() => {
    if (status === "idle" && serverConfig) runValidation();
  }, [status, serverConfig, runValidation]);

  /* ── Render states ──────────────────────────────────────────────────── */

  if (status === "ok") return children;

  return (
    <div className="setup-gate">
      {/* Navy hero bar, mirroring altruon.io */}
      <header className="setup-hero">
        <img src="/altruon/logo-white.svg" alt="Altruon" className="setup-logo" />
        <span className="setup-hero-tag">Merchant Demo</span>
      </header>

      <main className="setup-body">
        {configError ? (
          /* The demo backend is not running at all. */
          <div className="setup-card fade-up">
            <h1>Backend not reachable</h1>
            <p className="setup-sub">{configError}</p>
            <button className="at-button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : status === "checking" || status === "idle" ? (
          /* Probe in flight. */
          <div className="setup-card setup-loading fade-up">
            <div className="spinner" style={{ color: "var(--at-green)" }} />
            <h1>Checking your Altruon setup…</h1>
            <p className="setup-sub">
              Verifying credentials and configuration against the Altruon API.
            </p>
          </div>
        ) : (
          /* Validation failed — show the actionable checklist. */
          <div className="setup-card fade-up">
            <h1>Let&apos;s connect your Altruon account</h1>
            <p className="setup-sub">
              This demo needs a few values before it can render the checkout. Fix the items
              below, then re-run the checks. Keys live in <code>server/.env</code> (copy{" "}
              <code>server/.env.example</code> to get started); billing connection and plan can
              also be changed from the <strong>gear icon</strong> at the bottom right.
            </p>

            <ul className="setup-checklist">
              {checks.map((check) => (
                <li key={check.id} className={check.ok ? "ok" : "fail"}>
                  <CheckIcon ok={check.ok} />
                  <div>
                    <span className="check-label">{check.label}</span>
                    {!check.ok && check.message && (
                      <span className="check-message">{check.message}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="setup-actions">
              <button className="at-button" onClick={runValidation}>
                Re-run checks
              </button>
              <a
                className="at-button ghost"
                href="https://docs.altruon.io/docs/developers/altruon-js/quick-start"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the quick-start guide
              </a>
            </div>

            <div className="setup-docs">
              <span>Helpful docs:</span>
              <a href="https://docs.altruon.io/docs/intro" target="_blank" rel="noopener noreferrer">
                What is Altruon?
              </a>
              <a
                href="https://docs.altruon.io/docs/developers/altruon-js/session-api"
                target="_blank"
                rel="noopener noreferrer"
              >
                Session API
              </a>
              <a
                href="https://docs.altruon.io/docs/developers/altruon-js/callbacks"
                target="_blank"
                rel="noopener noreferrer"
              >
                SDK callbacks
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
