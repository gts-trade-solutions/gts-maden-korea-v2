import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const cookieKeys = req.cookies.getAll().map(c => c.name).sort();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;

  // No cookie writes in this debug route (no-ops for set/remove)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
      global: bearer ? { headers: { Authorization: `Bearer ${bearer}` } } : undefined,
    }
  );

  const { data, error } = await supabase.auth.getUser().catch(e => ({ data: null, error: e as Error }));
  const userId = data?.user?.id ?? null;

  return NextResponse.json({
    ok: true,
    cookieKeys,
    sawBearer: !!bearer,
    getUserOk: !!userId,
    userId,
    err: error?.message ?? null,
  });
}
