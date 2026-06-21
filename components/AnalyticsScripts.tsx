"use client";

import Script from "next/script";
import { useAnalyticsAllowed } from "@/lib/contexts/CookieConsentContext";

const GA_ID = "G-PHZYP1091X";

/**
 * Conditional Google Analytics loader. Only injects the GA scripts once
 * the user has granted "Analytics" consent via the cookie banner. If the
 * user hasn't decided yet (or has rejected analytics), GA never loads —
 * no third-party requests are made, no cookies are set, no tracking
 * happens. When consent is granted later in the session the scripts
 * inject and start measuring from that point onward.
 */
export function AnalyticsScripts() {
  const allowed = useAnalyticsAllowed();
  if (!allowed) return null;
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA_ID}');
        `}
      </Script>
    </>
  );
}
