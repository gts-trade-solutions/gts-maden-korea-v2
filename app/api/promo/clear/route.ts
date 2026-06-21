// app/api/promo/clear/route.ts
import { NextResponse } from "next/server";
import { clearPromoCookie } from "@/lib/promo-cookie";

export async function POST() {
  clearPromoCookie();
  return NextResponse.json({ ok: true });
}
