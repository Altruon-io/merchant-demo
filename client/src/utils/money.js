/**
 * utils/money.js — currency formatting helpers.
 *
 * Altruon (like Stripe and most payment APIs) expresses amounts in MINOR
 * units: 1230 means €12.30 for EUR but ¥1230 for JPY, because currencies
 * differ in how many decimal places they use. Always convert before display.
 */

/** ISO 4217 currencies with NO minor unit (1 unit = 1 display unit). */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** ISO 4217 currencies with THREE decimal places. */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** Minor-unit divisor for a currency code (100 for most). */
export function currencyDivisor(currency) {
  const code = (currency || "USD").toUpperCase();
  if (ZERO_DECIMAL.has(code)) return 1;
  if (THREE_DECIMAL.has(code)) return 1000;
  return 100;
}

/**
 * Format a MINOR-unit amount for display, e.g. formatMoney("1230", "EUR")
 * → "€12.30". Accepts strings or numbers (API responses vary). Returns "—"
 * for null/undefined so callers can render placeholders safely.
 *
 * Use for: invoice amounts and other fields that return minor units.
 * (Transaction.amount is currently major units — use formatDecimalMoney there.)
 */
export function formatMoney(minorAmount, currency) {
  if (minorAmount === null || minorAmount === undefined || minorAmount === "") return "—";
  const value = Number(minorAmount) / currencyDivisor(currency);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(value);
}

/**
 * Format a MAJOR-unit (decimal) amount, e.g. formatDecimalMoney(59.9, "BRL")
 * → "R$59.90".
 *
 * Use for: the estimate-subscription API, which returns decimal amounts
 * (futureInvoiceAmountDue, invoiceSubtotal, totalTaxAmount, line items) —
 * unlike the transaction details API, which uses minor units.
 */
export function formatDecimalMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
  }).format(Number(amount));
}
