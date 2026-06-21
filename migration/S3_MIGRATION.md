# Supabase Storage → AWS S3 Migration

Status: **CODE-COMPLETE & verified (reads + uploads) behind `NEXT_PUBLIC_STORAGE_BACKEND`.** Last updated 2026-06-21.
Strangler-fig: default `supabase` (zero behavior change); flip to `s3` to cut over; reversible by flipping back.

## Infrastructure (done)
- **Bucket** `madenkorea-media` (ap-south-1), public-read policy + CORS (PUT/GET). AWS acct `295554884326`, profile `security-admin`.
- **Data**: 585/585 *retrievable* objects copied, S3 key = `<supabase-bucket>/<relative-path>` (1:1, no DB rewrite).
  25 objects are broken at the source (Supabase 400s them too) — see `etl/migration-broken-source-files.txt`.
- Supabase buckets left intact (instant flip-back; old absolute URLs in already-sent emails/sitemaps keep resolving).

## Code (done, typecheck-clean — 84 pre-existing baseline, 0 new)
- `lib/storage/backend.ts` — `resolveMediaUrl(bucket, path)` (normalizer + backend branch) + `STORAGE_BACKEND`.
- `lib/storage/s3.ts` — server S3 client (presign / put / head / delete / list).
- `lib/storage/upload-client.ts` — `uploadMedia` / `deleteMedia` (presign→PUT under s3, session `.upload` under supabase).
- `app/api/uploads/presign` + `app/api/uploads/delete` — auth-gated brokers (admin buckets vs review-media customer).
- READ sites (~25) → `resolveMediaUrl`; `publicURL` + `supabaseImageLoader` made backend-aware; `next.config.js` allowlists the S3 host.
- UPLOAD sites (12): product editors, ProductForm, story editor, CMS banners/brands/influencer-video/product-video,
  review-photo upload → `uploadMedia`; `/api/uploads/social` (server) + k-partnership route (list/delete) + the
  k-partnership XHR uploader (→ presigned PUT with progress) branch on the flag.
- Also fixed the k-partnership CMS page's admin gate (was `getUser`+`is_admin` → now `useAuth().isAdmin`).

## Verified
- Reads: real `products.hero_image_path` / `banners.image_path` → S3 URLs return **200** (`etl/...` HEAD checks).
- Uploads: `etl/test-s3-upload.mjs` → presign + PUT + S3 HEAD + public GET = **200** for product-media (admin) AND review-media (customer) under NextAuth.

## CloudFront CDN (created 2026-06-21)
- Distribution **E2W7MA93L150TP**, domain **dlzqvzfi13zj5.cloudfront.net**, origin = public S3 bucket,
  CachingOptimized policy, PriceClass_200 (incl. India), compress + http2/3. (Deploy ~10 min after create.)
- Once `Status: Deployed`, prefer the CloudFront domain for `NEXT_PUBLIC_MEDIA_CDN_URL` (cheaper egress via the
  1 TB free tier + edge cache; the resolver builds `https://dlzqvzfi13zj5.cloudfront.net/<bucket>/<key>` and
  next.config auto-allowlists the host). Note: CloudFront caches but does NOT resize — full-size images still
  served; edge resize would need a Lambda@Edge/serverless-image-handler add-on (deferred for cost).

## To FLIP (cutover)
Add to `.env.local` (and the prod/server env):
```
NEXT_PUBLIC_STORAGE_BACKEND=s3
# direct S3 (works now) OR the CloudFront domain once deployed (preferred):
NEXT_PUBLIC_MEDIA_CDN_URL=https://dlzqvzfi13zj5.cloudfront.net
S3_MEDIA_BUCKET=madenkorea-media
AWS_REGION=ap-south-1
# server S3 creds for presign/delete/social: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
# (locally: AWS_PROFILE=security-admin)
```
Restart. Rollback = remove `NEXT_PUBLIC_STORAGE_BACKEND` (back to Supabase; data untouched).

## Known follow-ups (not blockers)
1. **No image transform under S3** — `supabaseImageLoader` no-ops, so full-resolution originals are served.
   Add a CloudFront distribution (+ image-resize Lambda@Edge / a transform) and point `NEXT_PUBLIC_MEDIA_CDN_URL`
   at it for bandwidth/LCP. (Also gives cache-control on presigned uploads, which are currently un-cache-controlled.)
2. **`/api/uploads/social` has no auth guard** (pre-existing) — recommend gating with `requireAdmin`.
3. **Dual `_path` + `_url` columns** (home_product_videos, brands.thumbnail_url, banners.video_url) store full
   Supabase URLs; readers route them through `resolveMediaUrl` so they re-map to S3. Decide whether to also rewrite
   the stored `_url` values (cosmetic; resolves either way while Supabase stays alive).
4. **25 broken-source files** — re-upload via admin if any product images matter.
5. Delete the Supabase buckets only after a comfortable bake-in (they remain the flip-back path).
