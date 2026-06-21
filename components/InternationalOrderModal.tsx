"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/lib/contexts/CurrencyContext";
import { convertFromINR } from "@/lib/currency";

// Modal used by the cart page (for non-INR visitors) to submit an
// international order request. We collect contact + shipping
// information and a snapshot of the cart line items, send it to the
// team via SES, and acknowledge to the customer.

export type CartLineForRequest = {
  product_id: string;
  name: string;
  sku?: string | null;
  quantity: number;
  unit_price_inr: number;
  hero_image_url?: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cart line items, with prices in INR (canonical). */
  cart: CartLineForRequest[];
  /** Subtotal in INR for the snapshot. */
  subtotalInr: number;
  /** Optional auth-supplied defaults. */
  defaults?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** Called after a successful submission so the parent can clear UI. */
  onSubmitted?: () => void;
};

export function InternationalOrderModal({
  open,
  onOpenChange,
  cart,
  subtotalInr,
  defaults,
  onSubmitted,
}: Props) {
  const t = useTranslations("intlOrder");
  const { rate, currency } = useCurrency();

  const [name, setName] = useState(defaults?.name ?? "");
  const [email, setEmail] = useState(defaults?.email ?? "");
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name || !email || !line1 || !city || !postalCode || !country) {
      toast.error(t("errMissingFields"));
      return;
    }

    setSubmitting(true);
    try {
      const displayTotal = convertFromINR(subtotalInr, rate);
      const res = await fetch("/api/international-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          customer_phone: phone || undefined,
          country,
          address: {
            line1,
            line2: line2 || null,
            city,
            state: stateRegion || null,
            postal_code: postalCode,
            country,
          },
          cart: cart.map((l) => ({
            ...l,
            line_total_inr: l.unit_price_inr * l.quantity,
          })),
          currency_code: currency,
          display_total: displayTotal,
          inr_total: subtotalInr,
          notes: notes || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        toast.error(body?.error || t("errSubmit"));
        return;
      }

      toast.success(t("successToast"));
      onSubmitted?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || t("errNetwork"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="io-name">{t("fullName")}</Label>
              <Input id="io-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="io-email">{t("email")}</Label>
              <Input id="io-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="io-phone">{t("phone")}</Label>
            <Input id="io-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("phonePlaceholder")} />
          </div>

          <div className="border-t pt-4">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("shippingAddress")}
            </Label>
          </div>

          <div>
            <Label htmlFor="io-line1">{t("addressLine1")}</Label>
            <Input id="io-line1" value={line1} onChange={(e) => setLine1(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="io-line2">{t("addressLine2")}</Label>
            <Input id="io-line2" value={line2} onChange={(e) => setLine2(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="io-city">{t("city")}</Label>
              <Input id="io-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="io-state">{t("stateRegion")}</Label>
              <Input id="io-state" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="io-postal">{t("postalCode")}</Label>
              <Input id="io-postal" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="io-country">{t("country")}</Label>
              <Input id="io-country" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="io-notes">{t("notes")}</Label>
            <Textarea
              id="io-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("submitting")}
              </>
            ) : (
              t("submit")
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
