/**
 * Whitelist of event names. Anything else is dropped server-side so a
 * compromised browser can't pollute the funnel with arbitrary names.
 */
export const KNOWN_EVENTS = [
  "page_view",
  "product_view",
  "add_to_cart",
  "remove_from_cart",
  "checkout_started",
  "pincode_checked",
  "pincode_blocked",
  "pay_clicked",
  "payment_modal_opened",
  "payment_succeeded",
  "payment_failed",
  "payment_cancelled",
  "order_placed",
  "signup",
  "login",
  "logout",
  "promo_applied",
] as const;

export type KnownEvent = (typeof KNOWN_EVENTS)[number];

export function isKnownEvent(name: unknown): name is KnownEvent {
  return typeof name === "string" && (KNOWN_EVENTS as readonly string[]).includes(name);
}

export const FUNNEL_STAGES: Array<{
  key: string;
  label: string;
  match: KnownEvent | KnownEvent[];
}> = [
  { key: "visited", label: "Visited site", match: "page_view" },
  { key: "viewed_product", label: "Viewed a product", match: "product_view" },
  { key: "added_to_cart", label: "Added to cart", match: "add_to_cart" },
  { key: "started_checkout", label: "Started checkout", match: "checkout_started" },
  { key: "clicked_pay", label: "Clicked Pay", match: "pay_clicked" },
  { key: "opened_modal", label: "Opened Razorpay", match: "payment_modal_opened" },
  { key: "purchased", label: "Purchased", match: "order_placed" },
];
