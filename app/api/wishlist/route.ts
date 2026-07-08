export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";

// User wishlist, backed by MySQL/Prisma under NextAuth. Reads/writes are scoped
// to the authenticated user's id. Guests get an empty server list (the client
// keeps localStorage).
const json = (d: any, s = 200) =>
  NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return json({ ok: true, items: [] });
  const items = await prisma.wishlist_items.findMany({
    where: { user_id: userId },
    select: { product_id: true, priority: true, note: true },
  });
  return json({ ok: true, items: jsonSafe(items) });
}

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return json({ ok: false, error: "UNAUTH" }, 401);
  const body = await req.json().catch(() => ({} as any));
  const op = String(body?.op || "");
  try {
    if (op === "add") {
      // ignoreDuplicates: no-op update when the (user_id, product_id) row exists.
      await prisma.wishlist_items.upsert({
        where: { user_id_product_id: { user_id: userId, product_id: body.product_id } },
        update: {},
        create: { id: randomUUID(), user_id: userId, product_id: body.product_id, priority: 3 },
      });
    } else if (op === "merge") {
      const ids = Array.isArray(body.product_ids) ? body.product_ids.filter(Boolean) : [];
      for (const pid of ids as string[]) {
        await prisma.wishlist_items.upsert({
          where: { user_id_product_id: { user_id: userId, product_id: pid } },
          update: {},
          create: { id: randomUUID(), user_id: userId, product_id: pid, priority: 3 },
        });
      }
    } else if (op === "remove") {
      await prisma.wishlist_items.deleteMany({
        where: { user_id: userId, product_id: body.product_id },
      });
    } else if (op === "clear") {
      await prisma.wishlist_items.deleteMany({ where: { user_id: userId } });
    } else if (op === "update") {
      // priority/note edit from the /wishlist page. Scoped by user_id + the
      // row's product_id (or id) so a user can only edit their own rows.
      const patch: Record<string, any> = {};
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.note !== undefined) patch.note = body.note;
      const where: Record<string, any> = { user_id: userId };
      if (body.product_id) where.product_id = body.product_id;
      else if (body.id) where.id = body.id;
      await prisma.wishlist_items.updateMany({ where, data: patch });
    } else {
      return json({ ok: false, error: "BAD_OP" }, 400);
    }
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WISHLIST_FAILED" }, 500);
  }
}
