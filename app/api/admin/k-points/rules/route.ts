import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/adminGuard";
import { prisma } from "@/lib/db/prisma";
import { EARN_ACTIONS } from "@/lib/k-points/constants";
import { bustKPointsRulesCache, getKPointsRules } from "@/lib/k-points/config";
import { backfillSignupCredits } from "@/lib/k-points/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manual trigger: grant the signup bonus to existing users who don't have it.
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  if (body.action === "backfill-signup") {
    const result = await backfillSignupCredits();
    return NextResponse.json({ ok: true, ...result });
  }
  return NextResponse.json({ ok: false, error: "BAD_ACTION" }, { status: 400 });
}

// Update one earn rule (purchase|signup|review|referral).
export async function PATCH(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));

  const action = String(body.actionKey || "");
  if (!(EARN_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ ok: false, error: "BAD_ACTION" }, { status: 400 });
  }

  const data: Record<string, any> = {};
  if (body.mode === "percent" || body.mode === "flat") data.mode = body.mode;
  if (Number.isFinite(body.value)) {
    // Percent rules cap at 100%; flat point bonuses at a sane ceiling.
    const isPercent = (data.mode ?? body.mode) === "percent";
    const max = isPercent ? 100 : 10_000_000;
    data.value = Math.max(0, Math.min(max, body.value));
  }
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.oneTime === "boolean") data.oneTime = body.oneTime;

  await prisma.kPointsRule.upsert({
    where: { actionKey: action },
    update: data,
    create: {
      actionKey: action,
      mode: data.mode ?? "flat",
      value: data.value ?? 0,
      enabled: data.enabled ?? false,
      oneTime: data.oneTime ?? action === "signup",
    },
  });
  bustKPointsRulesCache();

  // When the signup bonus is enabled with a value, retro-credit existing users
  // who never received it (idempotent, so safe to run on every such save).
  let backfill: { credited: number; remaining: number } | undefined;
  const saved = (await getKPointsRules())[action];
  if (action === "signup" && saved?.enabled && saved.value > 0) {
    backfill = await backfillSignupCredits();
  }

  return NextResponse.json({
    ok: true,
    rules: Object.values(await getKPointsRules()),
    backfill,
  });
}
