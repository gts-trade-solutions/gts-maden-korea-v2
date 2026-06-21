// app/r/[code]/route.ts
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/utils/supabase/server"; // from 2.3

export const runtime = "edge";           // fast
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

  // 3) Fire-and-forget click log via Edge Function
  //    (doesn't block redirect — we intentionally don't await its success)
  const functionsUrl =
    process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL ||
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;

  fetch(`${functionsUrl}/log-referral-click`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-host": headers().get("host") || "",
    },
    body: JSON.stringify({ code, viewer_user_id: viewerUserId }),
  }).catch(() => { /* swallow logging errors */ });

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
