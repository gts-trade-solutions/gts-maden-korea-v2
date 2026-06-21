import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FilterType = "all" | "registered";

export async function GET(req: NextRequest) {
  const { error: authError } = await requireAdmin(req);
  if (authError) return authError;

  const supabase = createServiceClient();
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

    const { data, error } = await supabase
      .from("email_unsubscribe")
      .select("email")
      .in("email", unique);

    if (error) {
      console.error("Failed to load unsubscribe list:", error);
      return new Set<string>();
    }

    return new Set((data || []).map((r: any) => r.email.toLowerCase()));
  }

  // ========== ALL CONTACTS ==========
  // Only data from email_contact (your imported contacts)
  if (type === "all") {
    const { data, error } = await supabase
      .from("email_contact")
      .select("id, email, name, is_registered, created_at")
      .order("created_at", { ascending: false });

    console.log(
      "contacts API ALL SIMPLE -> rows:",
      data?.length,
      "error:",
      error
    );

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to fetch contacts" },
        { status: 500 }
      );
    }

    const emails = (data || [])
      .map((c: any) => c.email as string | null)
      .filter(Boolean) as string[];

    const unsubSet = await getUnsubscribedSet(emails);

    const withFlag = (data || []).map((c: any) => ({
      ...c,
      categories: [], // we don't join categories here to avoid issues
      unsubscribed: c.email
        ? unsubSet.has((c.email as string).toLowerCase())
        : false,
    }));

    return NextResponse.json({ contacts: withFlag });
  }

  // ========== WEBSITE USERS ONLY (Supabase Auth users) ==========
  if (type === "registered") {
    let page = 1;
    const perPage = 1000;
    const allUsers: any[] = [];

    while (true) {
      const { data, error } = await (supabase as any).auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.error("Error listing auth users:", error);
        return NextResponse.json(
          { error: "Failed to fetch website users" },
          { status: 500 }
        );
      }

      const users = data?.users || [];
      allUsers.push(...users);

      if (users.length < perPage) break;
      page += 1;
    }

    console.log("contacts API registered -> auth users:", allUsers.length);

    const emails = allUsers
      .map((u) => u.email as string | null)
      .filter(Boolean) as string[];

    const unsubSet = await getUnsubscribedSet(emails);

    const contacts = allUsers
      .filter((u) => !!u.email)
      .map((u) => {
        const email = u.email as string;
        const created_at = u.created_at as string;
        const name =
          (u.user_metadata && u.user_metadata.full_name) ||
          (u.user_metadata && u.user_metadata.name) ||
          null;

        return {
          id: u.id as string,
          email,
          name,
          is_registered: true, // website user
          created_at,
          categories: [] as any[],
          unsubscribed: unsubSet.has(email.toLowerCase()),
        };
      });

    return NextResponse.json({ contacts });
  }

  return NextResponse.json({ contacts: [] });
}
