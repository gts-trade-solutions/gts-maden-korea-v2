import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { reserve } from "@/lib/integrations/skinEntitlement";
import { buildHandoffUrl } from "@/lib/integrations/skinAnalyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reserve a scan and mint the signed handoff URL to the analyzer. The client
// then does window.location = redirectUrl.
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const grantId = await reserve(user.id);
  if (!grantId) {
    return NextResponse.json(
      { error: "no_access", message: "You have no analyses remaining." },
      { status: 403 },
    );
  }

  try {
    const redirectUrl = buildHandoffUrl({
      userId: user.id,
      email: user.email,
      name: user.name,
      grantId,
    });
    return NextResponse.json({ redirectUrl });
  } catch (e) {
    // Missing SKIN_ANALYZER_URL / secret — a config error, not the user's fault.
    return NextResponse.json(
      { error: "not_configured", message: (e as Error).message },
      { status: 500 },
    );
  }
}
