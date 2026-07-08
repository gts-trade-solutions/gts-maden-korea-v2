export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAdmin } from "@/lib/auth/adminGuard";

// POST /api/admin/influencers/decision — approve or reject an influencer request.
//   { action: "approve", request_id, cap, def, regions }  -> approve logic
//   { action: "reject",  request_id }                     -> reject logic
// Admin-only (requireAdmin). Ported off the Supabase approve_influencer /
// reject_influencer RPCs to direct Prisma/MySQL writes.
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

// Reproduces public.slugify_handle(): lowercase, strip diacritics, collapse
// any run of non-alphanumerics to a single underscore, trim edge underscores.
function slugifyHandle(name?: string | null): string {
  if (!name) return "";
  return String(name)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Reproduces substr(replace(gen_random_uuid()::text,'-',''),1,4) — first 4 hex.
function randomSuffix(): string {
  return (globalThis.crypto?.randomUUID?.() ?? "")
    .replace(/-/g, "")
    .slice(0, 4) || Math.random().toString(16).slice(2, 6);
}

export async function POST(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => ({} as any));

  if (body.action === "approve") {
    if (!body.request_id) return json({ ok: false, error: "request_id required" }, 400);
    const cap = Number(body.cap);
    const def = Number(body.def);
    const regions = Array.isArray(body.regions) ? body.regions : [];
    try {
      // Mirrors approve_influencer(): validate the cap/discount split (the RPC
      // raised friendly errors here too), mark the request approved, derive a
      // handle if none/too short, then upsert the influencer profile — on
      // re-approval keep the previously set cap/default (only handle/active
      // change), matching the RPC's `on conflict do update`.
      if (!Number.isFinite(cap) || cap < 5 || cap > 100) {
        throw new Error("cap_pct must be between 5 and 100");
      }
      if (!Number.isFinite(def) || def < 0 || def > cap) {
        throw new Error("default_discount_pct must be between 0 and cap_pct");
      }

      await prisma.$transaction(async (tx) => {
        const reqRow = await tx.influencer_requests.findUnique({
          where: { id: body.request_id },
          select: { user_id: true, handle: true },
        });
        if (!reqRow?.user_id) throw new Error("request not found");

        await tx.influencer_requests.update({
          where: { id: body.request_id },
          data: { status: "approved" },
        });

        let handle = reqRow.handle;
        if (!handle || handle.length < 3) {
          const [prof, usr] = await Promise.all([
            tx.profiles.findUnique({ where: { id: reqRow.user_id }, select: { full_name: true } }),
            tx.user.findUnique({ where: { id: reqRow.user_id }, select: { email: true } }),
          ]);
          const base =
            slugifyHandle(prof?.full_name) ||
            (usr?.email ? usr.email.split("@")[0] : "") ||
            "user";
          handle = `${base}_${randomSuffix()}`;
        }

        await tx.influencer_profiles.upsert({
          where: { user_id: reqRow.user_id },
          create: {
            user_id: reqRow.user_id,
            handle,
            display_name: null,
            avatar_url: null,
            social: {},
            default_commission_percent: 10.0,
            active: true,
            commission_cap_pct: cap,
            default_user_discount_pct: def,
            applicable_countries: regions,
          },
          update: {
            handle,
            active: true,
            updated_at: new Date(),
          },
        });
      });
    } catch (e: any) {
      return json({ ok: false, error: e?.message || "APPROVE_FAILED" }, 500);
    }
    return json({ ok: true });
  }

  if (body.action === "reject") {
    if (!body.request_id) return json({ ok: false, error: "request_id required" }, 400);
    try {
      // Mirrors reject_influencer(): flip the request status to 'rejected'.
      // Does not touch influencer_profiles (rejection never created one).
      await prisma.influencer_requests.update({
        where: { id: body.request_id },
        data: { status: "rejected" },
      });
    } catch (e: any) {
      if (e?.code === "P2025") return json({ ok: false, error: "request not found" }, 500);
      return json({ ok: false, error: e?.message || "REJECT_FAILED" }, 500);
    }
    return json({ ok: true });
  }

  return json({ ok: false, error: "BAD_ACTION" }, 400);
}
