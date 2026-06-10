/**
 * testFixtures.js — sandbox dummy data for faster checkout testing.
 *
 * Values align with PagBrasil sandbox documentation and the Blacknut demo.
 * Only surfaced in sandbox environments (see CheckoutPage).
 */

/** PagBrasil sandbox payment credentials (iframe fields — copy/paste only). */
export const PAGBRASIL_SANDBOX = {
  card: [
    { label: "Card number", value: "4984123412341234" },
    { label: "CVV", value: "123" },
    { label: "Expiration", value: "12/29" },
    { label: "CPF", value: "91051605962" },
  ],
  pix: [{ label: "CPF", value: "91051605962" }],
};

/** Merchant-side checkout form dummy data. */
export function getDummyCheckoutData({ brazilLocked, country }) {
  const isBrazil = brazilLocked || country === "BR";

  if (isBrazil) {
    return {
      customer: {
        firstName: "João",
        lastName: "Silva",
        email: "tester@example.com",
        phone: "11999999999",
      },
      billingAddress: {
        street: "Test Street 1",
        number: "123",
        city: "Sao Paulo",
        state: "São Paulo",
        zipCode: "01234567",
      },
      country: "BR",
    };
  }

  return {
    customer: {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "tester@example.com",
      phone: "+1 555 010 0199",
    },
    billingAddress: {
      street: "123 Market Street",
      number: "450",
      city: "San Francisco",
      state: "CA",
      zipCode: "94105",
    },
    country: country || "US",
  };
}

export function isSandboxEnvironment(serverConfig) {
  const pk = serverConfig?.publishableKey || "";
  if (pk.startsWith("pk_sandbox_") || pk.startsWith("pk_local_")) return true;
  const api = serverConfig?.apiBaseUrl || "";
  return api.includes("sandbox") || api.includes("localhost");
}
