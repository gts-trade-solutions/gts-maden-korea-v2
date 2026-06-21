# Admin CRUD Persistence Re-test (Claude for Chrome)

Targeted re-test of the Phase-1 fix: admin/CMS saves used to show "Saved" then REVERT on
reload (browser-direct Supabase writes were RLS-denied under NextAuth). They now go through
server endpoints. This test confirms every admin save now PERSISTS after a hard reload.

Substitute credentials, then paste into Claude for Chrome. App: http://localhost:3000.
Admin account (also a customer): `{{ADMIN_EMAIL}}` / `{{ADMIN_PASSWORD}}`.

---

You are a QA tester. App at http://localhost:3000. Log in at /auth/login with
{{ADMIN_EMAIL}} / {{ADMIN_PASSWORD}} (this account is an admin).

WHAT YOU ARE VERIFYING: admin/CMS edits must PERSIST after reload. The bug being re-tested is
"Saved toast appears but the value reverts on reload." THE KEY STEP for every item below:
make the change -> Save -> HARD RELOAD the page (Ctrl+Shift+R) -> confirm the change is STILL
there. A revert = FAIL.

RULES:
- Restore anything you change on REAL data (toggle back, re-order back).
- Only DELETE data you created yourself in this test (the "QA Test" brand/category).
- Do NOT make any payment. Do NOT change the admin password/email. Watch the console for errors.

1) ADMIN PRODUCTS LIST (/admin/products)
   a. Pick any product. Toggle its "Featured" (or Trending) checkbox ON and click Save on that
      row. Expect a "Saved" toast. HARD RELOAD. -> the toggle must still be ON. Then toggle it
      OFF, Save, HARD RELOAD -> must be OFF (restored).
   b. Select 2 products (checkboxes), click Bulk Publish (or Hide). HARD RELOAD -> the published
      state persisted. Restore them to their original state the same way.

2) BRANDS (/admin/cms/brands)  — full create/edit/delete cycle on test data
   a. Create a brand named "QA Test Brand" (slug auto). Save. HARD RELOAD -> it appears in the list.
   b. Edit it: rename to "QA Renamed". Save. HARD RELOAD -> shows the new name.
   c. Delete "QA Renamed". HARD RELOAD -> it's gone.

3) CATEGORIES (/admin/cms/categories) — same create -> edit -> delete cycle with a "QA Test Cat".
   (If create errors on a required field, note it; otherwise complete the cycle and clean up.)

4) BANNERS (/admin/cms/banners)
   - Edit an existing banner's text/alt or link field. Save. HARD RELOAD -> persisted.
   - Toggle a banner's Active flag. HARD RELOAD -> persisted. Toggle it back (restore).

5) PRODUCT VIDEOS (/admin/cms/product-video)
   - Toggle a video's Active flag. HARD RELOAD -> persisted (restore after).
   - Edit a video's title. Save. HARD RELOAD -> persisted.
   - Use the up/down reorder on a video. HARD RELOAD -> the new order persisted. Restore the order.

6) INFLUENCER VIDEOS (/admin/cms/influencer-video) — repeat step 5 (toggle, edit title, reorder).

7) PRODUCT EDITOR (open a product from /admin/products -> Edit, or /admin/products/[id])
   - Change a simple field (e.g. short description). Save. Re-open / HARD RELOAD the editor ->
     the change persisted. Confirm existing product images still render (not broken).

8) STOREFRONT REFLECTION (proves admin -> MySQL -> storefront)
   - Back in /admin/products, toggle a product's "Featured" ON + Save. Open the home page in a
     NEW tab -> the product should appear in the Featured/Trending rail. Toggle it OFF + Save,
     reload home -> it's gone. (Restore to original.)

FINAL REPORT: a table — Area | Action | Persisted after reload? (PASS/FAIL) | Notes. Call out
explicitly any save that STILL reverts on reload, and any broken images or console errors.
