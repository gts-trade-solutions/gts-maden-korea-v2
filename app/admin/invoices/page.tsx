// app/admin/invoices/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminWrite } from "@/lib/admin/catalog-write";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  customer_name: string;
  total_amount: number;
  invoice_companies: {
    display_name: string;
  } | null;
};

export default function InvoicesListPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);
      setError(null);

      // Read via the admin service-role endpoint — under NextAuth the browser
      // anon client is RLS-blocked from `invoices` (0 rows). See
      // app/api/admin/invoices/route.ts.
      try {
        const res = await fetch("/api/admin/invoices", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({} as any));
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load invoices");
        }
        setInvoices((payload.data as InvoiceRow[]) || []);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load invoices");
      }

      setLoading(false);
    };

    loadInvoices();
  }, []);

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      inv.invoice_number.toLowerCase().includes(q) ||
      inv.customer_name.toLowerCase().includes(q) ||
      inv.invoice_companies?.display_name.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string) => {
    const ok = window.confirm("Delete this invoice permanently?");
    if (!ok) return;

    setError(null);
    setDeletingId(id);

    // assumes invoice_items has FK invoice_id ON DELETE CASCADE
    try {
      await adminWrite({
        table: "invoices",
        op: "delete",
        match: { id },
      });
      setInvoices((prev) => prev.filter((inv) => inv.id !== id));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to delete invoice");
    }

    setDeletingId(null);
  };

  return (
    <>
    <AdminBackBar title="Invoices" to="/admin" />
    <div className="container mx-auto max-w-6xl py-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>
              View, edit and print Amazon-style invoices generated in the system.
            </CardDescription>
          </div>
          <Button onClick={() => router.push("/admin/invoices/new")}>
            + New Invoice
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Search bar */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full max-w-sm">
              <Input
                placeholder="Search by invoice no., customer, company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Errors / loading */}
          {error && (
            <div className="rounded-md border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading && (
            <div className="text-sm text-slate-600">Loading invoices...</div>
          )}

          {/* Table */}
          {!loading && filtered.length === 0 && (
            <div className="text-sm text-slate-500">No invoices found.</div>
          )}

          {filtered.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Invoice No.</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Company</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => {
                    const dateLabel = inv.invoice_date
                      ? new Date(inv.invoice_date).toLocaleDateString()
                      : "-";

                    return (
                      <tr key={inv.id} className="border-t">
                        <td className="px-3 py-2 align-middle font-medium">
                          {inv.invoice_number}
                        </td>
                        <td className="px-3 py-2 align-middle">{dateLabel}</td>
                        <td className="px-3 py-2 align-middle">
                          {inv.invoice_companies?.display_name || "-"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {inv.customer_name}
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          {inv.total_amount?.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                router.push(`/admin/invoices/${inv.id}`)
                              }
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                router.push(`/admin/invoices/${inv.id}/edit`)
                              }
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deletingId === inv.id}
                              onClick={() => handleDelete(inv.id)}
                            >
                              {deletingId === inv.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
