"use client";

import { ChevronDown, Check } from "lucide-react";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Header dropdown that lets the visitor pick their display currency.
// Updates the CurrencyContext, which writes through to the cookie +
// localStorage. Indian visitors typically never interact with this —
// the middleware seeds INR for them on first visit.

export function CurrencySwitcher() {
  const { currency, rate, rates, setCurrency } = useCurrency();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="
          inline-flex items-center gap-1 rounded-md px-2 py-1.5
          text-sm font-medium text-foreground hover:bg-accent
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
        "
        aria-label={`Currency: ${rate.code}. Change currency`}
      >
        <span className="font-semibold">{rate.symbol}</span>
        <span className="hidden sm:inline">{rate.code}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {SUPPORTED_CURRENCIES.map((code) => {
          const r = rates[code];
          if (!r) return null;
          const isActive = currency === code;
          return (
            <DropdownMenuItem
              key={code}
              onSelect={() => setCurrency(code)}
              className="flex items-center justify-between gap-3 cursor-pointer"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="inline-flex w-6 justify-center text-sm font-semibold text-muted-foreground">
                  {r.symbol}
                </span>
                <span className="text-sm font-medium">{r.code}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {r.name}
                </span>
              </span>
              {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
