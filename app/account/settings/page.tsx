"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/contexts/AuthContext";
import { CustomerLayout } from "@/components/CustomerLayout";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { Flag } from "@/components/Flag";
import { EmailChangeRequestBlock } from "@/components/EmailChangeRequestBlock";
import {
  COUNTRY_PROFILES,
  SUPPORTED_COUNTRIES,
  isSupportedCountry,
  type CountryCode,
} from "@/lib/countries";

type Profile = {
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  email?: string | null;
};
type Address = {
  id: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  is_default: boolean;
  // Fields the DB already has but the form was hiding. Surfaced now
  // so a checkout-time address snapshot is complete (name + phone
  // are the most important — couriers reject deliveries without them).
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  landmark?: string | null;
};

// Country values stored on legacy rows are free-form strings ("India",
// "USA", etc). New saves use the ISO-3166 alpha-2 code from the
// SUPPORTED_COUNTRIES set. We treat anything that doesn't match as
// "India" for the country dropdown default — keeps existing rows
// editable without forcing a backfill.
const ADDRESS_COUNTRY_DEFAULT: CountryCode = "IN";
function coerceCountryCode(raw: string | null | undefined): CountryCode {
  if (!raw) return ADDRESS_COUNTRY_DEFAULT;
  const upper = raw.trim().toUpperCase();
  if (isSupportedCountry(upper)) return upper;
  // Legacy text values
  const lower = raw.trim().toLowerCase();
  if (lower === "india" || lower === "in") return "IN";
  return ADDRESS_COUNTRY_DEFAULT;
}

export default function AccountSettingsPage() {
  const router = useRouter();
  const t = useTranslations("account");
  const { user, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<Profile>({
    full_name: "",
    email: "",
    phone: "",
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [defaultingAddressId, setDefaultingAddressId] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addrDialog, setAddrDialog] = useState(false);
  const [editing, setEditing] = useState<Address | null>(null);
  const [addrForm, setAddrForm] = useState({
    name: "",
    phone: "",
    email: "",
    line1: "",
    line2: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    country: ADDRESS_COUNTRY_DEFAULT as CountryCode,
    is_default: false,
  });

  // password UI state
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login?redirect=/account/settings");
      return;
    }
    (async () => {
      // profile + addresses now come from the account API (MySQL behind the
      // flag, Supabase fallback). Identity is resolved server-side.
      try {
        const [pRes, aRes] = await Promise.all([
          fetch("/api/account/profile"),
          fetch("/api/account/addresses"),
        ]);
        const prof = (await pRes.json().catch(() => ({} as any)))?.profile;
        setProfile({
          full_name: prof?.full_name || "",
          avatar_url: prof?.avatar_url || null,
          phone: prof?.phone || "",
          email: user?.email || "",
        });
        const aJson = await aRes.json().catch(() => ({} as any));
        setAddresses(aJson.addresses ?? []);
      } catch {
        setProfile((p) => ({ ...p, email: user?.email || "" }));
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, [isAuthenticated, router, user?.id, user?.email]);

  if (!isAuthenticated) return null;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    const res = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: profile.full_name, phone: profile.phone }),
    });
    setSavingProfile(false);
    if (!res.ok) {
      toast.error(t("profileErrUpdate"));
      return;
    }
    toast.success(t("profileUpdatedToast"));
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw.current) {
      toast.error(t("pwErrCurrent"));
      return;
    }
    if (pw.next.length < 8) {
      toast.error(t("pwErrMin"));
      return;
    }
    if (pw.next !== pw.confirm) {
      toast.error(t("pwErrMismatch"));
      return;
    }
    setSavingPassword(true);
    // Server-side change. The route verifies the current password against the
    // MySQL hash NextAuth uses, enforces the email-verification gate, updates the
    // hash, and dual-writes Supabase — so it works under both auth backends
    // (the old supabase.auth.signInWithPassword + updateUser path had no session
    // under NextAuth and never updated the MySQL hash).
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ current: pw.current, next: pw.next }),
      });
      const data = await res.json().catch(() => ({} as any));
      setSavingPassword(false);
      if (!res.ok || !data?.ok) {
        if (data?.code === "email_not_verified") {
          toast.error("Verify your email before changing your password.");
        } else if (data?.code === "INCORRECT_PASSWORD") {
          toast.error(t("pwErrIncorrect"));
        } else {
          toast.error(data?.error || "Could not change password");
        }
        return;
      }
      toast.success(t("pwChangedToast"));
      setPw({ current: "", next: "", confirm: "" });
    } catch {
      setSavingPassword(false);
      toast.error("Could not change password");
    }
  };

  const openAdd = (a?: Address) => {
    if (a) {
      setEditing(a);
      setAddrForm({
        name: a.name || profile.full_name || "",
        phone: a.phone || profile.phone || "",
        email: a.email || profile.email || "",
        line1: a.line1,
        line2: a.line2 || "",
        landmark: a.landmark || "",
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        country: coerceCountryCode(a.country),
        is_default: !!a.is_default,
      });
    } else {
      setEditing(null);
      // Pre-fill name/email/phone from the profile so new addresses
      // don't lose contact info that we already know — the previous
      // form omitted these fields entirely and couriers were getting
      // address rows without a recipient name.
      setAddrForm({
        name: profile.full_name || "",
        phone: profile.phone || "",
        email: profile.email || "",
        line1: "",
        line2: "",
        landmark: "",
        city: "",
        state: "",
        pincode: "",
        country: ADDRESS_COUNTRY_DEFAULT,
        is_default: false,
      });
    }
    setAddrDialog(true);
  };

  const saveAddress = async () => {
    // Trim once up front so empty-string-with-whitespace doesn't slip
    // past the validation gate.
    const name = (addrForm.name || "").trim();
    const phone = (addrForm.phone || "").trim();
    const email = (addrForm.email || "").trim();
    const line1 = (addrForm.line1 || "").trim();
    const city = (addrForm.city || "").trim();
    const state = (addrForm.state || "").trim();
    const pincode = (addrForm.pincode || "").trim();
    const country = addrForm.country;
    const isIndia = country === "IN";

    // Mandatory fields: name, phone, line1, city, pincode, country.
    // State is mandatory for India (GST destination requires it) and
    // optional everywhere else. We surface a specific message instead
    // of the generic "addrErrRequired" so users know exactly what's
    // missing — generic error toasts on long forms are frustrating.
    const missing: string[] = [];
    if (!name) missing.push(t("addrFieldRecipientName"));
    if (!phone) missing.push(t("addrFieldPhone"));
    if (!line1) missing.push(t("addrFieldAddressLine1"));
    if (!city) missing.push(t("addrFieldCity"));
    if (isIndia && !state) missing.push(t("addrFieldState"));
    if (!pincode)
      missing.push(
        isIndia ? t("addrFieldPincode") : t("addrFieldPostalCode")
      );
    if (!country) missing.push(t("addrFieldCountry"));

    if (missing.length > 0) {
      toast.error(t("addrErrMissingFields", { fields: missing.join(", ") }));
      return;
    }

    // India still needs a 6-digit numeric PIN. Catching here means we
    // don't write malformed data and force the user to discover it
    // at checkout where a courier-side validation would reject it.
    if (isIndia && !/^\d{6}$/.test(pincode)) {
      toast.error(t("addrErrIndianPincode"));
      return;
    }

    setSavingAddress(true);
    const payload = {
      name,
      phone,
      email: email || null,
      line1,
      line2: addrForm.line2?.trim() || null,
      landmark: addrForm.landmark?.trim() || null,
      city,
      state: state || null,
      pincode,
      country,
      is_default: addrForm.is_default,
    };

    let ok = false;
    if (editing) {
      const res = await fetch(`/api/account/addresses/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      ok = res.ok;
    } else {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      ok = res.ok;
    }
    if (!ok) {
      setSavingAddress(false);
      toast.error(t("addrErrSave"));
      return;
    }

    // reload
    const aJson = await (await fetch("/api/account/addresses")).json().catch(() => ({} as any));
    setAddresses(aJson.addresses ?? []);
    setAddrDialog(false);
    setSavingAddress(false);
    toast.success(t("addrSavedToast"));
  };

  const deleteAddress = async (id: string) => {
    if (!window.confirm(t("addrConfirmDelete"))) return;
    setDeletingAddressId(id);
    const res = await fetch(`/api/account/addresses/${id}`, { method: "DELETE" });
    setDeletingAddressId(null);
    if (!res.ok) {
      toast.error(t("addrErrDelete"));
      return;
    }
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    toast.success(t("addrDeletedToast"));
  };

  const makeDefault = async (id: string) => {
    setDefaultingAddressId(id);
    await fetch(`/api/account/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_default" }),
    });
    const aJson = await (await fetch("/api/account/addresses")).json().catch(() => ({} as any));
    setDefaultingAddressId(null);
    setAddresses(aJson.addresses ?? []);
    toast.success(t("addrDefaultUpdatedToast"));
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{t("settingsTitle")}</h1>
          <p className="text-muted-foreground">
            Manage your profile, password, and addresses
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile">{t("tabProfile")}</TabsTrigger>
            <TabsTrigger value="password">{t("tabPassword")}</TabsTrigger>
            <TabsTrigger value="addresses">{t("tabAddresses")}</TabsTrigger>
          </TabsList>

          {/* PROFILE */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>{t("profileInfoTitle")}</CardTitle>
                <CardDescription>{t("profileInfoDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveProfile} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">{t("settingsFullName")}</Label>
                    <Input
                      id="name"
                      value={profile.full_name || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, full_name: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="email">{t("settingsEmail")}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email || ""}
                      disabled
                    />
                    <EmailChangeRequestBlock />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="phone">{t("settingsPhone")}</Label>
                    <Input
                      id="phone"
                      value={profile.phone || ""}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, phone: e.target.value }))
                      }
                      placeholder={t("settingsPhonePlaceholder")}
                    />
                  </div>

                  <Separator />
                  <Button type="submit" disabled={savingProfile || loadingProfile}>
                    {savingProfile ? t("savingChanges") : t("saveChanges")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PASSWORD */}
          <TabsContent value="password">
            <Card>
              <CardHeader>
                <CardTitle>{t("changePasswordTitle")}</CardTitle>
                <CardDescription>{t("changePasswordDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={changePassword} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="currentPassword">{t("currentPasswordLabel")}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="currentPassword"
                        type={show.current ? "text" : "password"}
                        value={pw.current}
                        onChange={(e) =>
                          setPw((p) => ({ ...p, current: e.target.value }))
                        }
                        required
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setShow((s) => ({ ...s, current: !s.current }))
                        }
                      >
                        {show.current ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="newPassword">{t("newPasswordLabel")}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="newPassword"
                        type={show.next ? "text" : "password"}
                        value={pw.next}
                        onChange={(e) =>
                          setPw((p) => ({ ...p, next: e.target.value }))
                        }
                        required
                        minLength={8}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setShow((s) => ({ ...s, next: !s.next }))
                        }
                      >
                        {show.next ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Must be at least 8 characters
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">
                      Confirm New Password
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="confirmPassword"
                        type={show.confirm ? "text" : "password"}
                        value={pw.confirm}
                        onChange={(e) =>
                          setPw((p) => ({ ...p, confirm: e.target.value }))
                        }
                        required
                        minLength={8}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setShow((s) => ({ ...s, confirm: !s.confirm }))
                        }
                      >
                        {show.confirm ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {pw.confirm.length > 0 && (
                      <p
                        className={`text-xs ${
                          pw.next === pw.confirm
                            ? "text-emerald-600"
                            : "text-destructive"
                        }`}
                      >
                        {pw.next === pw.confirm
                          ? t("passwordsMatch")
                          : t("passwordsDoNotMatch")}
                      </p>
                    )}
                  </div>

                  <Separator />
                  <Button type="submit" disabled={savingPassword}>
                    {savingPassword ? t("changingPassword") : t("changePasswordBtn")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ADDRESSES */}
          <TabsContent value="addresses">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>{t("savedAddressesTitle")}</CardTitle>
                    <CardDescription>
                      Manage your shipping addresses
                    </CardDescription>
                  </div>
                  <Button onClick={() => openAdd()}>{t("addNewAddressBtn")}</Button>
                </div>
              </CardHeader>
              <CardContent>
                {addresses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No saved addresses yet
                    <div className="mt-4">
                      <Button onClick={() => openAdd()}>{t("addAddressBtn")}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addresses.map((a) => {
                      const code = coerceCountryCode(a.country);
                      const profile = COUNTRY_PROFILES[code];
                      return (
                      <Card key={a.id}>
                        <CardContent className="p-4 flex justify-between items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Flag
                                code={code}
                                width={20}
                                className="rounded-[2px] shrink-0"
                                alt=""
                              />
                              <span className="font-medium">
                                {a.name || t("addrNoNameFallback")}
                              </span>
                              {a.is_default && (
                                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {t("addrDefaultBadge")}
                                </span>
                              )}
                            </div>
                            {a.phone && (
                              <p className="text-sm text-muted-foreground">
                                {a.phone}
                              </p>
                            )}
                            <p className="text-sm mt-1">
                              {a.line1}
                              {a.line2 ? `, ${a.line2}` : ""}
                            </p>
                            {a.landmark && (
                              <p className="text-xs text-muted-foreground">
                                Landmark: {a.landmark}
                              </p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {a.city}
                              {a.state ? `, ${a.state}` : ""} - {a.pincode}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {profile.name}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!a.is_default && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => makeDefault(a.id)}
                                disabled={defaultingAddressId === a.id}
                              >
                                {defaultingAddressId === a.id ? t("addrSetting") : t("addrSetDefaultBtn")}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAdd(a)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteAddress(a.id)}
                              disabled={deletingAddressId === a.id}
                            >
                              {deletingAddressId === a.id ? t("addrDeleting") : t("addrDelete")}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Address dialog */}
      <Dialog open={addrDialog} onOpenChange={setAddrDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("addrEditTitle") : t("addrAddTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 max-h-[70vh] overflow-y-auto pr-1">
            {/* Contact details — couriers reject deliveries without a
                recipient name + phone, so these are mandatory and
                pre-filled from the user's profile when possible. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>
                  {t("addrRecipientName")} <span className="text-red-600">*</span>
                </Label>
                <Input
                  value={addrForm.name}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder={t("addrFullNamePlaceholder")}
                />
              </div>
              <div className="grid gap-1">
                <Label>
                  {t("addrPhone")} <span className="text-red-600">*</span>
                </Label>
                <Input
                  type="tel"
                  inputMode={addrForm.country === "IN" ? "numeric" : "tel"}
                  pattern={
                    addrForm.country === "IN" ? "[6-9][0-9]{9}" : undefined
                  }
                  maxLength={addrForm.country === "IN" ? 10 : undefined}
                  value={addrForm.phone}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, phone: e.target.value }))
                  }
                  placeholder={
                    addrForm.country === "IN"
                      ? t("addrPhonePlaceholderIndia")
                      : t("addrPhonePlaceholderIntl")
                  }
                />
              </div>
            </div>

            <div className="grid gap-1">
              <Label>{t("addrEmailOptional")}</Label>
              <Input
                type="email"
                value={addrForm.email}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, email: e.target.value }))
                }
                placeholder={t("addrEmailPlaceholder")}
              />
            </div>

            {/* Address — country first so all downstream field labels
                + validation can swap before the user types anything. */}
            <div className="grid gap-1">
              <Label>
                {t("addrCountry")} <span className="text-red-600">*</span>
              </Label>
              <select
                value={addrForm.country}
                onChange={(e) =>
                  setAddrForm((f) => ({
                    ...f,
                    country: e.target.value as CountryCode,
                  }))
                }
                className="border rounded px-2 py-2 h-10 bg-background"
              >
                {SUPPORTED_COUNTRIES.map((c) => {
                  const p = COUNTRY_PROFILES[c];
                  return (
                    <option key={c} value={c}>
                      {p.flag} {p.name} ({c})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="grid gap-1">
              <Label>
                {t("addrLine1")} <span className="text-red-600">*</span>
              </Label>
              <Input
                value={addrForm.line1}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, line1: e.target.value }))
                }
                placeholder={t("addrLine1Placeholder")}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("addrLine2")}</Label>
              <Input
                value={addrForm.line2}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, line2: e.target.value }))
                }
                placeholder={t("addrLine2Placeholder")}
              />
            </div>
            <div className="grid gap-1">
              <Label>{t("addrLandmarkOptional")}</Label>
              <Input
                value={addrForm.landmark}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, landmark: e.target.value }))
                }
                placeholder={t("addrLandmarkPlaceholder")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>
                  {t("addrCity")} <span className="text-red-600">*</span>
                </Label>
                <Input
                  value={addrForm.city}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, city: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>
                  {addrForm.country === "IN"
                    ? `${t("addrState")} `
                    : t("addrStateRegion")}
                  {addrForm.country === "IN" && (
                    <span className="text-red-600">*</span>
                  )}
                </Label>
                <Input
                  value={addrForm.state}
                  onChange={(e) =>
                    setAddrForm((f) => ({ ...f, state: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>
                  {addrForm.country === "IN"
                    ? `${t("addrPincode")} `
                    : `${t("addrPostalCode")} `}
                  <span className="text-red-600">*</span>
                </Label>
                <Input
                  inputMode={addrForm.country === "IN" ? "numeric" : "text"}
                  // India: 6 digits, numeric only. International: freeform
                  // alphanumeric (UK W1A, Canadian K1A 0B1, etc.).
                  maxLength={addrForm.country === "IN" ? 6 : 16}
                  value={addrForm.pincode}
                  onChange={(e) =>
                    setAddrForm((f) => ({
                      ...f,
                      pincode:
                        addrForm.country === "IN"
                          ? e.target.value.replace(/\D/g, "").slice(0, 6)
                          : e.target.value.slice(0, 16),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="default"
                type="checkbox"
                checked={addrForm.is_default}
                onChange={(e) =>
                  setAddrForm((f) => ({ ...f, is_default: e.target.checked }))
                }
              />
              <Label htmlFor="default">{t("addrSetDefault")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddrDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveAddress} disabled={savingAddress}>
              {savingAddress ? t("savingChanges") : editing ? t("addrUpdate") : t("addrSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
