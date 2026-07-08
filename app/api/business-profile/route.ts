import { NextResponse } from "next/server";
import { getBusinessProfile } from "@/lib/businessInfo";

export const dynamic = "force-dynamic";

// GET /api/business-profile?country=IN
// Public business/contact profile (name, address, contact incl. WhatsApp
// number, socials) resolved for the visitor's country. Server-side so the
// underlying store_settings/country_contacts read runs on MySQL (Prisma) —
// client components (FloatingWhatsApp, contact page) fetch this instead of
// calling the now-server-only getBusinessProfile() directly.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country") || undefined;
  const profile = await getBusinessProfile(country);
  return NextResponse.json(profile);
}
