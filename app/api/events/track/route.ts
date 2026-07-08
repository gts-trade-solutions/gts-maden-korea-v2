export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";
import { getVisitorIdentity } from "@/lib/analytics/identity";
import { ipPrefix, parseDevice } from "@/lib/analytics/ip";
import { isKnownEvent } from "@/lib/analytics/events";

const MAX_BATCH = 20;
const MAX_PROPS_BYTES = 4 * 1024;

type IncomingEvent = {
  event_name: string;
  path?: string | null;
  referrer?: string | null;
  utm?: Record<string, string> | null;
  props?: Record<string, any> | null;
  occurred_at?: string | null;
};

function safeProps(p: any) {
  if (!p || typeof p !== "object") return {};
  // Strip top-level PII the caller might have accidentally included.
  const { email, phone, password, address, address_line_1, ...rest } = p;
  // Cap payload size so a buggy client can't flood the table.
  const json = JSON.stringify(rest);
  if (json.length > MAX_PROPS_BYTES) return { _truncated: true };
  return rest;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const incoming: IncomingEvent[] = Array.isArray(body?.events)
      ? body.events.slice(0, MAX_BATCH)
      : body?.event_name
        ? [body as IncomingEvent]
        : [];

    if (!incoming.length) return NextResponse.json({ ok: true, written: 0 });

    const h = headers();
    const ua = h.get("user-agent");
    const ip_prefix = ipPrefix(h);
    const device = parseDevice(ua);

    const { anonId, sessionId } = getVisitorIdentity();

    // Logged-in user (best-effort — null for anons).
    let userId: string | null = null;
    let consent = true;
    try {
      userId = await getSessionUserId();
      if (userId) {
        const prof = await prisma.profiles.findUnique({
          where: { id: userId },
          select: { tracking_consent: true },
        });
        if (prof && prof.tracking_consent === false) consent = false;
      }
    } catch {
      // anon path — leave userId null
    }

    if (!consent) return NextResponse.json({ ok: true, written: 0, skipped: "consent" });

    const rows = incoming
      .filter((e) => isKnownEvent(e.event_name))
      .map((e) => ({
        id: randomUUID(),
        occurred_at: e.occurred_at ? new Date(e.occurred_at) : new Date(),
        user_id: userId,
        anon_id: anonId ?? "",
        session_id: sessionId ?? "",
        event_name: e.event_name,
        path: e.path ?? null,
        referrer: e.referrer ?? null,
        user_agent: ua,
        ip_prefix,
        utm: e.utm ?? undefined,
        device: device ?? undefined,
        props: safeProps(e.props),
      }));

    if (!rows.length) return NextResponse.json({ ok: true, written: 0 });

    try {
      await prisma.events.createMany({ data: rows });
    } catch (err: any) {
      console.warn("[events.track] insert failed:", err?.message);
      return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, written: rows.length });
  } catch (e: any) {
    console.warn("[events.track] handler threw:", e?.message);
    return NextResponse.json({ ok: false, error: "track_failed" }, { status: 500 });
  }
}
