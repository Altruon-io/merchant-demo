/**
 * addressValidation.js — billing address helpers for the Merchant Demo.
 *
 * Gateways like PagBrasil (Brazil / BRL) require a complete billing address
 * with country locked to BR and a valid CEP (postal code). Other countries
 * use simpler patterns — good enough for a demo checkout, not a full
 * libpostal replacement.
 *
 * SDK field names (see altruon.setAddresses): street, number, city, state,
 * zipCode, country — https://docs.altruon.io/docs/developers/altruon-js/configuration
 */

/** ISO 3166-1 alpha-2 → postal code validation. */
const POSTAL_RULES = {
  US: {
    label: "ZIP code",
    placeholder: "94105",
    pattern: /^\d{5}(-\d{4})?$/,
    hint: "5 digits, or 5+4 (e.g. 94105 or 94105-1234)",
    normalize: (v) => {
      const digits = v.replace(/\D/g, "");
      if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
      return digits.slice(0, 5);
    },
  },
  GB: {
    label: "Postcode",
    placeholder: "SW1A 1AA",
    pattern: /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
    hint: "UK postcode (e.g. SW1A 1AA)",
    normalize: (v) => v.trim().toUpperCase().replace(/\s+/, " "),
  },
  ES: { label: "Postal code", placeholder: "28001", pattern: /^\d{5}$/, hint: "5 digits", normalize: (v) => v.replace(/\D/g, "").slice(0, 5) },
  FR: { label: "Postal code", placeholder: "75001", pattern: /^\d{5}$/, hint: "5 digits", normalize: (v) => v.replace(/\D/g, "").slice(0, 5) },
  DE: { label: "Postal code", placeholder: "10115", pattern: /^\d{5}$/, hint: "5 digits", normalize: (v) => v.replace(/\D/g, "").slice(0, 5) },
  IT: { label: "Postal code", placeholder: "00118", pattern: /^\d{5}$/, hint: "5 digits", normalize: (v) => v.replace(/\D/g, "").slice(0, 5) },
  NL: {
    label: "Postal code",
    placeholder: "1012 AB",
    pattern: /^\d{4}\s?[A-Z]{2}$/i,
    hint: "4 digits + 2 letters (e.g. 1012 AB)",
    normalize: (v) => {
      const clean = v.trim().toUpperCase().replace(/\s/g, "");
      if (clean.length >= 6) return `${clean.slice(0, 4)} ${clean.slice(4, 6)}`;
      return clean;
    },
  },
  PT: {
    label: "Postal code",
    placeholder: "1000-001",
    pattern: /^\d{4}-\d{3}$/,
    hint: "Format ####-###",
    normalize: (v) => {
      const digits = v.replace(/\D/g, "").slice(0, 7);
      if (digits.length > 4) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
      return digits;
    },
  },
  BR: {
    label: "CEP",
    placeholder: "01310-100",
    pattern: /^\d{5}-?\d{3}$/,
    hint: "8 digits (e.g. 01310-100)",
    normalize: (v) => {
      const digits = v.replace(/\D/g, "").slice(0, 8);
      if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
      return digits;
    },
  },
  IN: { label: "PIN code", placeholder: "110001", pattern: /^\d{6}$/, hint: "6 digits", normalize: (v) => v.replace(/\D/g, "").slice(0, 6) },
  MX: { label: "Postal code", placeholder: "01000", pattern: /^\d{5}$/, hint: "5 digits", normalize: (v) => v.replace(/\D/g, "").slice(0, 5) },
  JP: {
    label: "Postal code",
    placeholder: "100-0001",
    pattern: /^\d{3}-?\d{4}$/,
    hint: "7 digits (e.g. 100-0001)",
    normalize: (v) => {
      const digits = v.replace(/\D/g, "").slice(0, 7);
      if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return digits;
    },
  },
};

/** Brazilian states (UF) — PagBrasil expects the official abbreviation. */
export const BR_STATES = [
  { code: "AC", name: "Acre" },
  { code: "AL", name: "Alagoas" },
  { code: "AP", name: "Amapá" },
  { code: "AM", name: "Amazonas" },
  { code: "BA", name: "Bahia" },
  { code: "CE", name: "Ceará" },
  { code: "DF", name: "Distrito Federal" },
  { code: "ES", name: "Espírito Santo" },
  { code: "GO", name: "Goiás" },
  { code: "MA", name: "Maranhão" },
  { code: "MT", name: "Mato Grosso" },
  { code: "MS", name: "Mato Grosso do Sul" },
  { code: "MG", name: "Minas Gerais" },
  { code: "PA", name: "Pará" },
  { code: "PB", name: "Paraíba" },
  { code: "PR", name: "Paraná" },
  { code: "PE", name: "Pernambuco" },
  { code: "PI", name: "Piauí" },
  { code: "RJ", name: "Rio de Janeiro" },
  { code: "RN", name: "Rio Grande do Norte" },
  { code: "RS", name: "Rio Grande do Sul" },
  { code: "RO", name: "Rondônia" },
  { code: "RR", name: "Roraima" },
  { code: "SC", name: "Santa Catarina" },
  { code: "SP", name: "São Paulo" },
  { code: "SE", name: "Sergipe" },
  { code: "TO", name: "Tocantins" },
];

/** Map a Brazilian state name or UF code to the official two-letter code. */
export function brazilStateToCode(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const byCode = BR_STATES.find((s) => s.code === trimmed.toUpperCase());
  if (byCode) return byCode.code;

  const byName = BR_STATES.find(
    (s) => s.name.localeCompare(trimmed, "pt-BR", { sensitivity: "base" }) === 0
  );
  return byName?.code || "";
}

export function postalRuleFor(country) {
  return POSTAL_RULES[country] || {
    label: "Postal code",
    placeholder: "",
    pattern: /^.{2,12}$/,
    hint: "Enter a valid postal code for your country",
    normalize: (v) => v.trim(),
  };
}

export function normalizePostalCode(country, value) {
  if (!value) return "";
  return postalRuleFor(country).normalize(String(value));
}

export function validatePostalCode(country, value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Postal code is required";
  const normalized = normalizePostalCode(country, trimmed);
  const { pattern, hint } = postalRuleFor(country);
  if (!pattern.test(normalized)) return `Invalid ${postalRuleFor(country).label.toLowerCase()}. ${hint}`;
  return null;
}

/**
 * True when the routed gateway is PagBrasil (or checkout currency is BRL).
 * PagBrasil requires billing country BR and a complete address.
 */
export function requiresBrazilBilling({ currency, gateway }) {
  if (currency === "BRL") return true;
  return String(gateway || "").toLowerCase() === "pagbrasil";
}

const EMPTY_ADDRESS = { street: "", number: "", city: "", state: "", zipCode: "" };

/**
 * Validate customer + billing fields before payment.
 * Returns { ok, errors } where errors is { fieldName: message }.
 */
export function validateCheckoutForm({
  customer,
  billingAddress,
  country,
  brazilLocked,
}) {
  const errors = {};
  const addr = billingAddress || EMPTY_ADDRESS;

  if (!customer.email?.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
    errors.email = "Enter a valid email address";
  }

  if (!addr.street?.trim()) errors.street = "Address line is required";
  if (!addr.city?.trim()) errors.city = "City is required";

  const zipError = validatePostalCode(country, addr.zipCode);
  if (zipError) errors.zipCode = zipError;

  if (brazilLocked || country === "BR") {
    if (!addr.state?.trim()) errors.state = "State is required for Brazilian payments";
    else if (!brazilStateToCode(addr.state)) {
      errors.state = "Select a valid Brazilian state from the list";
    }
    if (country !== "BR") errors.country = "Billing country must be Brazil (BR) for this payment method";
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/** Shape passed to altruon.setAddresses({ billing }). */
export function toSdkBillingAddress(country, billingAddress) {
  const addr = billingAddress || EMPTY_ADDRESS;
  const state =
    country === "BR"
      ? brazilStateToCode(addr.state) || undefined
      : addr.state.trim() || undefined;

  return {
    street: addr.street.trim(),
    number: addr.number.trim() || undefined,
    city: addr.city.trim(),
    state,
    zipCode: normalizePostalCode(country, addr.zipCode),
    country,
  };
}

/** Shape passed to our backend (session create / estimate). */
export function toApiBillingAddress(country, billingAddress) {
  return toSdkBillingAddress(country, billingAddress);
}
