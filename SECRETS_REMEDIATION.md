# C-39 — Secrets remediation checklist

Created 2026-04-27. Action required by repo owner.

## Summary

The working tree `.env` contains real production-grade credentials.
`.env` IS listed in `.gitignore`, but the audit (C-39) flagged a risk
that `.env` may have been committed to git history at some point
*before* the gitignore rule was added. The working tree exposed in this
session does not contain a `.git` directory, so I cannot verify history
from here. **You need to run the git-history check yourself, then
rotate any credential found.**

---

## Step 1 — Check git history for `.env` exposure

From the repo root, on a machine with the `.git` directory present:

```bash
# Has .env ever been committed?
git log --all --full-history --diff-filter=A -- .env

# Has any line from .env ever appeared in a commit?
git log --all -p -S "RAZORPAY_KEY_SECRET" -- .
git log --all -p -S "SUPABASE_SERVICE_ROLE_KEY" -- .
git log --all -p -S "SES_SECRET_ACCESS_KEY" -- .

# Bulk scan for any credential-shaped strings in commits
git log --all -p | grep -iE "(secret|key|password|token).*=.{12,}" | head -40
```

If any of these return matches, **at least one of the credentials below
was once in a commit** — even if `.env` is now gitignored, the secret
is in the git history forever and must be rotated.

If you've ever pushed the repo to GitHub / GitLab / Bitbucket, treat
exposed secrets as **publicly leaked** even if the repo is private —
forks, mirrors, and CI clones can preserve old commits.

---

## Step 2 — Credentials present in the working-tree `.env` (rotate if exposed)

### High severity — rotate immediately if exposed

| Variable | Service | Where to rotate |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (full DB access bypassing RLS) | Supabase dashboard → Settings → API → "Reset service role key" |
| `OPENAI_API_KEY` | OpenAI (paid) | platform.openai.com → API keys → revoke + create new |
| `RAZORPAY_KEY_SECRET` (currently `rzp_test_*`) | Razorpay (payment gateway) | dashboard.razorpay.com → Account & Settings → API Keys → Regenerate. Note this is a **test** key from the prefix; if production keys ever lived here, rotate those too. |
| `SES_ACCESS_KEY_ID` + `SES_SECRET_ACCESS_KEY` | AWS SES (send email as merchant) | AWS IAM console → Users → access keys → deactivate + create new |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp Cloud API | Meta Business Suite → System Users → token → revoke + regenerate |
| `META_APP_SECRET` + `META_IG_APP_SECRET` | Meta App + Instagram Graph | developers.facebook.com → App Dashboard → Settings → Basic → Reset App Secret |
| `DTDC_SHIPSY_API_KEY` | DTDC / Shipsy shipping (book + cancel shipments on merchant account) | Contact DTDC support to rotate; they don't have a self-service rotation UI |
| `DTDC_TRACK_PASSWORD` (currently placeholder `YOUR_PASSWORD`) | DTDC tracking | placeholder — no rotation needed unless real value was ever committed |

### Public by design — no rotation needed (just present here for accuracy)

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon JWT, safe to expose
- `NEXT_PUBLIC_SUPABASE_URL` — public URL
- `NEXT_PUBLIC_FACEBOOK_APP_ID`, `NEXT_PUBLIC_META_IG_APP_ID` — public Meta app IDs
- `META_APP_ID`, `META_IG_APP_ID` — public Meta app IDs
- `INSTAGRAM_OWNER_ID` — internal UUID, low value
- `RAZORPAY_KEY_ID` (currently `rzp_test_*`) — public-side key, but rotate the **secret** if exposed
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` — same

### Configuration / non-secrets

- All `DTDC_PICKUP_*` warehouse details — operational info, not secrets
- `AWS_FROM_EMAIL`, `DTDC_PICKUP_EMAIL` — email addresses, not secrets
- `DTDC_DEFAULT_*`, `DTDC_LABEL_CODE_*`, `META_IG_GRAPH_API_*`, `WHATSAPP_API_VERSION`, `REF_ATTRIBUTION_DAYS` — configuration values
- `META_IG_REDIRECT_URI=http://localhost:3000/...` — dev redirect, harmless

---

## Step 3 — Clean git history if anything was committed

If Step 1 found commits that contain secrets:

```bash
# Install git-filter-repo (recommended over git filter-branch)
pip install git-filter-repo
# or: brew install git-filter-repo

# From a fresh clone:
git clone <repo>
cd <repo>

# Strip any path that ever contained the .env content
git filter-repo --invert-paths --path .env

# OR strip all blobs above a size that look credential-shaped — careful
# with this; use --replace-text with a redaction list:
echo 'RAZORPAY_KEY_SECRET=***REDACTED***' > redactions.txt
echo 'SUPABASE_SERVICE_ROLE_KEY=***REDACTED***' >> redactions.txt
git filter-repo --replace-text redactions.txt

# Force-push (this rewrites history; coordinate with everyone who has
# a local clone — they'll need to re-clone)
git push --force --all
git push --force --tags
```

Treat history-rewrite as a coordinated team event. Anyone with a local
clone needs to re-clone afterward; old PRs may need to be recreated.

---

## Step 4 — Lock the gate going forward

- Confirm `.env` is in `.gitignore` (it is — line 28 today).
- Add a pre-commit hook (e.g. `gitleaks` or `detect-secrets`) so future
  commits with credential-shaped strings are blocked at commit time.
- Consider moving secrets out of `.env` entirely in production — use
  Vercel env vars, Supabase project secrets, AWS Secrets Manager, etc.
- Audit who has access to the repo + the production env (anyone with
  read access to either has read access to these secrets).

---

## Status — close the issue when

- [ ] Step 1 git-history scan run
- [ ] If any commits found → all 8 high-severity credentials rotated
- [ ] If any commits found → history rewritten + force-pushed
- [ ] Pre-commit secret-scanning hook installed
- [ ] `ISSUE_REGISTER.md` C-39 marked closed with date + scan result

Until those boxes are ticked, **C-39 stays open** in the issue register.
The other four items in this batch (C-31, C-40, C-41, C-32) closed
fully in the live database / code on 2026-04-27.
