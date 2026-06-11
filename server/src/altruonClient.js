/**
 * altruonClient.js — a tiny, dependency-free client for the Altruon API.
 *
 * This is the ONLY place in the demo that talks to Altruon with the SECRET key.
 * The browser never sees the secret key: the frontend calls our own /api/*
 * routes (see routes.js), and those routes call the helpers below.
 *
 * Altruon API surface used by this demo:
 *
 *   POST {api}/api/session/v1/create                                   (x-secret-key)
 *     → creates a checkout session; returns { session_id, available_payment_methods }
 *
 *   POST {api}/api/checkout/v1/{billingConnectionId}/estimate-subscription
 *     → prices a subscription (subtotal / discount / tax / total) without
 *       creating anything; used for the live order summary
 *
 *   GET  {api}/api/v1/transaction/{id}/details                         (x-secret-key)
 *     → full transaction report after payment, incl. deep links to your
 *       payment gateway and billing provider dashboards
 *
 * Docs: https://docs.altruon.io/docs/developers/altruon-js/session-api
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load server/.env relative to THIS file (not the process cwd), so the
// backend finds its configuration no matter where it's started from
// (repo root via `npm run dev`, the server folder, a process manager, ...).
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

/* ──────────────────────────────────────────────────────────────────────────
 * Domain / environment resolution
 *
 * Merchants configure ALTRUON_DOMAIN in .env. We accept several formats and
 * normalize them into:
 *   - tenant:     the subdomain Altruon knows you by (e.g. "mycompany").
 *                 The frontend SDK needs this for `altruon.init(pk, tenant)`.
 *   - apiBaseUrl: the tenant-scoped API origin, e.g.
 *                 https://mycompany.api.sandbox.altruon.io
 *
 * Accepted ALTRUON_DOMAIN values:
 *   "mycompany.sandbox.altruon.io"      → checkout domain (most common)
 *   "mycompany.api.sandbox.altruon.io"  → API domain (used as-is)
 *   "mycompany"                         → bare tenant; environment is then
 *                                         inferred from the publishable key
 *                                         prefix (pk_sandbox_/pk_altruon_).
 * ────────────────────────────────────────────────────────────────────────── */

function resolveAltruonTarget() {
  const rawDomain = (process.env.ALTRUON_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const publishableKey = (process.env.ALTRUON_PUBLISHABLE_KEY || "").trim();

  if (!rawDomain) {
    return { tenant: null, apiBaseUrl: null };
  }

  const parts = rawDomain.split(".");
  const tenant = parts[0];

  // Bare tenant name ("mycompany") — infer the environment from the key prefix,
  // mirroring what the Altruon JS SDK does on the frontend.
  if (parts.length === 1) {
    if (publishableKey.startsWith("pk_altruon_")) {
      return { tenant, apiBaseUrl: `https://${tenant}.api.altruon.io` };
    }
    if (publishableKey.startsWith("pk_local_")) {
      return { tenant, apiBaseUrl: `http://${tenant}.api.localhost.internal:8080` };
    }
    // Default to sandbox — the safe place to experiment.
    return { tenant, apiBaseUrl: `https://${tenant}.api.sandbox.altruon.io` };
  }

  // Already an API domain ("mycompany.api.sandbox.altruon.io") — use as-is.
  if (parts[1] === "api") {
    const scheme = rawDomain.includes("localhost") ? "http" : "https";
    return { tenant, apiBaseUrl: `${scheme}://${rawDomain}` };
  }

  // Checkout domain ("mycompany.sandbox.altruon.io") — insert the ".api" hop.
  const scheme = rawDomain.includes("localhost") ? "http" : "https";
  const rest = parts.slice(1).join(".");
  return { tenant, apiBaseUrl: `${scheme}://${tenant}.api.${rest}` };
}

/**
 * Central, resolved configuration for the demo.
 * Re-read lazily so `node --watch` restarts pick up .env edits.
 */
export function getConfig() {
  const { tenant, apiBaseUrl } = resolveAltruonTarget();

  return {
    // Credentials
    secretKey: (process.env.ALTRUON_SECRET_KEY || "").trim(),
    publishableKey: (process.env.ALTRUON_PUBLISHABLE_KEY || "").trim(),
    tenant,
    apiBaseUrl,

    // What the demo sells (overridable per-request from the demo's config UI)
    billingConnectionId: (process.env.BILLING_CONNECTION_ID || "").trim(),
    planId: (process.env.PLAN_ID || "").trim(),
    addonIds: (process.env.ADDON_IDS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    currency: (process.env.CURRENCY || "EUR").trim().toUpperCase(),

    // Optional storefront branding defaults (the UI can override these too)
    merchantDisplayName: (process.env.MERCHANT_DISPLAY_NAME || "").trim(),
    merchantLogoUrl: (process.env.MERCHANT_LOGO_URL || "").trim(),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Low-level fetch wrapper
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Error subclass that carries the upstream HTTP status + parsed body, so
 * routes.js can translate Altruon errors into actionable messages
 * ("invalid secret key" vs "unknown plan id" vs "domain unreachable").
 */
export class AltruonApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "AltruonApiError";
    this.status = status ?? null; // HTTP status from Altruon, null = network error
    this.body = body ?? null;     // Parsed JSON error body when available
  }
}

/**
 * Perform a JSON request against the tenant-scoped Altruon API.
 *
 * @param {string} path    e.g. "/api/session/v1/create"
 * @param {object} options { method, body, auth } — auth=true adds x-secret-key
 */
async function altruonFetch(path, { method = "GET", body, auth = false } = {}) {
  const { apiBaseUrl, secretKey } = getConfig();

  if (!apiBaseUrl) {
    throw new AltruonApiError("ALTRUON_DOMAIN is not configured. Set it in server/.env.");
  }

  const headers = { "Content-Type": "application/json" };
  if (auth) {
    // Backend-to-backend authentication. See:
    // https://docs.altruon.io/docs/developers/altruon-js/session-api
    headers["x-secret-key"] = secretKey;
  }

  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    // DNS failure / refused connection — almost always a wrong ALTRUON_DOMAIN.
    throw new AltruonApiError(
      `Could not reach the Altruon API at ${apiBaseUrl} (${networkError.message}). ` +
        "Check ALTRUON_DOMAIN in server/.env.",
      { status: null }
    );
  }

  // Try to parse JSON either way — Altruon returns structured error bodies.
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON body (rare) — keep data = null */
  }

  if (!response.ok) {
    const message =
      data?.message || data?.error?.message || data?.error || data?.detail ||
      `Altruon API responded with ${response.status} ${response.statusText}`;
    throw new AltruonApiError(message, { status: response.status, body: data });
  }

  return data;
}

/* ──────────────────────────────────────────────────────────────────────────
 * High-level helpers used by routes.js
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Create a checkout session.
 * The session is the server-side "source of truth" the embedded Altruon
 * component binds to. Requires the SECRET key.
 *
 * @param {object} sessionPayload Full body for POST /api/session/v1/create
 * @returns {{ session_id: string, available_payment_methods?: Array }}
 */
export function createSession(sessionPayload) {
  return altruonFetch("/api/session/v1/create", {
    method: "POST",
    body: sessionPayload,
    auth: true,
  });
}

/**
 * Price a subscription without creating anything — returns subtotal,
 * aggregate discount, tax and the per-line breakdown. Powers the live
 * order summary (and re-runs when the shopper changes country or coupon).
 *
 * @param {string} billingConnectionId UUID of the billing provider connection
 * @param {object} estimatePayload     { currency, couponCodes, customerBillingInfo, subscriptionItems }
 */
export function estimateSubscription(billingConnectionId, estimatePayload) {
  return altruonFetch(
    `/api/checkout/v1/${encodeURIComponent(billingConnectionId)}/estimate-subscription`,
    { method: "POST", body: estimatePayload }
  );
}

/**
 * Fetch the full transaction report after a payment, including deep links
 * to the payment gateway (urlAtGateway) and billing provider (urlAtBilling)
 * dashboards. Requires the SECRET key.
 */
export function getTransactionDetails(transactionId) {
  return altruonFetch(`/api/v1/transaction/${encodeURIComponent(transactionId)}/details`, {
    auth: true,
  });
}
