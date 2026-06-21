export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(_req);
  if (error) return error;

  const sessionId = params.id;
  if (!sessionId) return json({ ok: false, error: "MISSING_ID" }, 400);

  const admin = createAdminClient();

  const { data: events, error: e1 } = await admin
    .from("events")
    .select(
      "id, occurred_at, event_name, path, referrer, user_agent, ip_prefix, device, utm, props, user_id, anon_id"
    )
    .eq("session_id", sessionId)
    .order("occurred_at", { ascending: true })
    .limit(2000);

  if (e1) return json({ ok: false, error: e1.message }, 500);
  if (!events || events.length === 0) return json({ ok: false, error: "NOT_FOUND" }, 404);

  const head = events[0];
  const tail = events[events.length - 1];

  // Best-effort customer info if logged in. profiles holds the name;
  // email lives on auth.users (Supabase Auth).
  let customer: { email: string | null; name: string | null } | null = null;
  if (head.user_id) {
    const { data: u } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", head.user_id)
      .maybeSingle();
    let email: string | null = null;
    try {
      const { data: auth } = await (admin as any).auth.admin.getUserById(head.user_id);
      email = auth?.user?.email ?? null;
    } catch {
      // best-effort
    }
    customer = { name: (u as any)?.full_name ?? null, email };
  }

  // Pull product names for any product_view events so the timeline
  // shows "Viewed Anua Cleanser" instead of a raw UUID.
  const productIds = Array.from(
    new Set(
      events
        .map((e) => (e.props as any)?.product_id)
        .filter((x: any): x is string => !!x)
    )
  );
  const productMap: Record<string, { name: string; slug: string }> = {};
  if (productIds.length) {
    const { data: prods } = await admin
      .from("products")
      .select("id, name, slug")
      .in("id", productIds);
    for (const p of prods || []) productMap[p.id] = { name: p.name, slug: p.slug };
  }

  return json({
    ok: true,
    session: {
      session_id: sessionId,
      anon_id: head.anon_id,
      user_id: head.user_id,
      customer,
      first_at: head.occurred_at,
      last_at: tail.occurred_at,
      events_count: events.length,
      device: head.device,
      ip_prefix: head.ip_prefix,
      user_agent: head.user_agent,
      utm: head.utm,
      referrer: head.referrer,
    },
    events: events.map((e) => {
      const productId = (e.props as any)?.product_id ?? null;
      return {
        id: e.id,
        occurred_at: e.occurred_at,
        event_name: e.event_name,
        path: e.path,
        props: e.props,
        product: productId && productMap[productId] ? productMap[productId] : null,
      };
    }),
  });
}
