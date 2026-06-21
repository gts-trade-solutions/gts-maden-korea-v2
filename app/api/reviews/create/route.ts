import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getRouteUser } from "@/lib/auth/routeUser";
import { createServiceClient } from "@/lib/supabaseServer";
import { isSupportedCountry } from "@/lib/countries";
import { requireEmailVerified } from "@/lib/auth/emailVerification";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ELIGIBLE_ORDER_STATUSES = [
  "paid",
  "processing",
  "dispatched",
  "shipped",
  "delivered",
];

export async function POST(req: NextRequest) {
  try {
    const admin = createServiceClient();

    const userId = (await getRouteUser(req))?.id;
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Email verification gate. Stops fake-email accounts from posting
    // reviews that influence storefront credibility.
    const block = await requireEmailVerified(userId);
    if (block) {
      return NextResponse.json(
        { ok: false, error: block.message, code: "email_not_verified" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.product_id || "").trim();
    const rating = Number(body?.rating || 0);
    const title = body?.title ? String(body.title) : null;
    const bodyText = body?.body ? String(body.body) : null;
    const photos = Array.isArray(body?.photos) ? body.photos : [];
    const displayName = body?.display_name ? String(body.display_name) : null;
    const avatarUrl = body?.avatar_url ? String(body.avatar_url) : null;

    if (!productId || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "INVALID_REVIEW_PAYLOAD" },
        { status: 400 }
      );
    }

    // Decide the verified-purchase flag — we no longer gate review
    // creation on it. Non-purchasers can leave a review; their row is
    // simply written without the verified-purchase badge so the PDP
    // can visually distinguish customer vs. non-customer feedback.
    //
    // Two cheap queries beat one big join here — we can short-circuit
    // the second query if the user has zero eligible orders at all.
    let isVerifiedPurchase = false;

    const { data: orders, error: orderErr } = await admin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", ELIGIBLE_ORDER_STATUSES);

    if (orderErr) {
      return NextResponse.json(
        { ok: false, error: orderErr.message },
        { status: 500 }
      );
    }

    const orderIds = (orders ?? []).map((o: any) => o.id);
    if (orderIds.length > 0) {
      const { data: purchased, error: purchaseErr } = await admin
        .from("order_items")
        .select("order_id")
        .eq("product_id", productId)
        .in("order_id", orderIds)
        .limit(1);

      if (purchaseErr) {
        return NextResponse.json(
          { ok: false, error: purchaseErr.message },
          { status: 500 }
        );
      }

      isVerifiedPurchase = !!(purchased && purchased.length > 0);
    }

    // Snapshot the reviewer's country onto the row so the storefront
    // can group/filter reviews by country without joining live (and
    // so old reviews don't suddenly say "Vietnam" if a reviewer
    // changes their country later). Priority: profile.preferred_country
    // (the explicit user choice) → mik_country cookie (the geo/visitor
    // signal) → null (we leave it for backfill rather than guessing).
    let reviewerCountry: string | null = null;
    const { data: profileRow } = await admin
      .from("profiles")
      .select("preferred_country")
      .eq("id", userId)
      .maybeSingle<{ preferred_country: string | null }>();
    if (profileRow?.preferred_country && isSupportedCountry(profileRow.preferred_country)) {
      reviewerCountry = profileRow.preferred_country;
    } else {
      const cookieCountry = cookies().get("mik_country")?.value;
      if (cookieCountry && isSupportedCountry(cookieCountry)) {
        reviewerCountry = cookieCountry;
      }
    }

    const reviewId = randomUUID();
    const { error: insertErr } = await admin.from("product_reviews").insert({
      id: reviewId,
      product_id: productId,
      user_id: userId,
      rating,
      title,
      body: bodyText,
      photos,
      is_verified_purchase: isVerifiedPurchase,
      status: "pending",
      display_name: displayName,
      avatar_url: avatarUrl,
      country: reviewerCountry,
    });

    if (insertErr) {
      if ((insertErr as any).code === "23505") {
        return NextResponse.json(
          { ok: false, error: "ALREADY_REVIEWED" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: insertErr.message },
        { status: 500 }
      );
    }

    // Dual-write to MySQL with the same id. New reviews are 'pending' (not in
    // the published list yet), so this just keeps MySQL ready for publish.
    try {
      const { prisma } = await import("@/lib/db/prisma");
      await prisma.product_reviews.create({
        data: {
          id: reviewId, product_id: productId, user_id: userId, rating,
          title, body: bodyText, photos, is_verified_purchase: isVerifiedPurchase,
          status: "pending", display_name: displayName, avatar_url: avatarUrl, country: reviewerCountry,
        },
      });
    } catch (e) {
      console.error("[dual-write] review create MySQL failed:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "REVIEW_CREATE_FAILED" },
      { status: 500 }
    );
  }
}
