// app/r/[code]/route.ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server"; // from 2.3

// Was `runtime = "edge"`, but the referral-click log now writes directly to
// MySQL via Prisma (replacing the old Supabase `log-referral-click` edge fn),
// and Prisma requires the Node.js runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";  // always server-rendered

const ATTRIBUTION_COOKIE = "mi_ref_code";
const ATTRIBUTION_MAX_DAYS = Number(process.env.REF_ATTRIBUTION_DAYS || 30);

// Helper: build your product URL from slug
function productUrlFromSlug(slug?: string | null) {
  // adjust to your actual product route:
  return slug ? `/products/${slug}` : `/`;
}

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {
  const code = params.code?.trim();
  if (!code) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 1) Set HTTP-only cookie for attribution window
  const cookieStore = cookies();
  const maxAge = ATTRIBUTION_MAX_DAYS * 24 * 60 * 60;

  const res = NextResponse.next(); // we'll turn this into a redirect after we compute target
  res.cookies.set({
    name: ATTRIBUTION_COOKIE,
    value: code,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  // 2) Resolve redirect target (product slug / store)
  //    Uses security-definer RPC from 2.1 (safe for anon)
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  const viewerUserId = userData?.user?.id ?? null;

  const { data: target, error: targetErr } = await supabase.rpc(
    "resolve_referral_target",
    { p_code: code }
  );

  // 3) Fire-and-forget click log — inlined via Prisma/MySQL (replaces the old
  //    Supabase `log-referral-click` edge function). Resolve the referral code
  //    to its link id, then insert a `referral_clicks` row capturing viewer,
  //    IP, UA and referrer. Best-effort: wrapped in try/catch and intentionally
  //    NOT awaited so it never blocks the redirect.
  (async () => {
    try {
      const { prisma } = await import("@/lib/db/prisma");
      const link = await prisma.referral_links.findUnique({
        where: { code },
        select: { id: true },
      });
      if (link) {
        const h = headers();
        const ip =
          h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          h.get("x-real-ip") ||
          h.get("cf-connecting-ip") ||
          "";
        const ua = h.get("user-agent") || "";
        const referer = h.get("referer") || "";
        await prisma.referral_clicks.create({
          data: {
            referral_id: link.id,
            viewer_user_id: viewerUserId,
            user_agent: ua || null,
            ip_hash: ip || null,
            meta: { referer },
          },
        });
      }
    } catch {
      /* swallow logging errors — never block the redirect */
    }
  })();

  // 4) Decide destination
  const first = Array.isArray(target) ? target[0] : target;
  const to =
    first?.link_type === "product"
      ? productUrlFromSlug(first?.product_slug)
      : "/"; // store-wide links land on home (adapt if needed)

  return NextResponse.redirect(new URL(to, req.url), {
    headers: res.headers,
  });
}
