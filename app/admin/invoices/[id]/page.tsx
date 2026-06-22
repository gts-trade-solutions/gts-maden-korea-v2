// app/admin/invoices/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

const SUPPORT_EMAIL_FALLBACK = "info@madenkorea.com";

type InvoiceCompany = {
  id: string;
  display_name: string;
  legal_name: string | null;
  address: string | null;
  gst_number: string | null;
  pan_number: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  swift_code: string | null;
  phone: string | null;
  email: string | null;
};

type InvoiceItem = {
  id: string;
  description: string;
  hsn_sac: string | null;
  quantity: number;
  unit_price: number;
  discount: number; // ✅ ensure exists
  tax_percent: number;
  line_subtotal: number;
  line_tax_amount: number;
  line_total: number;
  position: number;
};

type InvoiceDetail = {
  id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  customer_name: string;
  billing_address: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  pan_number: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes: string | null;
  invoice_companies: InvoiceCompany | null;
  invoice_items: InvoiceItem[];
};

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    const loadInvoice = async () => {
      setLoading(true);
      setError(null);

      // Read via the admin service-role endpoint — under NextAuth the browser
      // anon client is RLS-blocked from `invoices` (0 rows / "not found"). See
      // app/api/admin/invoices/route.ts.
      try {
        const res = await fetch(
          `/api/admin/invoices?id=${encodeURIComponent(invoiceId)}`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = await res.json().catch(() => ({} as any));
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load invoice");
        }
        const data = payload.data;
        const sortedItems = (data.invoice_items || []).sort(
          (a: InvoiceItem, b: InvoiceItem) => a.position - b.position
        );

        setInvoice({
          ...(data as any),
          invoice_items: sortedItems,
        });
      } catch (err: any) {
        console.error(err);
        setError(err?.message || "Failed to load invoice");
      }

      setLoading(false);
    };

    loadInvoice();
  }, [invoiceId]);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-5xl py-6">
        <div className="text-sm text-slate-600">Loading invoice...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto max-w-5xl py-6 space-y-3">
        <div className="text-sm text-red-700">Error loading invoice: {error}</div>
        <Button variant="outline" onClick={() => router.push("/admin/invoices")}>
          Back to list
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto max-w-5xl py-6 space-y-3">
        <div className="text-sm text-slate-600">Invoice not found.</div>
        <Button variant="outline" onClick={() => router.push("/admin/invoices")}>
          Back to list
        </Button>
      </div>
    );
  }

  const company = invoice.invoice_companies;
  const sellerSupportEmail = company?.email || SUPPORT_EMAIL_FALLBACK;

  return (
    <>
    <div className="print:hidden">
      <AdminBackBar title="Invoice" to="/admin/invoices" />
    </div>
    <div className="container mx-auto max-w-5xl py-6 space-y-4">
      {/* Top action bar (hidden in print). Back-to-list is in the
          AdminBackBar above; keep print here on the right. */}
      <div className="flex items-center justify-end gap-3 print:hidden">
        <Button size="sm" onClick={handlePrint}>
          Print Invoice
        </Button>
      </div>

      <Card className="p-6 print:shadow-none print:border-none">
        <div className="mx-auto max-w-[820px] space-y-6">
          {/* Header */}
          <div className="flex flex-col gap-6 border-b pb-4 md:flex-row md:justify-between">
            {/* Seller */}
            <div className="space-y-1 text-sm">
              <h1 className="text-lg font-semibold">
                {company?.display_name || "Seller Name"}
              </h1>

              {company?.legal_name && (
                <p className="text-xs text-slate-600">{company.legal_name}</p>
              )}

              <div className="mt-2 text-xs text-slate-700 space-y-0.5">
                <p>
                  Support Email:{" "}
                  <span className="font-medium">{sellerSupportEmail}</span>
                </p>

                {/* ✅ Seller GST + Address BELOW support email */}
                {company?.gst_number && <p>GSTIN: {company.gst_number}</p>}

                {company?.address && (
                  <p className="max-w-md whitespace-pre-line text-slate-600">
                    Address: {company.address}
                  </p>
                )}
              </div>
            </div>

            {/* Invoice meta */}
            <div className="space-y-1 text-sm md:text-right">
              <h2 className="text-lg font-semibold">INVOICE</h2>
              <p>
                <span className="font-medium">Invoice No: </span>
                {invoice.invoice_number}
              </p>
              <p>
                <span className="font-medium">Invoice Date: </span>
                {formatDate(invoice.invoice_date)}
              </p>
              {/* {invoice.due_date && (
                <p>
                  <span className="font-medium">Due Date: </span>
                  {formatDate(invoice.due_date)}
                </p>
              )} */}
            </div>
          </div>

          {/* Bill To */}
          <div className="grid gap-6 border-b pb-4 md:grid-cols-2">
            <div className="space-y-1 text-sm">
              <h3 className="font-semibold">Bill To</h3>
              <p className="font-medium">{invoice.customer_name}</p>
              {invoice.billing_address && (
                <p className="whitespace-pre-line text-xs text-slate-700">
                  {invoice.billing_address}
                </p>
              )}
              <div className="mt-2 space-y-0.5 text-xs text-slate-700">
                {invoice.phone && <p>Phone: {invoice.phone}</p>}
                {invoice.gst_number && <p>GSTIN: {invoice.gst_number}</p>}
                {invoice.pan_number && <p>PAN: {invoice.pan_number}</p>}
              </div>
            </div>

            <div className="space-y-1 text-sm">
              <h3 className="font-semibold">Invoice Info</h3>
              {invoice.email && (
                <p className="text-xs text-slate-700">
                  Customer Email: {invoice.email}
                </p>
              )}
            </div>
          </div>

          {/* ✅ Items table with Discount column */}
          <div>
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="border-y bg-slate-50">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Description</th>
                  <th className="px-2 py-2 text-left">HSN/SAC</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Unit Price</th>
                  <th className="px-2 py-2 text-right">Discount</th>
                  <th className="px-2 py-2 text-right">Tax %</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>

              <tbody>
                {invoice.invoice_items.map((item, index) => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2 align-top text-left">{index + 1}</td>

                    <td className="px-2 py-2 align-top text-left">
                      <div className="font-medium">{item.description}</div>
                    </td>

                    <td className="px-2 py-2 align-top text-left">
                      {item.hsn_sac || "-"}
                    </td>

                    <td className="px-2 py-2 align-top text-right">
                      {Number(item.quantity || 0)}
                    </td>

                    <td className="px-2 py-2 align-top text-right">
                      {Number(item.unit_price || 0).toFixed(2)}
                    </td>

                    <td className="px-2 py-2 align-top text-right">
                      {Number(item.discount || 0).toFixed(2)}
                    </td>

                    <td className="px-2 py-2 align-top text-right">
                      {Number(item.tax_percent || 0).toFixed(2)}
                    </td>

                    <td className="px-2 py-2 align-top text-right">
                      {Number(item.line_total || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}

                {invoice.invoice_items.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-2 py-4 text-center text-xs text-slate-500"
                    >
                      No line items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals + bank */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-1 text-xs text-slate-700">
              {company?.bank_name && <p>Bank: {company.bank_name}</p>}
              {company?.bank_branch && <p>Branch: {company.bank_branch}</p>}
              {company?.account_number && <p>Account No: {company.account_number}</p>}
              {company?.ifsc_code && <p>IFSC: {company.ifsc_code}</p>}
              {company?.swift_code && <p>SWIFT: {company.swift_code}</p>}
            </div>

            <div className="flex flex-col items-end space-y-1 text-sm">
              <div className="flex w-full max-w-xs justify-between">
                <span>Subtotal</span>
                <span>{Number(invoice.subtotal || 0).toFixed(2)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between">
                <span>Tax</span>
                <span>{Number(invoice.tax_amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between font-semibold">
                <span>Total</span>
                <span>{Number(invoice.total_amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="mt-6 border-t pt-4 text-xs text-slate-700">
            <h3 className="text-sm font-semibold mb-1">Notes</h3>
            <p className="whitespace-pre-line">{invoice.notes || "-"}</p>
          </div>
        </div>
      </Card>
    </div>
    </>
  );
}
