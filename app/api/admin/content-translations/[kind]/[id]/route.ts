// GET    /api/admin/content-translations/:kind/:id          — fetch source + all translations for the entity editor
// PATCH  /api/admin/content-translations/:kind/:id          — body: { locale, fields }  upsert admin edits (source='human')
// DELETE /api/admin/content-translations/:kind/:id?locale=pl — drop one translation row (revert to English fallback)
//
// The PATCH route is what lets admins override AI output. Setting
// source = 'human' on the row tells both the script and the post-
// save background hook to skip that locale on future runs.

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  asKind,
  getAdminOr401,
  json,
  KINDS,
} from "../../_lib";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import {
  TARGET_LOCALES,
  namespaceHash,
  pickTranslatablePayload,
  type TargetLocale,
} from "@/lib/contentTranslator";

type RouteParams = { params: { kind: string; id: string } };

export async function GET(req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401(req);
  if (error) return error;

  const kind = asKind(params.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);
  const cfg = KINDS[kind];

  const sourceSelect = Object.fromEntries(
    cfg.sourceColumns.map((c) => [c, true])
  );

  let source: Record<string, any> | null;
  let rows: any[];
  try {
    [source, rows] = await Promise.all([
      (prisma as any)[cfg.sourceTable].findUnique({
        where: { id: params.id },
        select: sourceSelect,
      }) as Promise<Record<string, any> | null>,
      (prisma as any)[cfg.translationsTable].findMany({
        where: { [cfg.fkColumn]: params.id },
      }) as Promise<any[]>,
    ]);
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }

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
    source: jsonSafe(source),
    currentSourceHash,
    translations: jsonSafe(translationsWithStale),
  });
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401(req);
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

  // We deliberately do NOT touch source_hash on a human edit. That
  // way if the admin later re-publishes the underlying English row,
  // the hash will differ from what an AI run would produce, but the
  // `source = 'human'` flag already shields this row from the
  // script. The hash is left as whatever the AI row had so we can
  // still tell "this locale was edited against snapshot X".
  //
  // Upsert keyed on the (fk, locale) compound unique. The id column is
  // Char(36) with no default, so a fresh row needs a generated UUID.
  const now = new Date();
  try {
    await (prisma as any)[cfg.translationsTable].upsert({
      where: {
        [`${cfg.fkColumn}_locale`]: { [cfg.fkColumn]: params.id, locale },
      },
      create: {
        id: randomUUID(),
        [cfg.fkColumn]: params.id,
        locale,
        ...allowed,
        source: "human",
        updated_at: now,
      },
      update: {
        ...allowed,
        source: "human",
        updated_at: now,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "WRITE_FAILED" }, 500);
  }

  return json({ ok: true });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { error } = await getAdminOr401(req);
  if (error) return error;

  const kind = asKind(params.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);
  const cfg = KINDS[kind];

  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale") ?? "";
  if (!(TARGET_LOCALES as readonly string[]).includes(locale))
    return json({ ok: false, error: "BAD_LOCALE" }, 400);

  // deleteMany tolerates a missing row (revert-to-fallback is idempotent).
  try {
    await (prisma as any)[cfg.translationsTable].deleteMany({
      where: { [cfg.fkColumn]: params.id, locale },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "DELETE_FAILED" }, 500);
  }

  return NextResponse.json({ ok: true });
}
