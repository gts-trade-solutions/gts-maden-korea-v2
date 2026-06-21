"use client";

import { Heart, ShoppingCart, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Sticky-bottom action bar shown only on mobile PDPs. Mirrors the
// desktop button row (Wishlist / Add to Cart / Buy Now) but with icons
// for the secondary actions and a stretched text label for Buy Now —
// the conversion-critical button.
//
// iOS safe-area handling lives on the bar itself (`pb-[max(...)]`).
// FloatingWhatsApp is hidden on PDP mobile entirely (see that
// component's `HIDE_ON_MOBILE_PREFIXES`), so no lift coordination is
// needed here.
//
// Intentionally not wired to internal state: parent (`product.tsx`)
// owns `isInWishlist`, `inCart`, `isOutOfStock`, and the action
// handlers, so this component stays a thin presentational shell.

type Props = {
  inWishlist: boolean;
  inCart: boolean;
  isAddingToCart: boolean;
  isBuyingNow: boolean;
  isOutOfStock: boolean;
  onWishlistToggle: () => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
};

export function MobileBuyBar({
  inWishlist,
  inCart,
  isAddingToCart,
  isBuyingNow,
  isOutOfStock,
  onWishlistToggle,
  onAddToCart,
  onBuyNow,
}: Props) {
  const t = useTranslations("pdp");
  return (
    <div
      className={cn(
        "md:hidden fixed bottom-0 inset-x-0 z-40",
        "border-t bg-background",
        // Safe-area padding for iOS — falls back to 12px on browsers
        // that don't honour env(). Vertical padding is symmetric so
        // the bar reads as a deliberate strip, not a half-cropped
        // toolbar.
        "px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
      role="region"
      aria-label={t("productActionsAria")}
    >
      {isOutOfStock ? (
        // Single muted pill replaces the action row when stock is 0.
        // Heart still renders so customers can wishlist for restock.
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onWishlistToggle}
            aria-label={inWishlist ? t("removeFromWishlist") : t("addToWishlist")}
            className="shrink-0 h-11 w-11 rounded-full"
          >
            <Heart
              className={cn(
                "h-5 w-5 transition-colors",
                inWishlist && "fill-red-500 text-red-500"
              )}
            />
          </Button>
          <div
            className="flex-1 inline-flex items-center justify-center h-11 rounded-full border bg-muted text-sm font-medium text-muted-foreground"
            aria-disabled
          >
            {t("outOfStock")}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onWishlistToggle}
            aria-label={inWishlist ? t("removeFromWishlist") : t("addToWishlist")}
            className="shrink-0 h-11 w-11 rounded-full"
          >
            <Heart
              className={cn(
                "h-5 w-5 transition-colors",
                inWishlist && "fill-red-500 text-red-500"
              )}
            />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onAddToCart}
            disabled={isAddingToCart}
            aria-label={inCart ? t("addedToCart") : t("addToCart")}
            className="shrink-0 h-11 w-11 rounded-full"
          >
            {inCart ? (
              <Check className="h-5 w-5 text-emerald-600" />
            ) : (
              <ShoppingCart className="h-5 w-5" />
            )}
          </Button>

          <Button
            type="button"
            onClick={onBuyNow}
            disabled={isBuyingNow}
            className="flex-1 h-11 rounded-full text-sm font-semibold"
          >
            {isBuyingNow ? t("buyNowProcessing") : t("buyNow")}
          </Button>
        </div>
      )}
    </div>
  );
}
