/**
 * DemoConfigContext — single source of truth for demo configuration.
 *
 * Three layers, merged in priority order (highest wins):
 *
 *   1. Session overrides   — what the merchant typed into the config panel.
 *                            Persisted in sessionStorage so a page refresh
 *                            (e.g. coming back from a 3-D Secure redirect)
 *                            keeps the customization.
 *   2. Server defaults     — from server/.env, exposed via GET /api/config.
 *   3. MySaas fallbacks    — the fictional brand this demo ships with.
 *
 * Secrets are NOT part of this context: the secret key never leaves the
 * backend (see server/src/routes.js).
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchConfig } from "../services/api.js";

const STORAGE_KEY = "altruon-merchant-demo-overrides";

/** The demo's built-in fictional brand. */
export const MYSAAS_BRAND = {
  displayName: "MySaas",
  logoUrl: "/mysaas-logo.svg",
  primaryColor: "#6366F1", // indigo — see theme.css for the full palette
};

const DemoConfigContext = createContext(null);

function readStoredOverrides() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function DemoConfigProvider({ children }) {
  // Raw response of GET /api/config (null while loading).
  const [serverConfig, setServerConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  // Merchant edits from the config panel, persisted across reloads.
  const [overrides, setOverridesState] = useState(readStoredOverrides);

  useEffect(() => {
    fetchConfig()
      .then(setServerConfig)
      .catch((err) =>
        setConfigError(
          `Could not reach the demo backend (${err.message}). ` +
            "Is the server running? Try `npm run dev` from the project root."
        )
      );
  }, []);

  const setOverrides = useCallback((next) => {
    setOverridesState((prev) => {
      const merged = typeof next === "function" ? next(prev) : { ...prev, ...next };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  }, []);

  const resetOverrides = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setOverridesState({});
  }, []);

  const value = useMemo(() => {
    const defaults = serverConfig?.defaults || {};
    const serverBranding = serverConfig?.branding || {};

    /**
     * Checkout configuration sent to the backend with estimate / session /
     * validate calls. Only fields the merchant actually changed are included,
     * so the backend can keep using its .env defaults for the rest.
     */
    const checkoutOverrides = {};
    for (const key of ["billingConnectionId", "planId", "currency"]) {
      if (overrides[key]) checkoutOverrides[key] = overrides[key];
    }
    if (Array.isArray(overrides.addonIds)) checkoutOverrides.addonIds = overrides.addonIds;

    /** Effective (merged) checkout values, for display in the config panel. */
    const checkout = {
      billingConnectionId: overrides.billingConnectionId || defaults.billingConnectionId || "",
      planId: overrides.planId || defaults.planId || "",
      addonIds: Array.isArray(overrides.addonIds) ? overrides.addonIds : defaults.addonIds || [],
      currency: overrides.currency || defaults.currency || "EUR",
    };

    /** Effective storefront brand: overrides → .env → MySaas. */
    const brand = {
      displayName: overrides.displayName || serverBranding.displayName || MYSAAS_BRAND.displayName,
      logoUrl: overrides.logoUrl || serverBranding.logoUrl || MYSAAS_BRAND.logoUrl,
      primaryColor: overrides.primaryColor || MYSAAS_BRAND.primaryColor,
      // True when the merchant customized anything — used for "reset" UI.
      isCustomized: Boolean(
        overrides.displayName || overrides.logoUrl || overrides.primaryColor
      ),
    };

    return {
      serverConfig,
      configError,
      overrides,
      setOverrides,
      resetOverrides,
      checkout,
      checkoutOverrides,
      brand,
    };
  }, [serverConfig, configError, overrides, setOverrides, resetOverrides]);

  return <DemoConfigContext.Provider value={value}>{children}</DemoConfigContext.Provider>;
}

/** Hook used across the app: `const { brand, checkout, ... } = useDemoConfig()` */
export function useDemoConfig() {
  const ctx = useContext(DemoConfigContext);
  if (!ctx) throw new Error("useDemoConfig must be used inside <DemoConfigProvider>");
  return ctx;
}
