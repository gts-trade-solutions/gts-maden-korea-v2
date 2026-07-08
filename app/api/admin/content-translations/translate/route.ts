// POST /api/admin/content-translations/translate
//
// Translate one entity (product / brand / category / banner) into
// one or more locales. The default mode is diff-aware: locales
// already translated at the current source-hash are skipped.
//
// Request body:
//   {
//     "kind": "products" | "brands" | "categories" | "banners",
//     "id": "<uuid>",
//     "locales"?: ["pl", "vi", ...]   // omit => all 8 target locales
//     "force"?: true                  // ignore source-hash; retranslate
//   }
//
// Response (200):
//   {
//     ok: true,
//     result: {
//       kind, entityId,
//       translated, skipped, humanLocked,
//       errors: [{locale, message}, ...]
//     }
//   }
//
// Auth: admin (role=admin on profiles). Uses service-role client
// to bypass RLS on the translation table.

export const dynamic = "force-dynamic";

import { randomUUID } from "node:crypto";
import {
  asKind,
  getAdminOr401,
  getAnthropicKey,
  json,
  KINDS,
} from "../_lib";
import { prisma } from "@/lib/db/prisma";
import { jsonSafe } from "@/lib/db/serialize";
import {
  TARGET_LOCALES,
  translateEntity,
  type TargetLocale,
} from "@/lib/contentTranslator";

export async function POST(req: Request) {
  const { error } = await getAdminOr401(req);
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const kind = asKind(body?.kind);
  if (!kind) return json({ ok: false, error: "BAD_KIND" }, 400);

  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return json({ ok: false, error: "BAD_ID" }, 400);

  // Validate locale list (or default to all). Unknown locales are
  // silently dropped rather than rejected — easier for the UI to
  // pass arbitrary toggles without coordinating supported codes.
  const rawLocales = Array.isArray(body?.locales) ? body.locales : null;
  const locales: TargetLocale[] = rawLocales
    ? (rawLocales.filter((l: any) =>
        TARGET_LOCALES.includes(l)
      ) as TargetLocale[])
    : [...TARGET_LOCALES];
  if (locales.length === 0)
    return json({ ok: false, error: "NO_VALID_LOCALES" }, 400);

  const force = body?.force === true;
  const cfg = KINDS[kind];

  const sourceSelect = Object.fromEntries(
    cfg.sourceColumns.map((c) => [c, true])
  );

  // 1) Fetch source row.
  let sourceRow: Record<string, any> | null;
  try {
    sourceRow = (await (prisma as any)[cfg.sourceTable].findUnique({
      where: { id },
      select: sourceSelect,
    })) as Record<string, any> | null;
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "READ_FAILED" }, 500);
  }
  if (!sourceRow) return json({ ok: false, error: "ENTITY_NOT_FOUND" }, 404);

  // 2) Fetch existing translations for these locales so we can
  // diff-skip and avoid clobbering human edits.
  const existing = (await (prisma as any)[cfg.translationsTable].findMany({
    where: { [cfg.fkColumn]: id, locale: { in: locales as unknown as string[] } },
    select: { locale: true, source_hash: true, source: true },
  })) as any[];

  const existingByLocale = new Map<
    TargetLocale,
    { source_hash: string | null; source: string }
  >();
  for (const row of existing ?? []) {
    existingByLocale.set(row.locale as TargetLocale, {
      source_hash: row.source_hash ?? null,
      source: row.source ?? "ai",
    });
  }

  // 3) Drive the translation library, persisting each successful
  // locale immediately (so an unrelated failure mid-run still
  // commits what landed).
  const result = await translateEntity({
    apiKey: getAnthropicKey(),
    kind,
    sourceRow,
    locales,
    existingByLocale,
    force,
    onLocaleTranslated: async (rowLocale, row) => {
      // Upsert keyed on the (fk, locale) compound unique. The id column is
      // Char(36) with no default, so an inserted row needs a generated UUID.
      await (prisma as any)[cfg.translationsTable].upsert({
        where: {
          [`${cfg.fkColumn}_locale`]: { [cfg.fkColumn]: id, locale: rowLocale },
        },
        create: { id: randomUUID(), ...row },
        update: { ...row },
      });
    },
  });

  return json({ ok: true, result: jsonSafe(result) });
}
