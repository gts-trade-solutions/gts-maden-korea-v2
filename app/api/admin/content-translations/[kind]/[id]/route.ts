// GET    /api/admin/content-translations/:kind/:id          — fetch source + all translations for the entity editor
// PATCH  /api/admin/content-translations/:kind/:id          — body: { locale, fields }  upsert admin edits (source='human')
// DELETE /api/admin/content-translations/:kind/:id?locale=pl — drop one translation row (revert to English fallback)
//
// The PATCH route is what lets admins override AI output. Setting
// source = 'human' on the row tells both the script and the post-
// save background hook to skip that locale on future runs.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  asKind,
  adminSupabase,
  getAdminOr401,
  json,
  KINDS,
} from "../../_lib";
import {
  TARGET_LOCALES,
  namespaceHash,
  pickTranslatablePayload,
  type TargetLocale,
} from "@/lib/contentTranslator";

type RouteParams = { params: { kind: string; id: string } };

export async function GET(_req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const kind = asKind(params.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);
  const cfg = KINDS[kind];
  const sb = adminSupabase();

  const [{ data: source, error: srcErr }, { data: rows, error: trErr }] =
    await Promise.all([
      sb
        .from(cfg.sourceTable)
        .select(cfg.sourceColumns.join(","))
        .eq("id", params.id)
        .maybeSingle(),
      sb
        .from(cfg.translationsTable)
        .select("*")
        .eq(cfg.fkColumn, params.id),
    ]);

  if (srcErr) return json({ ok: false, error: srcErr.message }, 500);
  if (trErr) return json({ ok: false, error: trErr.message }, 500);
  if (!source) return json({ ok: false, error: "ENTITY_NOT_FOUND" }, 404);

  // Compute the current source hash and tag each translation row with
  // a `stale` flag so the UI can show drift indicators without doing
  // its own hashing. Using the same `namespaceHash(pickTranslatablePayload)`
  // pipeline as the translator script + the per-entity translate API
  // means stale detection here is always consistent with the actual
  // skip-or-translate decision the translator makes.
  //
  // Edge cases:
  //   - source_hash null on a translation row (legacy data) → treat as
  //     stale = true. The admin should retranslate to refresh.
  //   - source_hash matches but row was human-edited → still NOT stale.
  //     The hash on a human row tracks the AI snapshot it was edited
  //     against; if that snapshot equals current source, the human
  //     edit is still aligned with the current English copy.
  //   - source_hash mismatch on a human row → stale = true, but the
  //     editor warns that retranslating will overwrite human edits.
  const currentSourceHash = namespaceHash(
    pickTranslatablePayload(kind, source as Record<string, any>)
  );

  const translationsWithStale = (rows ?? []).map((r: any) => {
    const stale = !r.source_hash || r.source_hash !== currentSourceHash;
    return { ...r, stale };
  });

  return json({
    ok: true,
    kind,
    locales: [...TARGET_LOCALES],
    translatableFields: [...cfg.translatableFields],
    source,
    currentSourceHash,
    translations: translationsWithStale,
  });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const kind = asKind(params.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);
  const cfg = KINDS[kind];

  const body = await req.json().catch(() => ({}));
  const locale = String(body?.locale ?? "");
  if (!(TARGET_LOCALES as readonly string[]).includes(locale))
    return json({ ok: false, error: "BAD_LOCALE" }, 400);

  const fields =
    body?.fields && typeof body.fields === "object" ? body.fields : null;
  if (!fields) return json({ ok: false, error: "BAD_FIELDS" }, 400);

  // Only allow updating fields the entity actually translates. Drops
  // anything outside translatableFields so malicious clients can't
  // poke at source_hash / source / created_at via this endpoint.
  const allowed: Record<string, any> = {};
  for (const f of cfg.translatableFields) {
    if (f in fields) allowed[f] = fields[f];
  }
  if (Object.keys(allowed).length === 0)
    return json({ ok: false, error: "NO_FIELDS" }, 400);

  const sb = adminSupabase();
  const upsertRow = {
    [cfg.fkColumn]: params.id,
    locale,
    ...allowed,
    source: "human",
    updated_at: new Date().toISOString(),
  };

  // We deliberately do NOT touch source_hash on a human edit. That
  // way if the admin later re-publishes the underlying English row,
  // the hash will differ from what an AI run would produce, but the
  // `source = 'human'` flag already shields this row from the
  // script. The hash is left as whatever the AI row had so we can
  // still tell "this locale was edited against snapshot X".
  const { error: upErr } = await sb
    .from(cfg.translationsTable)
    .upsert(upsertRow, { onConflict: `${cfg.fkColumn},locale` });
  if (upErr) return json({ ok: false, error: upErr.message }, 500);

  // Dual-write: mirror this entity's translations into MySQL (the storefront
  // reads localized PDP/listing/brand/category copy from MySQL). Self-guards
  // for kinds not in the mirror allowlist (e.g. banners).
  try {
    const { mirrorTableToMysql } = await import("@/lib/data/mirror");
    await mirrorTableToMysql(cfg.translationsTable, params.id);
  } catch (e) {
    console.error("[dual-write] content-translation MySQL mirror failed:", e);
  }

  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401();
  if (error) return error;

  const kind = asKind(params.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);
  const cfg = KINDS[kind];

  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale") ?? "";
  if (!(TARGET_LOCALES as readonly string[]).includes(locale))
    return json({ ok: false, error: "BAD_LOCALE" }, 400);

  const sb = adminSupabase();
  const { error: delErr } = await sb
    .from(cfg.translationsTable)
    .delete()
    .eq(cfg.fkColumn, params.id)
    .eq("locale", locale);
  if (delErr) return json({ ok: false, error: delErr.message }, 500);

  // Dual-write: re-sync this entity's translations into MySQL so the locale
  // delete propagates (scoped re-sync drops the removed row).
  try {
    const { mirrorTableToMysql } = await import("@/lib/data/mirror");
    await mirrorTableToMysql(cfg.translationsTable, params.id);
  } catch (e) {
    console.error("[dual-write] content-translation MySQL mirror failed:", e);
  }

  return NextResponse.json({ ok: true });
}
