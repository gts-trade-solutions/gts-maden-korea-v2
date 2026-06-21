"use client";

import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";
import { useCookieConsent } from "@/lib/contexts/CookieConsentContext";

/**
 * Small client-side button that opens the cookie preferences dialog.
 * Used inside the Cookie Policy page and the Footer so users can
 * revisit their consent any time after the initial banner is dismissed.
 */
export function ManageCookiesButton({
  className,
  variant = "outline",
  label = "Manage cookies",
}: {
  className?: string;
  variant?: "default" | "outline" | "ghost" | "link";
  label?: string;
}) {
  const { openPreferences } = useCookieConsent();
  return (
    <Button
      type="button"
      variant={variant}
      onClick={openPreferences}
      className={className}
    >
      <Cookie className="mr-2 h-4 w-4" />
      {label}
    </Button>
  );
}
