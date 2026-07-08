import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { error: authError } = await requireAdmin(_req);
  if (authError) return authError;

  try {
    const data = await prisma.email_category.findMany({
      select: { id: true, slug: true, label: true, description: true },
      orderBy: { label: "asc" },
    });

    return NextResponse.json({
      categories: jsonSafe(data),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}
