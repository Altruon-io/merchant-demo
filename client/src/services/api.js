/**
 * services/api.js — the frontend's ONLY data layer.
 *
 * Every function here calls the demo's OWN backend (server/, proxied under
 * /api by Vite). The browser never calls the Altruon API directly with a
 * secret key — the one exception is the Altruon JS SDK itself, which talks
 * to Altruon with the PUBLISHABLE key (safe to expose by design).
 *
 * Backend route documentation lives in server/src/routes.js.
 */

/** Shared response handler: unwraps JSON and surfaces server error messages. */
async function handleResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON response body */
  }

  if (!response.ok) {
    const message =
      data?.error || data?.message || `Request failed (${response.status} ${response.statusText})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

/**
 * Public configuration: publishable key, tenant, checkout defaults and
 * storefront branding defaults. Fetched once on app start (see App.jsx).
 */
export async function fetchConfig() {
  return handleResponse(await fetch("/api/config"));
}

/**
 * Credential / configuration health-check. Returns { ok, checks: [...] }
 * which SetupGate renders as a checklist with fix-it instructions.
 *
 * @param {object} overrides Non-secret config overrides from the config panel
 */
export async function validateCredentials(overrides) {
  return handleResponse(
    await fetch("/api/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides }),
    })
  );
}

/**
 * Live price preview (subtotal / discount / tax / total) for the order
 * summary. Re-invoked whenever the shopper changes country or coupons.
 *
 * @param {{ country?: string, couponCodes?: string[], overrides?: object }} params
 */
export async function fetchEstimate({ country, billingAddress, couponCodes, overrides }) {
  return handleResponse(
    await fetch("/api/estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country, billingAddress, couponCodes, overrides }),
    })
  );
}

/**
 * Create an Altruon checkout session via our backend.
 * Returns { sessionId, availablePaymentMethods }.
 *
 * `paymentMethod` scopes the session to a single method: the checkout page
 * first creates an unscoped session to DISCOVER the routed methods, then a
 * scoped one per selection so the embedded component only shows that
 * method's form.
 *
 * The redirectUrl points at this demo's /result page: after off-site flows
 * (3-D Secure, bank login, ...) Altruon appends ?trx_id=<id> and sends the
 * shopper back there.
 */
export async function createCheckoutSession({
  customer,
  country,
  billingAddress,
  couponCodes,
  paymentMethod,
  branding,
  overrides,
}) {
  return handleResponse(
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        country,
        billingAddress,
        couponCodes,
        paymentMethod,
        branding,
        overrides,
        redirectUrl: `${window.location.origin}/result`,
      }),
    })
  );
}

/**
 * Full transaction report (gateway + billing provider details and deep
 * links) for the /result page.
 */
export async function fetchTransaction(transactionId) {
  return handleResponse(await fetch(`/api/transactions/${encodeURIComponent(transactionId)}`));
}
