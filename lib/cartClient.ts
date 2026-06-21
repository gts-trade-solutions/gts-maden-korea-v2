// lib/cartClient.ts
// Client-side cart calls now go through server API routes (MySQL behind the
// flag, dual-writing to Supabase to keep checkout in sync). No direct Supabase
// access here anymore. Function signatures are unchanged so CartContext is
// untouched.

export type CartTotals = {
  id: string;
  currency: string;
  subtotal: number;
  shipping_fee_estimate: number;
  discount_total: number;
  total_estimate: number;
};

async function postMutate(payload: any) {
  const res = await fetch("/api/cart/mutate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) throw new Error(json?.error || "Cart operation failed");
  return json;
}

async function getState(): Promise<{ cart: CartTotals | null; items: any[] }> {
  const res = await fetch("/api/cart/state", { cache: "no-store" });
  const json = await res.json().catch(() => ({} as any));
  return { cart: json?.cart ?? null, items: json?.items ?? [] };
}

export async function ensureCartId(): Promise<string> {
  const { cartId } = await postMutate({ action: "ensure" });
  return cartId as string;
}

export async function fetchCart(): Promise<CartTotals | null> {
  return (await getState()).cart;
}

export async function fetchCartItems(_cartId: string) {
  return (await getState()).items;
}

export async function rpcAddToCart(productId: string, qty = 1) {
  return postMutate({ action: "add", product_id: productId, qty });
}

export async function rpcUpdateItem(itemId: string, qty: number) {
  await postMutate({ action: "update", item_id: itemId, qty });
}

export async function rpcRemoveItem(itemId: string) {
  await postMutate({ action: "remove", item_id: itemId });
}

export async function rpcMergeGuestCart(items: { product_id: string; quantity: number }[]) {
  await postMutate({ action: "merge", items });
}
