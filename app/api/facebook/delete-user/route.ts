import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Facebook data-deletion callback. Deletes the NextAuth user linked to the
// given Facebook provider UID. Under MySQL/NextAuth the Facebook identity lives
// in auth_accounts (provider="facebook", provider_account_id=<facebook_id>);
// deleting the parent auth_users row cascades to accounts + sessions.
export async function POST(req: Request) {
  try {
    const { facebook_id } = await req.json();

    if (!facebook_id) {
      return NextResponse.json(
        { error: "facebook_id required" },
        { status: 400 }
      );
    }

    const account = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "facebook",
          providerAccountId: String(facebook_id),
        },
      },
      select: { userId: true },
    });

    // Idempotent: if there's no linked user, treat the deletion as satisfied.
    if (account) {
      await prisma.user.delete({ where: { id: account.userId } });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
