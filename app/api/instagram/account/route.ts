// app/api/instagram/account/route.ts
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { ADMIN_OWNER_ID } from "@/lib/adminOwner";

export async function GET() {
  try {
    if (!ADMIN_OWNER_ID) {
      return NextResponse.json(
        {
          error:
            "ADMIN_OWNER_ID / FB_OWNER_ID env not set. Please set FB_OWNER_ID to the owner user UUID.",
        },
        { status: 400 }
      );
    }

    const data = await prisma.instagram_accounts.findFirst({
      where: { is_active: true, owner_id: ADMIN_OWNER_ID },
      select: {
        id: true,
        owner_id: true,
        ig_business_account_id: true,
        username: true,
        profile_picture_url: true,
        token_expires_at: true,
        is_active: true,
      },
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({ account: jsonSafe(data ?? null) }, { status: 200 });
  } catch (err: any) {
    console.error("GET /api/instagram/account unexpected error:", err);
    return NextResponse.json(
      { error: "Failed to load instagram account" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!ADMIN_OWNER_ID) {
      return NextResponse.json(
        {
          error:
            "ADMIN_OWNER_ID / FB_OWNER_ID env not set. Please set FB_OWNER_ID to the owner user UUID.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      ig_business_account_id,
      username,
      access_token,
      token_expires_at, // optional
    } = body;

    if (!ig_business_account_id || !access_token) {
      return NextResponse.json(
        { error: "ig_business_account_id and access_token are required" },
        { status: 400 }
      );
    }

    const expiresAt = token_expires_at ? new Date(token_expires_at) : null;

    // Upsert on the (owner_id, ig_business_account_id) unique constraint —
    // the Prisma equivalent of the old Supabase onConflict clause.
    const data = await prisma.instagram_accounts.upsert({
      where: {
        owner_id_ig_business_account_id: {
          owner_id: ADMIN_OWNER_ID,
          ig_business_account_id: String(ig_business_account_id),
        },
      },
      create: {
        id: randomUUID(),
        owner_id: ADMIN_OWNER_ID,
        ig_business_account_id: String(ig_business_account_id),
        username: username ?? null,
        access_token,
        token_expires_at: expiresAt,
        is_active: true,
      },
      update: {
        username: username ?? null,
        access_token,
        token_expires_at: expiresAt,
        is_active: true,
        updated_at: new Date(),
      },
      select: {
        id: true,
        owner_id: true,
        ig_business_account_id: true,
        username: true,
        token_expires_at: true,
        is_active: true,
      },
    });

    return NextResponse.json({ account: jsonSafe(data) }, { status: 200 });
  } catch (err: any) {
    console.error("POST /api/instagram/account unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error saving instagram account" },
      { status: 500 }
    );
  }
}
