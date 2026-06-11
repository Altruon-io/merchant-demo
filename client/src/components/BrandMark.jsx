/**
 * BrandMark — the storefront logo + name, used in the checkout and result
 * page headers.
 *
 * Merchants can point the demo at ANY logo URL (config panel or .env), so
 * loading can fail for reasons outside our control (dead URL, hotlink
 * protection, ...). This component:
 *
 *   - resets its error state whenever the URL changes (a previous failure
 *     must not permanently hide a newly configured, working logo)
 *   - sends no Referer header (some image CDNs block cross-site referrers)
 *   - falls back to the display name if the image can't load
 *
 * The bundled MySaas logo is a wordmark (it contains the name), so the text
 * is only rendered next to custom logos — or as the fallback.
 */

import React, { useEffect, useState } from "react";
import { MYSAAS_BRAND } from "../context/DemoConfigContext.jsx";

export default function BrandMark({ brand }) {
  const [failed, setFailed] = useState(false);

  // A new logo URL deserves a fresh attempt.
  useEffect(() => setFailed(false), [brand.logoUrl]);

  const isMySaasWordmark = brand.logoUrl === MYSAAS_BRAND.logoUrl;

  return (
    <div className="checkout-brand">
      {!failed && (
        <img
          src={brand.logoUrl}
          alt={brand.displayName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      {(failed || !isMySaasWordmark) && <strong>{brand.displayName}</strong>}
    </div>
  );
}
