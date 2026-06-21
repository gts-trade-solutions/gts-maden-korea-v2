import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceClient } from "@/lib/supabaseServer";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ParsedRow = {
  email: string;
  name: string | null;
  categoryName: string | null;
};

function slugifyCategory(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
}

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const supabase = createServiceClient();

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "No file uploaded (expects field name 'file')" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rawRows.length === 0) {
    return NextResponse.json(
      { error: "Excel file is empty" },
      { status: 400 }
    );
  }

  // Hard cap to avoid insane imports
  if (rawRows.length > 5000) {
    return NextResponse.json(
      { error: "Too many rows. Max 5000 per upload." },
      { status: 400 }
    );
  }

  const rows: ParsedRow[] = rawRows.map((row) => {
    const email =
      (row.Email || row.email || row.EMAIL || "").toString().trim();
    const name =
      (row.Name || row.name || row.NAME || "").toString().trim() || null;
    const categoryName =
      (row.Category || row.category || row.CATEGORY || "")
        .toString()
        .trim() || null;

    return { email, name, categoryName };
  });

  // Validation
  const invalidRows: { rowNumber: number; email?: string; error: string }[] =
    [];

  let anyEmailPresent = false;

  rows.forEach((r, idx) => {
    const rowNumber = idx + 2; // +2 because header is row 1
    if (!r.email) {
      invalidRows.push({
        rowNumber,
        error: 'Missing "Email" value',
      });
      return;
    }
    anyEmailPresent = true;

    if (!isValidEmail(r.email)) {
      invalidRows.push({
        rowNumber,
        email: r.email,
        error: "Invalid email format",
      });
    }
  });

  if (!anyEmailPresent) {
    return NextResponse.json(
      {
        error:
          'No valid "Email" column found. Make sure header is "Email" (case insensitive).',
      },
      { status: 400 }
    );
  }

  if (invalidRows.length > 0) {
    return NextResponse.json(
      {
        error: "Validation failed for some rows.",
        invalidRows,
      },
      { status: 400 }
    );
  }

  // Filter out completely empty rows (already handled by validation)
  const validRows = rows.filter((r) => r.email);

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "No valid email rows to import." },
      { status: 400 }
    );
  }

  // 1) Categories
  const categoryNameSet = new Set<string>();
  for (const r of validRows) {
    if (r.categoryName) categoryNameSet.add(r.categoryName);
  }

  const categoryMap = new Map<string, { slug: string; id: string }>();

  if (categoryNameSet.size > 0) {
    const categoriesToEnsure = Array.from(categoryNameSet).map((name) => ({
      name,
      slug: slugifyCategory(name),
    }));

    const { data: existingCats, error: existingCatsErr } = await supabase
      .from("email_category")
      .select("id, slug");

    if (existingCatsErr) {
      console.error(existingCatsErr);
      return NextResponse.json(
        { error: "Failed to fetch existing categories" },
        { status: 500 }
      );
    }

    const existingMap = new Map<string, string>(); // slug -> id
    for (const c of existingCats || []) {
      existingMap.set((c as any).slug, (c as any).id);
    }

    const newCategories = categoriesToEnsure.filter(
      (c) => !existingMap.has(c.slug)
    );

    if (newCategories.length > 0) {
      const { data: insertedCats, error: insertCatsErr } = await supabase
        .from("email_category")
        .insert(
          newCategories.map((c) => ({
            slug: c.slug,
            label: c.name,
            description: null,
          }))
        )
        .select("id, slug");

      if (insertCatsErr) {
        console.error(insertCatsErr);
        return NextResponse.json(
          { error: "Failed to insert new categories" },
          { status: 500 }
        );
      }

      for (const c of insertedCats || []) {
        existingMap.set((c as any).slug, (c as any).id);
      }
    }

    for (const c of categoriesToEnsure) {
      const id = existingMap.get(c.slug);
      if (id) {
        categoryMap.set(c.name, { slug: c.slug, id });
      }
    }
  }

  // 2) Insert / link contacts
  let totalRows = validRows.length;
  let contactsCreated = 0;
  let linksCreated = 0;

  for (const row of validRows) {
    const email = row.email.trim();

    const { data: existingContact, error: findErr } = await supabase
      .from("email_contact")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (findErr) {
      console.error("Failed to search contact", email, findErr);
      continue;
    }

    let contactId = existingContact?.id as string | undefined;

    if (!contactId) {
      const { data: inserted, error: insertContactErr } = await supabase
        .from("email_contact")
        .insert({
          email,
          name: row.name,
          is_registered: false,
          source: "import",
        })
        .select("id")
        .single();

      if (insertContactErr) {
        console.error("Failed to insert contact", email, insertContactErr);
        continue;
      }

      contactsCreated += 1;
      contactId = inserted.id;
    }

    if (row.categoryName) {
      const catInfo = categoryMap.get(row.categoryName);
      if (catInfo) {
        const { error: linkErr } = await supabase
          .from("email_contact_category")
          .insert({
            contact_id: contactId,
            category_id: catInfo.id,
          });

        if (linkErr && !linkErr.message.includes("duplicate key")) {
          console.error(
            "Failed to link contact to category",
            email,
            row.categoryName,
            linkErr
          );
        } else if (!linkErr) {
          linksCreated += 1;
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    totalRows,
    contactsCreated,
    categoriesCreated: categoryMap.size,
    linksCreated,
  });
}
