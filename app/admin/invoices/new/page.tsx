// app/admin/invoices/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
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

type InvoiceItem = {
  id: string; // local id for React key
  description: string;
  hsn_sac: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_percent: number;
};

const DEFAULT_NOTES = `Reseller Disclaimer
We are resellers and are not responsible for product usage or handling guidance. For detailed information on how to use the product safely and effectively, please contact the product manufacturer directly.

Return Policy
• Returns are accepted within 3 days from the date of delivery.
• Returns are only accepted for products with damaged packaging or expired items.
• Used products or items with broken or tampered seals are not eligible for return.`;

function createEmptyItem(): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    description: "",
    hsn_sac: "",
    quantity: 1,
    unit_price: 0,
    discount: 0,
    tax_percent: 0,
  };
}

export default function NewInvoicePage() {
  const router = useRouter();

  const [companies, setCompanies] = useState<InvoiceCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // --- Invoice form state ---
  const [companyId, setCompanyId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [invoiceDate, setInvoiceDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");

  const [customerName, setCustomerName] = useState<string>("");
  const [billingAddress, setBillingAddress] = useState<string>("");
  const [phone, setPhone] = useState<string>(""); // mobile
  const [email, setEmail] = useState<string>("");
  const [gstNumber, setGstNumber] = useState<string>("");
  const [panNumber, setPanNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>(DEFAULT_NOTES);

  const [items, setItems] = useState<InvoiceItem[]>([createEmptyItem()]);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId],
  );

  // --- Load companies from DB ---
  useEffect(() => {
    const loadCompanies = async () => {
      setLoadingCompanies(true);
      try {
        const res = await fetch("/api/admin/invoice-companies", {
          credentials: "include",
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({} as any));
        if (!res.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to load companies");
        }
        const data = (payload.data ?? []) as InvoiceCompany[];
        setCompanies(data);
        if (data.length > 0) setCompanyId(data[0].id);
      } catch (error) {
        console.error("Error loading invoice_companies", error);
      }
      setLoadingCompanies(false);
    };

    loadCompanies();

    const today = new Date().toISOString().slice(0, 10);
    setInvoiceDate(today);
  }, []);

  // --- Totals calculation ---
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

  // --- Item operations ---
  const updateItem = (id: string, patch: Partial<InvoiceItem>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const addItem = () => setItems((prev) => [...prev, createEmptyItem()]);

  const removeItem = (id: string) => {
    setItems((prev) =>
      prev.length <= 1 ? prev : prev.filter((it) => it.id !== id),
    );
  };

  // --- Form submit: save invoice + items ---
  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);

    if (!companyId) return setError("Please select the invoice company.");
    if (!invoiceNumber.trim())
      return setError("Please enter an invoice number.");
    if (!customerName.trim()) return setError("Please enter customer name.");
    if (!billingAddress.trim())
      return setError("Please enter billing address.");
    if (!phone.trim()) return setError("Please enter customer mobile number.");
    if (items.every((it) => !it.description.trim()))
      return setError("Please enter at least one line item description.");

    setSaving(true);

    try {
      // 1) Insert into invoices
      const invoiceData = await adminWrite({
        table: "invoices",
        op: "insert",
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
      });

      if (!invoiceData) {
        throw new Error("Failed to create invoice");
      }

      const invoiceId = invoiceData.id as string;

      // 2) Insert line items
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

      setSuccessMessage("Invoice saved successfully.");
      router.push(`/admin/invoices/${invoiceId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const sellerSupportEmail = selectedCompany?.email || SUPPORT_EMAIL_FALLBACK;

  return (
    <>
    <AdminBackBar title="New Invoice" to="/admin/invoices" />
    <div className="container mx-auto max-w-6xl py-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Invoice</CardTitle>
          <CardDescription>
            Generate an invoice for a customer and save it to the system.
          </CardDescription>
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
              <Select
                disabled={loadingCompanies}
                value={companyId || undefined}
                onValueChange={setCompanyId}
              >
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

              {/* Seller preview (helps verify GST + address stored in DB) */}
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
                placeholder="e.g. MK/2025/0001"
              />
            </div>

            <div className="space-y-1">
              <Label>Invoice Date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={dueDate}
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
                  placeholder="Customer / Company Name"
                />
              </div>

              <div className="space-y-1">
                <Label>Customer Email (optional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Customer email (internal use)"
                />
              </div>

              <div className="space-y-1">
                <Label>Mobile Number</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Customer mobile number"
                />
              </div>

              <div className="space-y-1">
                <Label>GST No (Customer)</Label>
                <Input
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  placeholder="Customer GST Number"
                />
              </div>

              <div className="space-y-1">
                <Label>PAN Number (Customer)</Label>
                <Input
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value)}
                  placeholder="Customer PAN Number"
                />
              </div>
            </div>

            <div className="mt-3 space-y-1">
              <Label>Billing Address</Label>
              <Textarea
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                placeholder="Full billing address"
                rows={3}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="border-t pt-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold">Invoice Items</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
              >
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
                      <tr key={item.id} className="border-t">
                        <td className="px-2 py-1 align-top">
                          <Input
                            value={item.description}
                            onChange={(e) =>
                              updateItem(item.id, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Item / service description"
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            value={item.hsn_sac}
                            onChange={(e) =>
                              updateItem(item.id, { hsn_sac: e.target.value })
                            }
                            placeholder="HSN / SAC"
                          />
                        </td>
                        <td className="px-2 py-1 align-top">
                          <Input
                            type="number"
                            min={0}
                            value={item.quantity.toString()}
                            onChange={(e) =>
                              updateItem(item.id, {
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
                              updateItem(item.id, {
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
                              updateItem(item.id, {
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
                              updateItem(item.id, {
                                tax_percent: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1 align-top text-right align-middle">
                          {lineTotal.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-center align-middle">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(item.id)}
                            disabled={items.length <= 1}
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
              <Label>Notes / Internal Reference</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any internal notes for this invoice"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
            >
              Print (Current View)
            </Button>

            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Invoice"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
    </>
  );
}
