"use client";

// Client helper for admin/CMS writes. Replaces browser-direct Supabase writes
// (silently RLS-denied under NextAuth) by POSTing to /api/admin/catalog/write,
// which writes via the service-role client + mirrors MySQL. Throws on failure
// so existing try/catch + toast.error paths keep working.
//
//   await adminWrite({ table: "home_banners", op: "insert", data });           // -> new row
//   await adminWrite({ table: "home_banners", op: "update", data, match: { id } });
//   await adminWrite({ table: "home_banners", op: "delete", match: { id } });
//   await adminWrite({ table: "product_images", op: "delete", match: { id }, mirrorScope: productId });
export type AdminWritePayload = {
  table: string;
  op: "insert" | "update" | "upsert" | "delete";
  data?: any;
  match?: Record<string, any>;
  onConflict?: string;
  // For product-scoped tables (product_images/product_videos/...), pass the
  // product id when it isn't in `data`/`match` so the MySQL re-sync is scoped.
  mirrorScope?: string;
};

export async function adminWrite(payload: AdminWritePayload): Promise<any> {
  const res = await fetch("/api/admin/catalog/write", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j?.ok) throw new Error(j?.error || "Save failed");
  return j.row;
}
