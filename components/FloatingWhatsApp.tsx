"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { getBusinessProfile } from "@/lib/businessInfo";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

type FloatingWhatsAppProps = {
  /** Fallback WhatsApp number when no `country_contacts.whatsapp_number`
   *  is configured for the visitor's country. Wired from
   *  `WHATSAPP_PHONE_NUMBER` in the root layout. */
  phoneNumber: string; // example: 919876543210
  message?: string;
};

// Routes where the floating WhatsApp button should be hidden on mobile.
// PDP is the canonical case: its image carousel chevrons sit on the
// right side at exactly the area this button wants to occupy, and the
// page already exposes the MobileBuyBar for primary actions plus a
// footer link to /contact for support. Match prefix-style so deeper
// PDP variants (`/products/foo/something`) are also covered.
const HIDE_ON_MOBILE_PREFIXES = ["/products/"];

/**
 * Official WhatsApp glyph — the phone-in-speech-bubble silhouette.
 * Inlined as SVG so we don't depend on a brand-icon package. Path data
 * is the standard 24×24 WhatsApp logo from their press kit.
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

function normalize(num: string | null | undefined): string {
  return (num ?? "").replace(/[^0-9]/g, "");
}

export function FloatingWhatsApp({
  phoneNumber,
  message = "Hi, I need help.",
}: FloatingWhatsAppProps) {
  const pathname = usePathname() ?? "";
  const t = useTranslations("floatingWhatsapp");
  const hideOnMobile = HIDE_ON_MOBILE_PREFIXES.some((p) => pathname.startsWith(p));

  // Resolve the visitor's country-specific WhatsApp number. Falls back
  // to the prop (env-supplied global default) until the profile loads,
  // and hides the button entirely if neither the country override nor
  // the fallback has a number set.
  const [resolved, setResolved] = useState<string>(() => normalize(phoneNumber));
  useEffect(() => {
    let cancelled = false;
    const country = readCountryFromCookie();
    getBusinessProfile(country).then((p) => {
      if (cancelled) return;
      // The resolver already prefers country override → env fallback.
      const next = normalize(p.contact.whatsappNumber);
      setResolved(next || normalize(phoneNumber));
    });
    return () => {
      cancelled = true;
    };
  }, [phoneNumber]);

  if (!resolved) return null;

  const href = `https://wa.me/${resolved}?text=${encodeURIComponent(message)}`;

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("open")}
      // z-40 sits below shadcn Dialog (z-50) and Sheet (z-50) so the
      // button never overlays open modals (Razorpay, lightbox, share,
      // mobile menu). It still floats above page content (z-auto).
      //
      // `bottom` is driven by a CSS variable so any surface that needs
      // the WhatsApp button lifted (e.g. the PDP MobileBuyBar on
      // tablet/desktop) can override it without prop drilling. Default
      // 1.25rem matches the legacy `bottom-5`.
      //
      // `hideOnMobile` hides the button on small viewports for routes
      // listed above (PDP) where it competes with page chrome. Desktop
      // still shows it because there's plenty of room.
      style={{ bottom: "var(--floating-whatsapp-bottom, 1.25rem)" }}
      className={`fixed right-5 z-40 ${hideOnMobile ? "hidden md:flex" : "flex"} h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105`}
    >
      <WhatsAppIcon className="h-7 w-7" />
    </Link>
  );
}
