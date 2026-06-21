"use client";

// Fire-and-forget MySQL mirror, called right after a browser-direct admin/CMS
// Supabase write so the MySQL-backed storefront doesn't go stale. Best-effort —
// never throws, never blocks the UI. Pass scopeVal for product-scoped tables
// (product_images/product_videos/product_country_prices/product_story_blocks ->
// the product id; products -> the product id). Omit it for full-table CMS tables
// (brands, categories, home_banners, home_product_videos, …).
//
//   await Promise.all([mirrorMysql("products", id), mirrorMysql("product_images", id)]);
export async function mirrorMysql(table: string, scopeVal?: string): Promise<void> {
  try {
    await fetch("/api/admin/mysql-mirror", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ table, scopeVal }),
    });
  } catch {
    /* best-effort; an orphaned stale row is recoverable via re-save or ETL */
  }
}
