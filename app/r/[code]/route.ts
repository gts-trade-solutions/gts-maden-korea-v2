// app/r/[code]/route.ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getSessionUserId } from "@/lib/auth/session";

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

  // 2) Identify the viewer via NextAuth (null for anonymous — that's fine).
  const viewerUserId = await getSessionUserId();

  // 3) Resolve redirect target (product slug / store) from MySQL via Prisma.
  //    Reproduces the old `resolve_referral_target` security-definer RPC: map
  //    the referral `code` to its `referral_links` row and, for product links,
  //    the linked product's slug. We also reuse this lookup for the click-log
  //    insert below (link id). Best-effort: on any failure we fall through to a
  //    safe home ("/") redirect.
  let link:
    | { id: string; link_type: string; product_slug: string | null }
    | null = null;
  try {
    const row = await prisma.referral_links.findUnique({
      where: { code },
      select: {
        id: true,
        link_type: true,
        products: { select: { slug: true } },
      },
    });
    if (row) {
      link = {
        id: row.id,
        link_type: row.link_type,
        product_slug: row.products?.slug ?? null,
      };
    }
  } catch {
    /* resolution failure — safe fallback to home below */
  }

  // 4) Fire-and-forget click log — inlined via Prisma/MySQL (replaces the old
  //    Supabase `log-referral-click` edge function). Insert a `referral_clicks`
  //    row capturing viewer, IP, UA and referrer for the resolved referral
  //    link. Best-effort: wrapped in try/catch and intentionally NOT awaited so
  //    it never blocks the redirect.
  (async () => {
    try {
      if (!link) return;
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
    } catch {
      /* swallow logging errors — never block the redirect */
    }
  })();

  // 5) Decide destination
  const to =
    link?.link_type === "product"
      ? productUrlFromSlug(link.product_slug)
      : "/"; // store-wide links land on home (adapt if needed)

  return NextResponse.redirect(new URL(to, req.url), {
    headers: res.headers,
  });
}
