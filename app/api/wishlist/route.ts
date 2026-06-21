export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteUser } from "@/lib/auth/routeUser";
import { supabaseForUser } from "@/lib/supabaseRoute";

// User wishlist. The browser wrote wishlist_items directly via the anon Supabase
// client, which is RLS-denied under NextAuth (no Supabase session). This routes
// the reads/writes through the service-role seam, scoped to the authenticated
// user's id. Guests get an empty server list (the client keeps localStorage).
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return json({ ok: true, items: [] });
  const sb = supabaseForUser(user.id);
  const { data, error } = await sb
    .from("wishlist_items")
    .select("product_id, priority, note")
    .eq("user_id", user.id);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getRouteUser(req);
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);
  const sb = supabaseForUser(user.id);
  const body = await req.json().catch(() => ({} as any));
  const op = String(body?.op || "");
  try {
    if (op === "add") {
      const { error } = await sb.from("wishlist_items").upsert(
        { user_id: user.id, product_id: body.product_id, priority: 3 },
        { onConflict: "user_id,product_id", ignoreDuplicates: true }
      );
      if (error) return json({ ok: false, error: error.message }, 500);
    } else if (op === "merge") {
      const ids = Array.isArray(body.product_ids) ? body.product_ids.filter(Boolean) : [];
      if (ids.length) {
        const { error } = await sb.from("wishlist_items").upsert(
          ids.map((pid: string) => ({ user_id: user.id, product_id: pid, priority: 3 })),
          { onConflict: "user_id,product_id", ignoreDuplicates: true }
        );
        if (error) return json({ ok: false, error: error.message }, 500);
      }
    } else if (op === "remove") {
      const { error } = await sb.from("wishlist_items").delete().eq("user_id", user.id).eq("product_id", body.product_id);
      if (error) return json({ ok: false, error: error.message }, 500);
    } else if (op === "clear") {
      const { error } = await sb.from("wishlist_items").delete().eq("user_id", user.id);
      if (error) return json({ ok: false, error: error.message }, 500);
    } else if (op === "update") {
      // priority/note edit from the /wishlist page. Scoped by user_id + the
      // row's product_id (or id) so a user can only edit their own rows.
      const patch: Record<string, any> = {};
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.note !== undefined) patch.note = body.note;
      let q = sb.from("wishlist_items").update(patch).eq("user_id", user.id);
      if (body.product_id) q = q.eq("product_id", body.product_id);
      else if (body.id) q = q.eq("id", body.id);
      const { error } = await q;
      if (error) return json({ ok: false, error: error.message }, 500);
    } else {
      return json({ ok: false, error: "BAD_OP" }, 400);
    }
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WISHLIST_FAILED" }, 500);
  }
}
