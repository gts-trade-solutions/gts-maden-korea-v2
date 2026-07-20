import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

// Helpers for the Meta (Facebook / Instagram) marketing routes, which cache
// Graph API results into MySQL.
//
// Postgres defaulted these tables' `id`, so the Supabase upserts never supplied
// one; in MySQL `id` is CHAR(36) with no default, so inserts must generate it.
// Prisma has no upsertMany, so a batch upsert is a transaction of per-row
// upserts keyed on the same composite unique the old `onConflict` used
// (e.g. facebook_page_posts_owner_post_unique).
//
// `whereFor` builds the composite unique selector for a row, e.g.
//   (r) => ({ owner_id_fb_post_id: { owner_id: r.owner_id, fb_post_id: r.fb_post_id } })
export async function upsertMetaRows(
  delegate: any,
  rows: any[],
  whereFor: (row: any) => any
): Promise<number> {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  await prisma.$transaction(
    rows.map((r) =>
      delegate.upsert({
        where: whereFor(r),
        create: { id: randomUUID(), ...r },
        update: { ...r },
      })
    )
  );
  return rows.length;
}
