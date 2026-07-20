// app/api/me/promos/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/auth/routeUser";

const json = (d:any, s=200) => NextResponse.json(d, { status: s, headers: { "cache-control": "no-store" } });

export async function GET() {
  const { user } = await getRouteAuth();
  if (!user) return json({ ok: false, error: "UNAUTH" }, 401);

  const { getAllPromosMysql } = await import("@/lib/data/influencer");
  return json({ ok: true, promos: await getAllPromosMysql(user.id) });

}
