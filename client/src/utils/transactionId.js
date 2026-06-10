/**
 * transactionId.js — helpers for Altruon SDK success / redirect payloads.
 *
 * The checkout iframe may send transactionId, newTransactionId, or
 * transactionid depending on gateway and SDK version. Always extract
 * defensively and validate UUID shape before calling the backend.
 */

export const UUID_SHAPE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a well-formed UUID string (not "undefined", empty, etc.). */
export function isValidTransactionId(value) {
  return UUID_SHAPE_REGEX.test(String(value || "").trim());
}

/**
 * Pull a transaction id from an SDK onSuccess payload or redirect query param.
 * Returns null when nothing usable is present.
 */
export function extractTransactionId(data) {
  if (data == null) return null;

  if (typeof data === "string") {
    const trimmed = data.trim();
    return isValidTransactionId(trimmed) ? trimmed : null;
  }

  const candidates = [
    data.transactionId,
    data.newTransactionId,
    data.transactionid,
    data.trx_id,
    data.trxId,
    data.id,
  ];

  for (const candidate of candidates) {
    if (isValidTransactionId(candidate)) return String(candidate).trim();
  }

  return null;
}
