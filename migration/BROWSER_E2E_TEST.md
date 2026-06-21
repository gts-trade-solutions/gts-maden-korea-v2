# MadenKorea — Pre-Production Browser E2E Test (Claude for Chrome)

Paste the prompt below into Claude for Chrome. Substitute the credentials first.
The localhost app is running the **migrated** backends (NextAuth auth + MySQL reads +
S3/CloudFront storage), so this test validates the real pre-production stack.

Credentials (same account is BOTH customer and admin):
- Email: `{{ADMIN_EMAIL}}`
- Password: `{{ADMIN_PASSWORD}}`

---

You are a meticulous QA tester driving a real browser. Test the MadenKorea app end-to-end at
**http://localhost:3000**. This build runs new backends (NextAuth login, MySQL-backed reads,
AWS S3/CloudFront images), so watch specifically for login failures, broken images, and stale
data. Work through EVERY section. For each step, state PASS/FAIL, capture a screenshot on any
failure, and note any browser-console errors (especially 401s or "Auth session missing").

GLOBAL RULES — do NOT violate:
1. NEVER complete a real payment. When the Razorpay window opens, confirm it loads and shows the
   amount, then CLOSE it (X / back). Do not enter card details.
2. Do NOT actually change the admin account's password (you'd lock yourself out). For password
   change: open the form, try a WRONG current password, confirm it's rejected, then stop.
3. Do NOT approve an email-change request or change the admin email. Submitting a request is fine.
4. In admin: do NOT demote/delete your own user, do NOT send real email/WhatsApp campaigns, and
   only delete a record you just created as test data — never a real product/order.
5. Navigate by clicking the site's own nav/menus; don't guess URLs (there's no /products index).
6. Report the URL of anything that 404s, 500s, shows a broken image, or shows an error toast.

Use this account for everything (it is both a customer and an admin):
- Email: {{ADMIN_EMAIL}}  Password: {{ADMIN_PASSWORD}}

────────────────────────────────────────────────────────
PHASE 1 — Public storefront (logged OUT; open an incognito/guest window first)
- Home page (/): hero, banners, "featured"/"trending" product rails, the home video carousels,
  K-Partnership video, and brand logos all render with NO broken images. [verifies S3/CloudFront]
- Use the top nav / category menu to open each category listing (Skin Care, Hair Care, Baby,
  Life & Home). Products + images load.
- Open 2–3 product detail pages. Verify: gallery images, price, "Add to cart", quantity,
  reviews section, any "story"/rich content, related products.
- Search: use the search box for a known term; results + thumbnails load.
- Add a product to the cart as a GUEST; open /cart; change quantity; confirm totals update.
- Add to wishlist as a guest.
- Visit static pages via footer: FAQ, Contact, K-Plus, Services, Shop @199, and each Policy /
  Privacy / Terms page — all load without error.

PHASE 2 — Auth
- Go to login. Confirm the page shows email/password AND Google + Facebook buttons.
- (Optional, if you can) click "Continue with Google" and verify it redirects to Google's consent
  screen, then cancel/back. Same for Facebook. Do not complete OAuth unless you have test creds.
- Log in with the email/password above. Confirm you land logged-in (name/account menu appears).
- Confirm the guest cart/wishlist from Phase 1 merged into the account (items still present).
- Open the password-reset page ("Forgot password"), submit the admin email, confirm it accepts
  the request (a "check your email" confirmation). Do not complete it.

PHASE 3 — Customer account (logged in)
- /account: profile loads with the correct name/email; edit a profile field and Save — confirm it
  persists after refresh.
- Orders: open the orders list, open an order's detail, open its Invoice — all render.
- Addresses: ADD a new address, EDIT it, then DELETE it — each reflects immediately.
- Settings → Password: open the change-password form, enter a WRONG current password + a new one,
  Submit, and confirm it's REJECTED with "incorrect" (DO NOT do a real change).
- Settings → Email change: submit a request to change to a test email; confirm a "pending review"
  state appears. (An admin can reject it later — see Phase 6.)
- If a display-currency / preferences control exists, change it and confirm it saves on refresh.

PHASE 4 — Cart → Checkout → Razorpay (OPEN-ONLY)
- Ensure the cart has at least one in-stock product.
- Open /checkout. Fill the shipping address (or pick the saved one). Confirm the order summary
  shows item subtotal, shipping fee, and total, and that they add up.
- Click Pay/Place order. Confirm the **Razorpay** modal/window OPENS and shows the order amount
  and payment options. Then CLOSE it without paying.
- Back on the site, confirm NO "order placed/success" happened and the cart still has the items
  (i.e. closing Razorpay did not falsely complete the order). Watch for "Auth session missing".

PHASE 5 — Influencer / referral
- Open the K-Partnership / "Become an influencer" application page (/influencer-request). Submit
  the application form. Confirm a success/"pending" state (NOT an error). [recently fixed path]
- Open /influencer (dashboard). If accessible: view earnings/summary, payouts, promos, links —
  all load without error or empty-zeros-with-console-error.
- If the promos UI is available: CREATE a promo code, EDIT it (change %), then DELETE it. Confirm
  the dashboard updates each time. [recently fixed — verify delete actually removes it]
- If a "Request payout" form exists, open it and confirm it loads + validates (don't submit a real
  withdrawal unless there's a test balance).
- Visit a referral link if you have one (/r/<code>) and confirm it redirects into the store.

PHASE 6 — Admin portal (same login; it has the admin role)
- /admin: dashboard + metrics load.
- Products: open /admin/products. Edit a product's "featured"/"trending"/publish toggles and Save;
  then open that product on the storefront (new tab) and confirm the change is reflected.
  [verifies admin→storefront dual-write]. Open the product editor; confirm existing images load.
  Open "Create product" and confirm the form renders (you may cancel).
- Orders: /admin/orders list; open an order; change its status and confirm it saves. (Do NOT
  delete a real order.)
- Vendors: /admin/vendors list loads.
- Influencers: /admin/influencers — view requests; if there's a pending request you created in
  Phase 5, you can Approve/Reject it. View payouts + settings.
- CMS (/admin/cms/...): for Banners, Brands, Categories, Product-Video, Influencer-Video,
  K-Partnership-Video, Story — open each; confirm existing thumbnails/previews render (NOT broken)
  [S3]; make one small edit or toggle and confirm it saves; if easy, upload one small test image
  and confirm it appears. Then check the storefront reflects a change [dual-write].
- Email: /admin/email dashboard, contacts, templates load. Open "Send" but DO NOT send.
- Settings: open Shipping (change the free-shipping threshold, save, then verify on a fresh
  checkout that the shipping fee math changed), plus Business info, Notification emails, etc.
- Analytics: funnel + sessions pages load with data.
- Users: /admin/users list loads; the role toggle is visible (DO NOT demote yourself).
- Reject the test email-change request from Phase 3 so it doesn't linger.

PHASE 7 — Cross-cutting
- Throughout, flag ANY broken image (especially product/banner/brand thumbnails) — that indicates
  an S3/CloudFront resolution miss.
- Flag ANY page showing "Auth session missing!", an "Unauthorized"/401 toast, or a 500.
- Resize to a phone width and spot-check the home, a product page, the cart, and checkout for
  layout breakage.
- Log OUT and confirm protected pages (/account, /admin) redirect to login.

────────────────────────────────────────────────────────
FINAL REPORT — produce a table: Phase | Step | PASS/FAIL | Notes/Screenshot. Then list, in
priority order: (1) anything broken on login/checkout/admin-save/images, (2) console errors,
(3) cosmetic issues. Be specific with URLs.
