// app/admin/invoices/[id]/edit/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { adminWrite } from "@/lib/admin/catalog-write";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const SUPPORT_EMAIL_FALLBACK = "info@madenkorea.com";

type InvoiceCompany = {
  id: string;
  key: string;
  display_name: string;
  address: string | null;
  gst_number: string | null;
  email: string | null;
};

type InvoiceItemForm = {
  localId: string;
  description: string;
  hsn_sac: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_percent: number;
};

function createEmptyItem(): InvoiceItemForm {
  return {
    localId: crypto.randomUUID(),
    description: "",
    hsn_sac: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    tax_percent: 0,
  };
}

export default function EditInvoicePage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [companies, setCompanies] = useState<InvoiceCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // form state
  const [companyId, setCompanyId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const [customerName, setCustomerName] = useState<string>("");
  const [billingAddress, setBillingAddress] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [gstNumber, setGstNumber] = useState<string>("");
  const [panNumber, setPanNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [items, setItems] = useState<InvoiceItemForm[]>([createEmptyItem()]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId]
  );

  // Load companies + invoice
  useEffect(() => {
    if (!invoiceId) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      // companies
      const { data: companyData, error: companyErr } = await supabase
        .from("invoice_companies")
        .select("id, key, display_name, address, gst_number, email")
        .order("display_name", { ascending: true });

      if (companyErr) {
        console.error(companyErr);
        setError(companyErr.message || "Failed to load companies");
        setLoading(false);
        return;
      }

      setCompanies(companyData as InvoiceCompany[]);

      // invoice + items — read via the admin service-role endpoint. Under
      // NextAuth the browser anon client is RLS-blocked from `invoices`
      // (0 rows). The invoice_companies dropdown read above stays on anon
      // (it reads fine). See app/api/admin/invoices/route.ts.
      let inv: any;
      try {
        const res = await fetch(
          `/api/admin/invoices?id=${encodeURIComponent(invoiceId)}`,
          { credentials: "include", cache: "no-store" }
        );
        const payload = await res.json().catch(() => ({} as any));
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load invoice");
        }
        inv = payload.data;
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Failed to load invoice");
        setLoading(false);
        return;
      }

      setCompanyId(inv.company_id);
      setInvoiceNumber(inv.invoice_number || "");
      setInvoiceDate(inv.invoice_date || "");
      setDueDate(inv.due_date || "");
      setCustomerName(inv.customer_name || "");
      setBillingAddress(inv.billing_address || "");
      setPhone(inv.phone || "");
      setEmail(inv.email || "");
      setGstNumber(inv.gst_number || "");
      setPanNumber(inv.pan_number || "");
      setNotes(inv.notes || "");

      const loadedItems: InvoiceItemForm[] =
        (inv.invoice_items || [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((it: any) => ({
            localId: crypto.randomUUID(),
            description: it.description || "",
            hsn_sac: it.hsn_sac || "",
            quantity: Number(it.quantity) || 0,
            unit_price: Number(it.unit_price) || 0,
            discount: Number(it.discount) || 0,
            tax_percent: Number(it.tax_percent) || 0,
          })) || [];

      setItems(loadedItems.length ? loadedItems : [createEmptyItem()]);
      setLoading(false);
    };

    load();
  }, [invoiceId]);

  // totals
  const { subtotal, taxAmount, totalAmount } = useMemo(() => {
    let sub = 0;
    let tax = 0;

    for (const item of items) {
      const lineSubtotal = item.quantity * item.unit_price - item.discount;
      const lineTax = (lineSubtotal * item.tax_percent) / 100;
      sub += lineSubtotal;
      tax += lineTax;
    }

    return {
      subtotal: Number(sub.toFixed(2)),
      taxAmount: Number(tax.toFixed(2)),
      totalAmount: Number((sub + tax).toFixed(2)),
    };
  }, [items]);

  const updateItem = (localId: string, patch: Partial<InvoiceItemForm>) => {
    setItems((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, ...patch } : it))
    );
  };

  const addItem = () => setItems((prev) => [...prev, createEmptyItem()]);

  const removeItem = (localId: string) => {
    setItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((it) => it.localId !== localId)
    );
  };

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!companyId) return setError("Please select the invoice company.");
    if (!invoiceNumber.trim()) return setError("Please enter an invoice number.");
    if (!customerName.trim()) return setError("Please enter customer name.");
    if (!billingAddress.trim()) return setError("Please enter billing address.");
    if (!phone.trim()) return setError("Please enter customer mobile number.");
    if (items.every((it) => !it.description.trim()))
      return setError("Please enter at least one line item description.");

    setSaving(true);

    try {
      // 1) update invoice header
      await adminWrite({
        table: "invoices",
        op: "update",
        data: {
          company_id: companyId,
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate || null,
          due_date: dueDate || null,

          customer_name: customerName,
          billing_address: billingAddress || null,
          phone: phone || null,
          email: email || null,
          contact_person: null,
          gst_number: gstNumber || null,
          pan_number: panNumber || null,

          subtotal,
          tax_amount: taxAmount,
          total_amount: totalAmount,

          notes: notes || null,
        },
        match: { id: invoiceId },
      });

      // 2) replace items
      await adminWrite({
        table: "invoice_items",
        op: "delete",
        match: { invoice_id: invoiceId },
      });

      const itemsToInsert = items
        .filter((it) => it.description.trim())
        .map((it, index) => {
          const lineSubtotal = it.quantity * it.unit_price - it.discount;
          const lineTax = (lineSubtotal * it.tax_percent) / 100;
          const lineTotal = lineSubtotal + lineTax;

          return {
            invoice_id: invoiceId,
            description: it.description,
            hsn_sac: it.hsn_sac || null,
            quantity: it.quantity,
            unit_price: it.unit_price,
            discount: it.discount,
            tax_percent: it.tax_percent,
            line_subtotal: Number(lineSubtotal.toFixed(2)),
            line_tax_amount: Number(lineTax.toFixed(2)),
            line_total: Number(lineTotal.toFixed(2)),
            position: index,
          };
        });

      if (itemsToInsert.length > 0) {
        await adminWrite({
          table: "invoice_items",
          op: "insert",
          data: itemsToInsert,
        });
      }

      setSuccessMessage("Invoice updated successfully.");
      router.push(`/admin/invoices/${invoiceId}`);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Something went wrong while saving.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-6xl py-6">
        <div className="text-sm text-slate-600">Loading invoice...</div>
      </div>
    );
  }

  const sellerSupportEmail = selectedCompany?.email || SUPPORT_EMAIL_FALLBACK;

  return (
    <>
    <AdminBackBar title="Edit Invoice" to={`/admin/invoices/${invoiceId}`} />
    <div className="container mx-auto max-w-6xl py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Edit Invoice</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/admin/invoices/${invoiceId}`)}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice #{invoiceNumber || "—"}</CardTitle>
          <CardDescription>Update invoice details, items and totals.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-md border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="rounded-md border border-green-500 bg-green-50 px-3 py-2 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          {/* Company + basic invoice info */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Invoice Company</Label>
              <Select value={companyId || undefined} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Seller preview */}
              <div className="mt-2 rounded-md border bg-muted/30 p-2 text-xs text-slate-700">
                <div className="font-medium">
                  Seller: {selectedCompany?.display_name || "-"}
                </div>
                <div>Support Email: {sellerSupportEmail}</div>
                <div>GSTIN: {selectedCompany?.gst_number || "-"}</div>
                <div className="whitespace-pre-line">
                  Address: {selectedCompany?.address || "-"}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={invoiceDate || ""}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate || ""}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Customer info */}
          <div className="border-t pt-4">
            <h3 className="mb-2 text-base font-semibold">Customer Details</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Customer Name</Label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Customer Email (optional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>Mobile Number</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>GST No (Customer)</Label>
                <Input
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label>PAN Number (Customer)</Label>
                <Input
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <Label>Billing Address</Label>
              <Textarea
                rows={3}
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Items */}
          <div className="border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">Invoice Items</h3>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                + Add Item
              </Button>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-left">HSN/SAC</th>
                    <th className="px-2 py-2 text-right">Qty</th>
                    <th className="px-2 py-2 text-right">Unit Price</th>
                    <th className="px-2 py-2 text-right">Discount</th>
                    <th className="px-2 py-2 text-right">Tax %</th>
                    <th className="px-2 py-2 text-right">Line Total</th>
                    <th className="px-2 py-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const lineSubtotal =
                      item.quantity * item.unit_price - item.discount;
                    const lineTax = (lineSubtotal * item.tax_percent) / 100;
                    const lineTotal = lineSubtotal + lineTax;

                    return (
                      <tr key={item.localId} className="border-t">
                        <td className="px-2 py-1 align-top">
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateItem(item.localId, { description: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            value={item.hsn_sac}
                            onChange={(e) =>
                              updateItem(item.localId, { hsn_sac: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity.toString()}
                            onChange={(e) =>
                              updateItem(item.localId, {
                                quantity: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_price.toString()}
                            onChange={(e) =>
                              updateItem(item.localId, {
                                unit_price: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.discount.toString()}
                            onChange={(e) =>
                              updateItem(item.localId, {
                                discount: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.tax_percent.toString()}
                            onChange={(e) =>
                              updateItem(item.localId, {
                                tax_percent: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top text-right">
                          {lineTotal.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center align-middle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={items.length <= 1}
                            onClick={() => removeItem(item.localId)}
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-4 flex flex-col items-end space-y-1 text-sm">
              <div className="flex w-full max-w-sm justify-between">
                <span>Subtotal</span>
                <span>{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex w-full max-w-sm justify-between">
                <span>Tax</span>
                <span>{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex w-full max-w-sm justify-between font-semibold">
                <span>Total</span>
                <span>{totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="border-t pt-4">
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
