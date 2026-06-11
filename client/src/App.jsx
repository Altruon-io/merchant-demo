/**
 * App.jsx — application shell.
 *
 * Structure:
 *   <DemoConfigProvider>   config defaults + merchant overrides (context)
 *     <SetupGate>          blocks rendering until Altruon credentials are valid
 *       <Routes>
 *         /        → CheckoutPage  (the MySaas storefront checkout)
 *         /result  → ResultPage    (post-payment transaction report)
 *
 * The ConfigPanel (gear button) floats above every page so merchants can
 * tweak the Altruon settings and storefront branding at any time.
 */

import React, { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { DemoConfigProvider, useDemoConfig } from "./context/DemoConfigContext.jsx";
import SetupGate from "./components/SetupGate.jsx";
import ConfigPanel from "./components/ConfigPanel.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import ResultPage from "./pages/ResultPage.jsx";

/**
 * Applies the active storefront primary color as a CSS variable so the whole
 * storefront (buttons, focus rings, accents) re-brands instantly when the
 * merchant picks a color in the config panel.
 */
function BrandStyler({ children }) {
  const { brand } = useDemoConfig();

  useEffect(() => {
    document.documentElement.style.setProperty("--sf-primary", brand.primaryColor);
  }, [brand.primaryColor]);

  return children;
}

export default function App() {
  return (
    <DemoConfigProvider>
      <BrandStyler>
        <SetupGate>
          <Routes>
            <Route path="/" element={<CheckoutPage />} />
            <Route path="/result" element={<ResultPage />} />
          </Routes>
        </SetupGate>
        {/* Rendered outside the gate so merchants can fix overridable
            settings (billing connection, plan, ...) even when validation
            fails — only .env secrets require a server restart. */}
        <ConfigPanel />
      </BrandStyler>
    </DemoConfigProvider>
  );
}
