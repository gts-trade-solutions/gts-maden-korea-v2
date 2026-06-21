"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/lib/contexts/CartContext";
import { trackEvent } from "@/lib/analytics/track";

export type AttributionSnapshot = null | {
  type: "promo" | "link";
  code?: string;
  product_id?: string | null;
};

export type AddressSnapshot = null | {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
};

declare global {
  interface Window {
    Razorpay?: any;
  }
}

export function useRazorpayCheckout() {
  const router = useRouter();
  const busyRef = useRef(false);
  // Cart context — used to flush the in-memory items + totals after a
  // successful payment. Without this, the verify route clears the DB
  // cart but the badge + cart page keep their stale React state until
  // the user manually refreshes.
  const cart = useCart();

  const start = async (
    address: AddressSnapshot = null,
    attribution: AttributionSnapshot = null,
    uiTotal?: number | null,
    uiShippingFee?: number | null,
    onConfirming?: () => void
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;

    try {
      // Order creation now goes through the API route: Supabase
      // create_order_from_cart stays authoritative, and the new order is
      // mirrored into MySQL so the account pages see it.
      const createRes = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: address ?? null, notes: null }),
      });
      const createJson = await createRes.json().catch(() => ({} as any));

      if (!createRes.ok || !createJson?.ok || !createJson?.order_id) {
        toast.error(createJson?.error || "Could not create order");
        busyRef.current = false;
        return;
      }

      const info = createJson as {
        order_id: string;
        total: number;
        order_number?: string;
      };

      const res = await fetch("/api/razorpay/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: info.order_id,
          ui_total: typeof uiTotal === "number" ? uiTotal : info.total,
          ui_shipping_fee:
            typeof uiShippingFee === "number" ? uiShippingFee : undefined,
          attribution,
        }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.razorpay_order?.id) {
        toast.error(j?.error ? String(j.error) : "Payment init failed");
        busyRef.current = false;
        return;
      }

      const { key, razorpay_order } = j;

      if (typeof uiTotal === "number") {
        console.log(
          "[RZP] Proceeding with total:",
          razorpay_order.amount / 100,
          "UI total:",
          uiTotal,
          "UI shipping:",
          uiShippingFee
        );
      }

      if (!window.Razorpay) {
        toast.error("Razorpay SDK not loaded");
        busyRef.current = false;
        return;
      }

      const rzp = new window.Razorpay({
        key,
        amount: razorpay_order.amount,
        currency: razorpay_order.currency,
        // Merchant branding shown at the top of the Razorpay modal.
        // Anything generic ("Checkout", "Order") undermines trust at
        // the exact moment customers are entering card details.
        //
        // Logo: a purpose-built 1:1 SVG (`razorpay-merchant-logo.svg`).
        // Razorpay centre-crops to a tight square, which mangled
        // `logo-md.png` (brand mark left, wordmark right — both halves
        // cut) and shaved the `.CO` off `square-logo.png` (which is
        // 353x318, not actually square). The dedicated 512×512 asset
        // has the MADEN-KOREA wordmark stacked dead-centre so the
        // crop never touches type.
        name: "MadenKorea",
        description: "MadenKorea order payment",
        image:
          process.env.NEXT_PUBLIC_RAZORPAY_LOGO_URL ||
          "https://madenkorea.com/razorpay-merchant-logo.svg",
        order_id: razorpay_order.id,
        prefill: {
          name: address?.name || "",
          email: address?.email || "",
          contact: address?.phone || "",
        },
        notes: { app_order_id: info.order_id },
        handler: async (resp: any) => {
          // Fire as soon as Razorpay returns control. Verify can take a
          // few seconds (signature check + payments row + emails); this
          // lets the host page draw a full-screen "Confirming…" overlay
          // immediately so the checkout UI doesn't appear stuck.
          try {
            onConfirming?.();
          } catch (e) {
            console.warn("[PAY] onConfirming callback threw", e);
          }
          trackEvent("payment_succeeded", {
            order_id: info.order_id,
            razorpay_order_id: resp?.razorpay_order_id ?? null,
            razorpay_payment_id: resp?.razorpay_payment_id ?? null,
            amount: razorpay_order.amount / 100,
          });
          try {
            const verify = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
                app_order_id: info.order_id,
                raw: resp,
              }),
            });

            const vj = await verify.json().catch(() => ({}));

            if (!verify.ok || !vj?.ok) {
              toast.error(vj?.error || "Payment verification failed");
              router.replace(
                `/order/failure?reason=verification&order_id=${encodeURIComponent(
                  info.order_id
                )}`
              );
              return;
            }

            const successOrderId = vj.order_id || info.order_id;
            try {
              if (typeof window !== "undefined" && successOrderId) {
                sessionStorage.setItem("last_success_order_id", successOrderId);
                sessionStorage.setItem("payment_success_redirecting", "1");
              }
            } catch (e) {
              console.warn("[PAY] could not persist success order id", e);
            }

            router.replace(
              `/order/success?order=${encodeURIComponent(successOrderId)}`
            );

            // Flush the client-side cart state (badge, cart page items,
            // totals) AFTER nav has been kicked off so the checkout
            // page's empty-cart guard doesn't short-circuit the
            // /order/success redirect. The DB cart was already cleared
            // by the verify route via `cart_clear_for_user`; this just
            // syncs the React state.
            void (async () => {
              try {
                await cart.clear();
                if (typeof window !== "undefined") {
                  localStorage.setItem("guest_cart_v1", "[]");
                  sessionStorage.removeItem("guest_cart_v1");
                }
              } catch (e) {
                console.warn("[CART] clear warning", e);
              }
            })();
          } catch (e: any) {
            console.error("[PAY] verify handler error", e);
            toast.error(e?.message || "Payment error");
          } finally {
            busyRef.current = false;
          }
        },
        modal: {
          ondismiss() {
            toast.info("Payment cancelled");
            trackEvent("payment_cancelled", {
              order_id: info.order_id,
              razorpay_order_id: razorpay_order.id,
            });
            router.replace(
              `/order/failure?reason=cancelled&order_id=${encodeURIComponent(
                info.order_id
              )}`
            );
            busyRef.current = false;
          },
        },
        // Brand accent for the Razorpay modal (button + highlight tint).
        // Razorpay's `theme.color` tints the header band and CTA
        // buttons; the modal body itself stays on a light background
        // by default. Using the brand coral (matches the "Order
        // Confirmed" pill in our SES emails) keeps the modal feeling
        // light and on-brand instead of stock-teal or dark.
        theme: { color: "#ea580c" },
      });

      rzp.on("payment.failed", function (resp: any) {
        console.error("[RZP] payment.failed", resp);
        toast.error(
          resp?.error?.description || resp?.error?.reason || "Payment failed"
        );
        trackEvent("payment_failed", {
          order_id: info.order_id,
          razorpay_order_id: razorpay_order.id,
          reason: resp?.error?.reason ?? null,
          description: resp?.error?.description ?? null,
          step: resp?.error?.step ?? null,
          source: resp?.error?.source ?? null,
        });
        router.replace(
          `/order/failure?reason=failed&order_id=${encodeURIComponent(
            info.order_id
          )}`
        );
        busyRef.current = false;
      });

      trackEvent("payment_modal_opened", {
        order_id: info.order_id,
        razorpay_order_id: razorpay_order.id,
        amount: razorpay_order.amount / 100,
      });
      rzp.open();
    } catch (e: any) {
      console.error("[RZP] checkout start failed", e);
      toast.error(e?.message || "Unable to start payment");
      busyRef.current = false;
    }
  };

  return { start };
}
