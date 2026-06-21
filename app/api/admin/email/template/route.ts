import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth/adminGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  // Example rows in template
  const rows = [
    ["Email", "Name", "Category"],
    ["doctor1@example.com", "Dr. Example", "doctor"],
    ["shopkeeper1@example.com", "Shop Example", "shopkeeper"],
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ContactsTemplate");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="email_contacts_template.xlsx"',
    },
  });
}
