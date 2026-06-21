"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CustomerLayout } from "@/components/CustomerLayout";
import { PolicyHero } from "@/components/PolicyHero";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Phone, MapPin, Clock, ShieldCheck, Building2, Globe2, User } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_BUSINESS_PROFILE,
  getBusinessProfile,
  type BusinessProfile,
} from "@/lib/businessInfo";
import { isSupportedCountry, DEFAULT_COUNTRY } from "@/lib/countries";

// Read visitor country from the same `mik_country` cookie used elsewhere
// for country-aware behavior. Mirrors the inline helper used in product.tsx
// — kept duplicated here for surgical reasons (see COUNTRY_PRICING.md).
function readCountryFromCookie(): string {
  if (typeof document === "undefined") return DEFAULT_COUNTRY;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("mik_country="));
  const raw = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return isSupportedCountry(raw) ? raw : DEFAULT_COUNTRY;
}

// Inline WhatsApp glyph reused for the contact-form CTA. Same path data
// as `components/FloatingWhatsApp.tsx` so the brand mark stays
// consistent across surfaces.
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

export default function ContactPage() {
  const t = useTranslations("contactPage");
  // Pull live business profile (brand + partner globals + country-resolved
  // contact details) on mount. The visitor's country comes from the
  // `mik_country` cookie — switching country in the header reloads the
  // page so this effect runs again with the new value.
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);
  useEffect(() => {
    let cancelled = false;
    const country = readCountryFromCookie();
    getBusinessProfile(country).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { brand, partner, contact } = profile;
  const supportPhone = contact.phone ?? "";
  const supportAddress = contact.publicAddress ?? partner.registeredAddress ?? "";
  const hasSupportPhone = supportPhone.length > 0;
  const hasSupportAddress = supportAddress.length > 0;
  const whatsappNumber = contact.whatsappNumber ?? "";
  const hasWhatsApp = whatsappNumber.length > 0;

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Email path — POST to /api/contact, which saves to contact_messages
  // and sends a notification email to the team via SES. SES is now
  // signing with d=madenkorea.com (custom MAIL FROM + DKIM verified)
  // so notifications actually reach the inbox.
  const handleSendEmail = async () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.message.trim()) {
      toast.error(t("errMissingRequired"));
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        toast.error(body?.message || t("errSend"));
        return;
      }
      toast.success(t("successToast"));
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      toast.error(t("errNetwork"));
    } finally {
      setIsLoading(false);
    }
  };

  // WhatsApp path — opens wa.me with the form fields pre-filled into a
  // chat message. Email is optional here since the conversation will
  // happen on WhatsApp, but we still pass it through if provided so
  // we can match the customer up with their account later if they email
  // us. Note: this does NOT save to `contact_messages` — the message
  // only exists in the resulting WhatsApp thread.
  const handleSendWhatsApp = () => {
    if (!hasWhatsApp) {
      toast.error(t("errNetwork"));
      return;
    }
    if (!formData.name.trim() || !formData.message.trim()) {
      toast.error(t("errMissingWhatsapp"));
      return;
    }
    const lines = [
      `Hi MadenKorea, I'm ${formData.name.trim()}.`,
      formData.subject.trim() ? `Subject: ${formData.subject.trim()}` : null,
      formData.email.trim() ? `Email: ${formData.email.trim()}` : null,
      "",
      formData.message.trim(),
    ].filter(Boolean) as string[];
    const text = encodeURIComponent(lines.join("\n"));
    const url = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // We don't clear the form here — the customer hasn't actually sent
    // the message yet (they still need to tap Send inside WhatsApp), so
    // keeping the form populated is the right behaviour if they come
    // back to retry or fall back to email.
  };

  return (
    <CustomerLayout>
      <PolicyHero
        eyebrow={t("heroEyebrow")}
        title={t("heroTitle")}
        description={t("heroDescription")}
      />

      <div className="container mx-auto py-10 sm:py-14">
        {/* Main: form (3 cols) + sidebar (2 cols) at lg:+. Form first in
            DOM so it stacks on top on mobile (the primary action). */}
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-5 lg:gap-8">
          {/* ---------- Form ---------- */}
          <Card className="lg:col-span-3 border-none shadow-md">
            <CardHeader className="border-b bg-muted/30 rounded-t-lg">
              <CardTitle className="text-2xl">{t("formHeading")}</CardTitle>
              <CardDescription>{t("formDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {/* The form `onSubmit` defaults to the email path so pressing
                  Enter in any field still sends an email (least-surprise
                  behaviour). The two buttons below let the customer pick
                  channel explicitly. */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendEmail();
                }}
                className="space-y-5"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">{t("nameLabel")}</Label>
                    <Input
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      placeholder={t("namePlaceholder")}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="flex items-baseline justify-between">
                      <span>{t("emailLabel")}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {t("emailRequiredHint")}
                      </span>
                    </Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder={t("emailPlaceholder")}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subject" className="flex items-baseline justify-between">
                    <span>{t("subjectLabel")}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {t("subjectOptional")}
                    </span>
                  </Label>
                  <Input
                    id="subject"
                    name="subject"
                    value={formData.subject}
                    onChange={handleChange}
                    placeholder={t("subjectPlaceholder")}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="message">{t("messageLabel")}</Label>
                  <Textarea
                    id="message"
                    name="message"
                    rows={6}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder={t("messagePlaceholder")}
                    required
                  />
                </div>

                {/* Send buttons: stacked on mobile, side-by-side on sm+. */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full sm:flex-1"
                    disabled={isLoading}
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    {isLoading ? t("sending") : t("sendEmail")}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    onClick={handleSendWhatsApp}
                    disabled={isLoading}
                    className="w-full sm:flex-1 bg-[#25D366] text-white hover:bg-[#1fb958] focus-visible:ring-[#25D366]"
                  >
                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                    {t("sendWhatsApp")}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("channelFootnote")}
                </p>
              </form>
            </CardContent>
          </Card>

          {/* ---------- Sidebar: Reach us + WhatsApp shortcut ---------- */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-none shadow-md">
              <CardHeader className="border-b bg-muted/30 rounded-t-lg">
                <CardTitle className="text-lg">{t("directHeading")}</CardTitle>
                <CardDescription>{t("directDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-5">
                {contact.contactName && (
                  <ContactRow
                    icon={<User className="h-4 w-4" />}
                    label={t("rowContactName")}
                    value={contact.contactName}
                  />
                )}
                <ContactRow
                  icon={<Mail className="h-4 w-4" />}
                  label={t("rowEmail")}
                  value={contact.supportEmail}
                  href={`mailto:${contact.supportEmail}`}
                />
                {hasSupportPhone && (
                  <ContactRow
                    icon={<Phone className="h-4 w-4" />}
                    label={t("rowPhone")}
                    value={supportPhone}
                    href={`tel:${supportPhone.replace(/\s+/g, "")}`}
                  />
                )}
                <ContactRow
                  icon={<Clock className="h-4 w-4" />}
                  label={t("rowHours")}
                  value={contact.businessHours}
                />
                {hasSupportAddress && (
                  <ContactRow
                    icon={<MapPin className="h-4 w-4" />}
                    label={t("rowAddress")}
                    value={supportAddress}
                  />
                )}
              </CardContent>
            </Card>

            {hasWhatsApp && (
              <Card className="border-none shadow-md bg-gradient-to-br from-[#25D366] to-[#1ea857] text-white">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-white/20 p-2 flex-shrink-0">
                      <WhatsAppIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold mb-1">
                        {t("whatsappCardTitle")}
                      </h3>
                      <p className="text-sm text-white/90 mb-4">
                        {t("whatsappCardBody")}
                      </p>
                      <a
                        href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-[#1fa855] hover:bg-white/90 transition-colors"
                      >
                        <WhatsAppIcon className="h-4 w-4" />
                        {t("whatsappCardCta")}
                      </a>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ---------- Brand + Partner + Grievance Officer ----------
            Brand card is always shown when we know the brand entity.
            Partner card shows the local distributor / importer + India-
            specific legal IDs (GSTIN, CDSCO). GO card carries the
            Consumer Protection (E-Commerce) Rules 2020 disclosure. */}
        {(brand.legalEntityName ||
          partner.legalEntityName ||
          partner.grievanceOfficer.name) && (
          <div className="max-w-6xl mx-auto mt-16 pt-10 border-t">
            <div className="text-center mb-8">
              <h2 className="text-xl font-semibold">{t("legalHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("legalDescription")}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {brand.legalEntityName && (
                <Card className="bg-muted/30 border-muted">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{t("brandTitle")}</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      {t("brandDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm space-y-1">
                    <p className="font-medium">{brand.legalEntityName}</p>
                    {brand.registeredAddress && (
                      <p className="text-muted-foreground whitespace-pre-line">
                        {brand.registeredAddress}
                      </p>
                    )}
                    {brand.email && (
                      <p>
                        <a
                          href={`mailto:${brand.email}`}
                          className="text-muted-foreground hover:text-foreground hover:underline break-words"
                        >
                          {brand.email}
                        </a>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {partner.legalEntityName && (
                <Card className="bg-muted/30 border-muted">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{partner.roleLabel}</CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      {t("companyDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm space-y-1">
                    <p className="font-medium">{partner.legalEntityName}</p>
                    {partner.registeredAddress && (
                      <p className="text-muted-foreground whitespace-pre-line">
                        {partner.registeredAddress}
                      </p>
                    )}
                    {partner.gstin && (
                      <p className="text-muted-foreground">
                        {t("gstinInlineLabel")} <span className="font-mono">{partner.gstin}</span>
                      </p>
                    )}
                    {partner.cdscoRegistration && (
                      <p className="text-muted-foreground">
                        {t("cdscoInlineLabel")}{" "}
                        <span className="font-mono">{partner.cdscoRegistration}</span>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {partner.grievanceOfficer.name && (
                <Card className="bg-muted/30 border-muted">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">
                        {t("grievanceTitle")}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs">
                      {t("grievanceDescription")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm space-y-1">
                    <p className="font-medium">{partner.grievanceOfficer.name}</p>
                    {partner.grievanceOfficer.designation && (
                      <p className="text-muted-foreground">
                        {partner.grievanceOfficer.designation}
                      </p>
                    )}
                    {partner.grievanceOfficer.email && (
                      <p>
                        <a
                          href={`mailto:${partner.grievanceOfficer.email}`}
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {partner.grievanceOfficer.email}
                        </a>
                      </p>
                    )}
                    {hasSupportPhone && (
                      <p className="text-muted-foreground">
                        {t("phoneInlineLabel")} {supportPhone}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}

// Compact contact-method row used in the sidebar. Icon in a muted
// rounded square + label + value, where the value can optionally be a
// real link (mailto / tel).
function ContactRow({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const valueEl = href ? (
    <a
      href={href}
      className="text-sm text-foreground hover:text-primary hover:underline break-words"
    >
      {value}
    </a>
  ) : (
    <p className="text-sm text-foreground whitespace-pre-line break-words">
      {value}
    </p>
  );
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2 text-muted-foreground flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
          {label}
        </p>
        {valueEl}
      </div>
    </div>
  );
}
