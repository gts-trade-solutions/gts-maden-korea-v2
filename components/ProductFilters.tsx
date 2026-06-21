"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type ProductBrandOption = {
  slug?: string | null;
  name?: string | null;
};

export type ProductFiltersProps = {
  itemCount: number;
  selectedSort: string;
  selectedPrice: string;
  inStockOnly: boolean;
  /** Only used on category pages — when omitted, the brand select is hidden. */
  selectedBrand?: string;
  brandOptions?: Array<ProductBrandOption | null | undefined>;
};

/**
 * Mobile-first product filter strip.
 *
 * - On mobile (< sm) we render the product count + a single "Filters"
 *   button that opens a bottom sheet with the actual form. The whole
 *   filter UI takes one ~40px row instead of 5 stacked rows.
 * - On sm+ we render the count + inline form on a single row, the
 *   same as before.
 *
 * The form is a plain `method="get"` submission so it works without
 * client JS once it's been mounted, and submitting it triggers a
 * standard page navigation (which closes the sheet automatically).
 */
export function ProductFilters({
  itemCount,
  selectedSort,
  selectedPrice,
  inStockOnly,
  selectedBrand,
  brandOptions,
}: ProductFiltersProps) {
  const t = useTranslations("productFilters");
  const [open, setOpen] = useState(false);

  const showBrand = selectedBrand !== undefined;

  // Number of non-default filters applied — shown as a badge on the
  // mobile button so the user knows filters are active.
  const activeCount = useMemo(() => {
    let n = 0;
    if (selectedSort && selectedSort !== "newest") n++;
    if (selectedPrice && selectedPrice !== "all") n++;
    if (showBrand && selectedBrand && selectedBrand !== "all") n++;
    if (inStockOnly) n++;
    return n;
  }, [selectedSort, selectedPrice, selectedBrand, inStockOnly, showBrand]);

  // Shared select markup so mobile sheet + desktop inline don't drift.
  const selects = (
    <>
      <select
        name="sort"
        defaultValue={selectedSort}
        className="block h-9 w-full sm:w-auto min-w-0 max-w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="newest">{t("sortNewest")}</option>
        <option value="price_asc">{t("sortPriceAsc")}</option>
        <option value="price_desc">{t("sortPriceDesc")}</option>
        <option value="popular">{t("sortPopular")}</option>
      </select>
      <select
        name="price"
        defaultValue={selectedPrice}
        className="block h-9 w-full sm:w-auto min-w-0 max-w-full rounded-md border bg-background px-2 text-sm"
      >
        <option value="all">{t("priceAll")}</option>
        <option value="0-5000">{t("priceLow")}</option>
        <option value="5000-10000">{t("priceMid")}</option>
        <option value="10000+">{t("priceHigh")}</option>
      </select>
      {showBrand && (
        <select
          name="brand"
          defaultValue={selectedBrand}
          className="block h-9 w-full sm:w-auto min-w-0 max-w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="all">{t("brandAll")}</option>
          {(brandOptions ?? []).map((b) => {
            const value = b?.slug || b?.name || "";
            if (!value) return null;
            return (
              <option key={value} value={value}>
                {b?.name}
              </option>
            );
          })}
        </select>
      )}
      <label className="flex w-full sm:w-auto items-center gap-2 rounded-md border px-2 h-9 text-sm">
        <input
          type="checkbox"
          name="in_stock"
          value="1"
          defaultChecked={inStockOnly}
        />
        {t("inStockOnly")}
      </label>
    </>
  );

  return (
    <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6 min-w-0">
      <p className="text-xs sm:text-sm text-muted-foreground shrink-0">
        {t("productCount", { count: itemCount })}
      </p>

      {/* MOBILE — single button opens a bottom sheet */}
      <div className="sm:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-2"
              type="button"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("filtersTitle")}
              {activeCount > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle>{t("filterProducts")}</SheetTitle>
            </SheetHeader>
            <form method="get" className="flex flex-col gap-3 py-4">
              {selects}
              <SheetFooter className="flex flex-col gap-2 sm:flex-col">
                <Button type="submit" className="w-full">
                  {t("applyFilters")}
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  type="button"
                  className="w-full"
                >
                  {/* Reset = visit the same page with no params */}
                  <a href="?">{t("reset")}</a>
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* DESKTOP / TABLET — inline form */}
      <form
        method="get"
        className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2"
      >
        {selects}
        <Button type="submit" size="sm" className="h-9">
          {t("apply")}
        </Button>
      </form>
    </div>
  );
}
