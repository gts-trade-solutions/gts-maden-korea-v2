export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin(_req);
  if (error) return error;

  const sessionId = params.id;
  if (!sessionId) return json({ ok: false, error: "MISSING_ID" }, 400);

  const events = await prisma.events.findMany({
    where: { session_id: sessionId },
    select: {
      id: true,
      occurred_at: true,
      event_name: true,
      path: true,
      referrer: true,
      user_agent: true,
      ip_prefix: true,
      device: true,
      utm: true,
      props: true,
      user_id: true,
      anon_id: true,
    },
    orderBy: { occurred_at: "asc" },
    take: 2000,
  });

  if (!events || events.length === 0) return json({ ok: false, error: "NOT_FOUND" }, 404);

  const head = events[0];
  const tail = events[events.length - 1];

  // Best-effort customer info if logged in. profiles holds the name;
  // email lives on the auth_users table (NextAuth).
  let customer: { email: string | null; name: string | null } | null = null;
  if (head.user_id) {
    const u = await prisma.profiles.findUnique({
      where: { id: head.user_id },
      select: { full_name: true },
    });
    let email: string | null = null;
    try {
      const au = await prisma.user.findUnique({
        where: { id: head.user_id },
        select: { email: true },
      });
      email = au?.email ?? null;
    } catch {
      // best-effort
    }
    customer = { name: u?.full_name ?? null, email };
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
    const prods = await prisma.products.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, slug: true },
    });
    for (const p of prods) productMap[p.id] = { name: p.name, slug: p.slug };
  }

  return json(
    jsonSafe({
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
    })
  );
}
