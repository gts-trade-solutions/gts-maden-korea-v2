// Proves the *_as(p_user_id,…) service-role wrappers drive the real cart/order
// RPCs as a specific user (auth.uid() resolved via the set GUC) — the NextAuth
// bridge, tested directly with NO route changes and NO nextauth server.
// Self-cleaning. Run: node migration/etl/test-as-wrappers.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const EMAIL = `aswrap-${Date.now()}@example.com`;

let userId = null;
let orderId = null;
try {
  // in-stock, published product
  const { data: prod } = await sb
    .from("products")
    .select("id, name, price, track_inventory, stock_qty")
    .eq("is_published", true)
    .gt("price", 0)
    .or("track_inventory.eq.false,stock_qty.gt.0")
    .limit(1)
    .maybeSingle();
  console.log(`product: ${prod?.name} (${prod?.id})`);
  if (!prod?.id) throw new Error("no product");

  // throwaway Supabase user (handle_new_user trigger creates its profile)
  const { data: created, error: cErr } = await sb.auth.admin.createUser({
    email: EMAIL, password: "Testpass1!", email_confirm: true,
    user_metadata: { full_name: "AS Wrap" },
  });
  if (cErr) throw cErr;
  userId = created.user.id;
  console.log(`user: ${userId}`);

  // 1) ensure_cart_as
  const r1 = await sb.rpc("ensure_cart_as", { p_user_id: userId });
  console.log(`ensure_cart_as:        ${r1.error ? "ERR " + r1.error.message : "cartId=" + r1.data}`);
  if (r1.error) throw r1.error;

  // 2) add_to_cart_as
  const r2 = await sb.rpc("add_to_cart_as", { p_user_id: userId, p_product_id: prod.id, p_qty: 2 });
  console.log(`add_to_cart_as:        ${r2.error ? "ERR " + r2.error.message : JSON.stringify(r2.data?.[0] ?? r2.data)}`);
  if (r2.error) throw r2.error;

  // verify cart_items row exists for this user
  const { data: cart } = await sb.from("carts").select("id").eq("user_id", userId).maybeSingle();
  const { data: items } = await sb.from("cart_items").select("id, product_id, quantity, line_total").eq("cart_id", cart?.id);
  console.log(`cart_items (verify):   ${items?.length ?? 0} row(s) ${JSON.stringify(items?.[0] ?? null)}`);

  // 3) create_order_from_cart_as
  const address = { full_name: "AS Wrap", phone: "9999999999", line1: "1 Test St", city: "Chennai", state: "TN", postal_code: "600001", country: "IN" };
  const r3 = await sb.rpc("create_order_from_cart_as", { p_user_id: userId, p_address: address, p_notes: "as-wrapper test" });
  const info = r3.data?.[0];
  orderId = info?.order_id;
  console.log(`create_order_from_cart_as: ${r3.error ? "ERR " + r3.error.message : "order=" + info?.order_number + " total=" + info?.total}`);
  if (r3.error) throw r3.error;

  // verify order belongs to the user
  const { data: ord } = await sb.from("orders").select("id, user_id, order_number, total").eq("id", orderId).maybeSingle();
  const ownerOk = ord?.user_id === userId;
  console.log("─".repeat(60));
  console.log(
    items?.length && orderId && ownerOk
      ? `✅ PASS — wrappers drove cart + order AS the user (auth.uid() bridged). order ${ord.order_number}, owner match ${ownerOk}`
      : `❌ FAIL — items=${items?.length}, order=${orderId}, ownerMatch=${ownerOk}`
  );
} catch (e) {
  console.error("ERROR:", e.message || e);
} finally {
  // cleanup
  try { if (orderId) { await sb.from("order_items").delete().eq("order_id", orderId); await sb.from("orders").delete().eq("id", orderId); } } catch (e) { console.error("cleanup order:", e.message); }
  if (userId) {
    try { const { data: c } = await sb.from("carts").select("id").eq("user_id", userId).maybeSingle(); if (c) { await sb.from("cart_items").delete().eq("cart_id", c.id); await sb.from("carts").delete().eq("id", c.id); } } catch {}
    try { await sb.auth.admin.deleteUser(userId); } catch (e) { console.error("cleanup user:", e.message); }
  }
  console.log("cleaned up");
}
