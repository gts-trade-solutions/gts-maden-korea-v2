import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FilterType = "all" | "registered";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const type = (req.nextUrl.searchParams.get("type") as FilterType) || "all";

  console.log("contacts API type =", type);

  // Helper: get unsubscribed emails as a Set
  async function getUnsubscribedSet(emails: string[]) {
    const unique = Array.from(
      new Set(
        emails
          .map((e) => e?.trim().toLowerCase())
          .filter(Boolean) as string[]
      )
    );

    if (unique.length === 0) return new Set<string>();

    try {
      const data = await prisma.email_unsubscribe.findMany({
        where: { email: { in: unique } },
        select: { email: true },
      });
      return new Set(data.map((r) => r.email.toLowerCase()));
    } catch (error) {
      console.error("Failed to load unsubscribe list:", error);
      return new Set<string>();
    }
  }

  // ========== ALL CONTACTS ==========
  // Only data from email_contact (your imported contacts)
  if (type === "all") {
    let data;
    try {
      data = await prisma.email_contact.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          is_registered: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to fetch contacts" },
        { status: 500 }
      );
    }

    console.log("contacts API ALL SIMPLE -> rows:", data?.length);

    const emails = (data || [])
      .map((c) => c.email as string | null)
      .filter(Boolean) as string[];

    const unsubSet = await getUnsubscribedSet(emails);

    const withFlag = (data || []).map((c) => ({
      ...c,
      categories: [], // we don't join categories here to avoid issues
      unsubscribed: c.email
        ? unsubSet.has((c.email as string).toLowerCase())
        : false,
    }));

    return NextResponse.json({ contacts: jsonSafe(withFlag) });
  }

  // ========== WEBSITE USERS ONLY (registered auth users) ==========
  if (type === "registered") {
    let allUsers;
    try {
      allUsers = await prisma.user.findMany({
        where: { email: { not: null } },
        select: { id: true, email: true, name: true, createdAt: true },
      });
    } catch (error) {
      console.error("Error listing auth users:", error);
      return NextResponse.json(
        { error: "Failed to fetch website users" },
        { status: 500 }
      );
    }

    console.log("contacts API registered -> auth users:", allUsers.length);

    const emails = allUsers
      .map((u) => u.email as string | null)
      .filter(Boolean) as string[];

    const unsubSet = await getUnsubscribedSet(emails);

    // Prefer the canonical profile name (profiles.full_name); fall back to the
    // NextAuth auth-user name. Mirrors the merge convention used across the
    // admin user reads (see /api/admin/users/lookup).
    const ids = allUsers.map((u) => u.id);
    const profs =
      ids.length > 0
        ? await prisma.profiles.findMany({
            where: { id: { in: ids } },
            select: { id: true, full_name: true },
          })
        : [];
    const nameMap = new Map<string, string | null>();
    for (const p of profs) nameMap.set(p.id, p.full_name ?? null);

    const contacts = allUsers
      .filter((u) => !!u.email)
      .map((u) => {
        const email = u.email as string;
        const name = nameMap.get(u.id) ?? u.name ?? null;

        return {
          id: u.id as string,
          email,
          name,
          is_registered: true, // website user
          created_at: u.createdAt,
          categories: [] as any[],
          unsubscribed: unsubSet.has(email.toLowerCase()),
        };
      });

    return NextResponse.json({ contacts: jsonSafe(contacts) });
  }

  return NextResponse.json({ contacts: [] });
}
