import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
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
    const userId = await getSessionUserId();
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

    const orders = await prisma.orders.findMany({
      where: { user_id: userId, status: { in: ELIGIBLE_ORDER_STATUSES } },
      select: { id: true },
    });

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length > 0) {
      const purchased = await prisma.order_items.findFirst({
        where: { product_id: productId, order_id: { in: orderIds } },
        select: { order_id: true },
      });
      isVerifiedPurchase = !!purchased;
    }

    // Snapshot the reviewer's country onto the row so the storefront
    // can group/filter reviews by country without joining live (and
    // so old reviews don't suddenly say "Vietnam" if a reviewer
    // changes their country later). Priority: profile.preferred_country
    // (the explicit user choice) → mik_country cookie (the geo/visitor
    // signal) → null (we leave it for backfill rather than guessing).
    let reviewerCountry: string | null = null;
    const profileRow = await prisma.profiles.findUnique({
      where: { id: userId },
      select: { preferred_country: true },
    });
    if (profileRow?.preferred_country && isSupportedCountry(profileRow.preferred_country)) {
      reviewerCountry = profileRow.preferred_country;
    } else {
      const cookieCountry = cookies().get("mik_country")?.value;
      if (cookieCountry && isSupportedCountry(cookieCountry)) {
        reviewerCountry = cookieCountry;
      }
    }

    const reviewId = randomUUID();
    try {
      await prisma.product_reviews.create({
        data: {
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
        },
      });
    } catch (insertErr: any) {
      if (insertErr?.code === "P2002") {
        return NextResponse.json(
          { ok: false, error: "ALREADY_REVIEWED" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: insertErr?.message || "REVIEW_CREATE_FAILED" },
        { status: 500 }
      );
    }

    // K-Points review bonus — verified purchases only (abuse guard; one review
    // per product per user is enforced by the unique constraint). Idempotent
    // per review id. Best-effort. If a moderation workflow is added later, move
    // this to the approval step.
    if (isVerifiedPurchase) {
      try {
        const { getEarnRule } = await import("@/lib/k-points/config");
        const { earn } = await import("@/lib/k-points/service");
        const rule = await getEarnRule("review");
        if (rule.enabled && rule.value > 0) {
          await earn({
            userId,
            points: Math.floor(rule.value),
            reason: "review",
            sourceType: "review",
            sourceId: reviewId,
            meta: { productId },
          });
        }
      } catch (e) {
        console.error("[reviews/create] k-points review bonus failed:", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "REVIEW_CREATE_FAILED" },
      { status: 500 }
    );
  }
}
