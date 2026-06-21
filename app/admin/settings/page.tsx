'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { invalidateShippingConfigCache } from '@/lib/hooks/useShippingConfig';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Save, Plus, Trash2 } from 'lucide-react';
import { SUPPORTED_COUNTRIES, COUNTRY_PROFILES } from '@/lib/countries';
import { toast } from 'sonner';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { user, hasRole, logout, ready } = useAuth();

  const [settings, setSettings] = useState({
    storeName: 'MadenKorea',
    storeDescription: 'Your trusted source for authentic Korean beauty and lifestyle products',
    storeEmail: 'info@madenkorea.com',
    storePhone: '+91 1234567890',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    freeShippingThreshold: 2000,
    defaultShippingFee: 149,
    codEnabled: true,
    taxInclusive: true,
    lowStockThreshold: 10,
    emailNotifications: true,
    smsNotifications: false,
    maintenanceMode: false,
  });

  const [savingShipping, setSavingShipping] = useState(false);

  // Business / legal / compliance fields. Live in store_settings; loaded
  // from /api/admin/settings/business-info and saved back the same way.
  // Three layers now:
  //   - brand* fields = Korean brand company (global)
  //   - partnerRoleLabel + everything else = Indian distribution partner (global)
  //   - per-country contact overrides live in a separate state (countryContacts)
  const [business, setBusiness] = useState({
    brandLegalEntityName: "",
    brandRegisteredAddress: "",
    brandCountryCode: "KR",
    brandEmail: "",
    partnerRoleLabel: "Authorized Importer & Distribution Partner",
    legalEntityName: "",
    registeredAddress: "",
    publicPhone: "",
    supportEmail: "",
    businessHours: "",
    grievanceOfficerName: "",
    grievanceOfficerDesignation: "",
    grievanceOfficerEmail: "",
    gstin: "",
    cdscoRegistration: "",
    jurisdictionCity: "",
    marketplaceDisclosureEnabled: false,
  });
  const [savingBusiness, setSavingBusiness] = useState(false);

  type CountryContactRow = {
    countryCode: string;
    contactName: string;
    publicPhone: string;
    whatsappNumber: string;
    supportEmail: string;
    businessHours: string;
    publicAddress: string;
    isActive: boolean;
  };
  const [countryContacts, setCountryContacts] = useState<CountryContactRow[]>([]);
  const [savingCountryContacts, setSavingCountryContacts] = useState(false);
  const [addCountryCode, setAddCountryCode] = useState<string>("");

  // Email verification global config (grace + lockout days).
  const [emailVerification, setEmailVerification] = useState({
    graceDays: 7,
    lockoutDays: 30,
  });
  const [savingEmailVerification, setSavingEmailVerification] = useState(false);

  // Cookie consent banner config — visitors see the banner after EITHER
  // `delaySeconds` elapse OR after N scroll bursts, whichever first.
  const [cookieConsentDelay, setCookieConsentDelay] = useState(7);
  const [cookieConsentScrolls, setCookieConsentScrolls] = useState(1);
  const [savingCookieConsent, setSavingCookieConsent] = useState(false);

  useEffect(() => {
    // Wait for AuthContext to hydrate before reading hasRole. Without
    // this guard, a hard reload kicks us back to /admin because the
    // role is briefly "no user" during context boot.
    if (!ready) return;
    if (!hasRole('admin')) {
      router.push('/admin');
      return;
    }
    const stored = localStorage.getItem('storeSettings');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      } catch {}
    }

    // Pull the live shipping values from the backend so the form
    // reflects what's actually being applied at checkout.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/shipping', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        setSettings((prev) => ({
          ...prev,
          freeShippingThreshold: Number(data.deliveryThreshold) || prev.freeShippingThreshold,
          defaultShippingFee: Number(data.defaultShippingFee) || prev.defaultShippingFee,
        }));
      } catch {}
    })();

    // Load business / legal / compliance info into the Business tab.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/business-info', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const info = data?.info ?? {};
        setBusiness((prev) => ({
          ...prev,
          brandLegalEntityName: info.brandLegalEntityName ?? '',
          brandRegisteredAddress: info.brandRegisteredAddress ?? '',
          brandCountryCode: info.brandCountryCode ?? 'KR',
          brandEmail: info.brandEmail ?? '',
          partnerRoleLabel:
            info.partnerRoleLabel ?? 'Authorized Importer & Distribution Partner',
          legalEntityName: info.legalEntityName ?? '',
          registeredAddress: info.registeredAddress ?? '',
          publicPhone: info.publicPhone ?? '',
          supportEmail: info.supportEmail ?? '',
          businessHours: info.businessHours ?? '',
          grievanceOfficerName: info.grievanceOfficerName ?? '',
          grievanceOfficerDesignation: info.grievanceOfficerDesignation ?? '',
          grievanceOfficerEmail: info.grievanceOfficerEmail ?? '',
          gstin: info.gstin ?? '',
          cdscoRegistration: info.cdscoRegistration ?? '',
          jurisdictionCity: info.jurisdictionCity ?? '',
          marketplaceDisclosureEnabled: !!info.marketplaceDisclosureEnabled,
        }));
      } catch {}
    })();

    // Load country contact overrides.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/country-contacts', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
        setCountryContacts(
          rows.map((r) => ({
            countryCode: String(r.countryCode || '').toUpperCase(),
            contactName: r.contactName ?? '',
            publicPhone: r.publicPhone ?? '',
            whatsappNumber: r.whatsappNumber ?? '',
            supportEmail: r.supportEmail ?? '',
            businessHours: r.businessHours ?? '',
            publicAddress: r.publicAddress ?? '',
            isActive: r.isActive !== false,
          }))
        );
      } catch {}
    })();

    // Load email verification global config.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/email-verification', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        setEmailVerification({
          graceDays: Number(data?.graceDays) || 7,
          lockoutDays: Number(data?.lockoutDays) || 30,
        });
      } catch {}
    })();

    // Load cookie consent banner delay.
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const token = s?.session?.access_token;
        const res = await fetch('/api/admin/settings/cookie-consent', {
          credentials: 'include',
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        setCookieConsentDelay(Number(data?.delaySeconds) || 7);
        setCookieConsentScrolls(Number(data?.scrollThreshold) || 1);
      } catch {}
    })();
  }, [ready, hasRole, router]);

  const handleSaveCookieConsent = async () => {
    setSavingCookieConsent(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/cookie-consent', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          delaySeconds: cookieConsentDelay,
          scrollThreshold: cookieConsentScrolls,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save');
        return;
      }
      toast.success('Cookie banner delay saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSavingCookieConsent(false);
    }
  };

  const handleSaveEmailVerification = async () => {
    setSavingEmailVerification(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/email-verification', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(emailVerification),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save');
        return;
      }
      toast.success('Email verification settings saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSavingEmailVerification(false);
    }
  };

  const handleSaveCountryContacts = async () => {
    setSavingCountryContacts(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/country-contacts', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rows: countryContacts }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save country contacts');
        return;
      }
      toast.success('Country contacts saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save country contacts');
    } finally {
      setSavingCountryContacts(false);
    }
  };

  const handleSaveBusiness = async () => {
    setSavingBusiness(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/business-info', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(business),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save business info');
        return;
      }
      toast.success('Business info saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save business info');
    } finally {
      setSavingBusiness(false);
    }
  };

  // Same hydration guard as the effect above. Returning null while
  // `ready` is false would flash blank before the page renders, but
  // returning null only when ready+not-admin keeps the redirect from
  // racing against the first render.
  if (!ready) return null;
  if (!hasRole('admin')) return null;

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const handleSave = async () => {
    // Other tabs are still localStorage-only (placeholders). Shipping
    // is the one that's wired to a real backend.
    localStorage.setItem('storeSettings', JSON.stringify(settings));

    setSavingShipping(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/settings/shipping', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          deliveryThreshold: settings.freeShippingThreshold,
          defaultShippingFee: settings.defaultShippingFee,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to save shipping settings');
        return;
      }
      // Drop the client-side cache so cart/checkout previews refetch.
      invalidateShippingConfigCache();
      toast.success('Settings saved successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save shipping settings');
    } finally {
      setSavingShipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Store Settings</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={handleSave} disabled={savingShipping}>
              <Save className="mr-2 h-4 w-4" />
              {savingShipping ? 'Saving…' : 'Save Changes'}
            </Button>
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <Tabs defaultValue="general" className="space-y-6">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="shipping">Shipping</TabsTrigger>
            <TabsTrigger value="business">Business</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Store Information</CardTitle>
                  <CardDescription>Basic information about your store</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="storeName">Store Name</Label>
                    <Input
                      id="storeName"
                      value={settings.storeName}
                      onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="storeDescription">Store Description</Label>
                    <Textarea
                      id="storeDescription"
                      value={settings.storeDescription}
                      onChange={(e) => setSettings({ ...settings, storeDescription: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="storeEmail">Store Email</Label>
                      <Input
                        id="storeEmail"
                        type="email"
                        value={settings.storeEmail}
                        onChange={(e) => setSettings({ ...settings, storeEmail: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="storePhone">Store Phone</Label>
                      <Input
                        id="storePhone"
                        value={settings.storePhone}
                        onChange={(e) => setSettings({ ...settings, storePhone: e.target.value })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Regional Settings</CardTitle>
                  <CardDescription>Currency and timezone preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="currency">Currency</Label>
                      <Select value={settings.currency} onValueChange={(value) => setSettings({ ...settings, currency: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INR">INR (₹)</SelectItem>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="EUR">EUR (€)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select value={settings.timezone} onValueChange={(value) => setSettings({ ...settings, timezone: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                          <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                          <SelectItem value="Europe/London">Europe/London (GMT)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Inventory Settings</CardTitle>
                  <CardDescription>Stock management preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2">
                    <Label htmlFor="lowStockThreshold">Low Stock Threshold</Label>
                    <Input
                      id="lowStockThreshold"
                      type="number"
                      value={settings.lowStockThreshold}
                      onChange={(e) => setSettings({ ...settings, lowStockThreshold: parseInt(e.target.value) || 0 })}
                    />
                    <p className="text-sm text-muted-foreground">
                      Alert when product quantity falls below this threshold
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Maintenance Mode</CardTitle>
                  <CardDescription>Temporarily disable the storefront</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="maintenanceMode">Enable Maintenance Mode</Label>
                      <p className="text-sm text-muted-foreground">Store will be unavailable to customers</p>
                    </div>
                    <Switch
                      id="maintenanceMode"
                      checked={settings.maintenanceMode}
                      onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                    />
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Label>Currency display</Label>
                        <p className="text-sm text-muted-foreground">
                          Manage FX rates for the multi-currency display, toggle
                          which currencies appear in the customer-facing switcher,
                          and trigger a manual rate refresh.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => router.push('/admin/settings/currencies')}
                      >
                        Manage currencies
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Email verification</CardTitle>
                  <CardDescription>
                    Controls how long new customers can use the site before their
                    email must be verified. The clock starts at signup (or at
                    rollout for existing accounts). Per-user extensions live in
                    the <Button variant="link" className="px-1 h-auto" onClick={() => router.push('/admin/users')}>Users page</Button>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="graceDays">Soft warning after</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="graceDays"
                          type="number"
                          min={1}
                          max={90}
                          value={emailVerification.graceDays}
                          onChange={(e) =>
                            setEmailVerification((v) => ({
                              ...v,
                              graceDays: Number(e.target.value) || 0,
                            }))
                          }
                        />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Until this day, the banner is subtle and dismissible.
                        After it, a prominent warning with a countdown appears.
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="lockoutDays">Soft lockout after</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="lockoutDays"
                          type="number"
                          min={1}
                          max={365}
                          value={emailVerification.lockoutDays}
                          onChange={(e) =>
                            setEmailVerification((v) => ({
                              ...v,
                              lockoutDays: Number(e.target.value) || 0,
                            }))
                          }
                        />
                        <span className="text-sm text-muted-foreground">days</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        After this day, an unverified user sees a soft-lock modal.
                        Browsing still works; cart, checkout, reviews, and other
                        account actions are blocked until they verify.
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSaveEmailVerification}
                      disabled={savingEmailVerification}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingEmailVerification ? 'Saving…' : 'Save email verification settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Cookie consent banner</CardTitle>
                  <CardDescription>
                    First-time visitors see the banner after EITHER the timer
                    elapses OR they&apos;ve scrolled the configured number of
                    times, whichever happens first. Returning visitors who
                    already accepted/rejected never see the banner.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="cookieDelay">Show banner after</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="cookieDelay"
                          type="number"
                          min={1}
                          max={60}
                          value={cookieConsentDelay}
                          onChange={(e) =>
                            setCookieConsentDelay(Number(e.target.value) || 0)
                          }
                        />
                        <span className="text-sm text-muted-foreground">seconds</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Recommended 5–10 seconds. Fallback for users who
                        don&apos;t scroll.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="cookieScrolls">Or after</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="cookieScrolls"
                          type="number"
                          min={1}
                          max={20}
                          value={cookieConsentScrolls}
                          onChange={(e) =>
                            setCookieConsentScrolls(Number(e.target.value) || 0)
                          }
                        />
                        <span className="text-sm text-muted-foreground">scrolls</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        One &ldquo;scroll&rdquo; = one continuous scroll
                        session (a long fast swipe = 1; scroll, pause, scroll
                        again = 2). Set to 1 to show as soon as the user
                        starts scrolling.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                    Cached for 5 minutes at the edge — changes can take a
                    few minutes to propagate to live visitors.
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      onClick={handleSaveCookieConsent}
                      disabled={savingCookieConsent}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {savingCookieConsent ? 'Saving…' : 'Save cookie banner settings'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="shipping">
            <Card>
              <CardHeader>
                <CardTitle>Shipping Settings</CardTitle>
                <CardDescription>Configure shipping options and rates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="defaultShippingFee">Default Shipping Fee (₹)</Label>
                  <Input
                    id="defaultShippingFee"
                    type="number"
                    min={0}
                    value={settings.defaultShippingFee}
                    onChange={(e) => setSettings({ ...settings, defaultShippingFee: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Flat shipping fee charged when the cart is below the free-shipping threshold and the customer is not a K-Plus member.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="freeShippingThreshold">Free Shipping Threshold (₹)</Label>
                  <Input
                    id="freeShippingThreshold"
                    type="number"
                    min={0}
                    value={settings.freeShippingThreshold}
                    onChange={(e) => setSettings({ ...settings, freeShippingThreshold: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-sm text-muted-foreground">
                    Offer free shipping for orders above this amount.
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="codEnabled">Cash on Delivery (COD)</Label>
                    <p className="text-sm text-muted-foreground">Allow customers to pay on delivery</p>
                  </div>
                  <Switch
                    id="codEnabled"
                    checked={settings.codEnabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, codEnabled: checked })}
                  />
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label>Delivery Time Zones</Label>
                      <p className="text-sm text-muted-foreground">
                        Edit the per-zone ETA windows shown on product pages (Chennai Metro, Tamil Nadu, South India, North India, Northeast, Islands).
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => router.push('/admin/settings/shipping-zones')}>
                      Manage zones
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label>International Shipping Rates</Label>
                      <p className="text-sm text-muted-foreground">
                        Per-country rate in ₹/gram used for non-India orders. Required for international Razorpay checkout to compute shipping.
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => router.push('/admin/settings/international-shipping')}>
                      Manage rates
                    </Button>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Label>Notification Emails</Label>
                      <p className="text-sm text-muted-foreground">
                        Email addresses that receive admin notifications (new order, payout request, contact submissions, international order requests).
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => router.push('/admin/settings/notification-emails')}>
                      Manage list
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="business">
            <Card>
              <CardHeader>
                <CardTitle>Brand company</CardTitle>
                <CardDescription>
                  The brand owner. Shown globally on every country&apos;s site
                  alongside the local distribution partner.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="brandLegalEntityName">Brand legal entity name</Label>
                    <Input
                      id="brandLegalEntityName"
                      value={business.brandLegalEntityName}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, brandLegalEntityName: e.target.value }))
                      }
                      placeholder="e.g. Happy Times Co Ltd"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="brandCountryCode">Country of registration</Label>
                    <Select
                      value={business.brandCountryCode}
                      onValueChange={(v) =>
                        setBusiness((b) => ({ ...b, brandCountryCode: v }))
                      }
                    >
                      <SelectTrigger id="brandCountryCode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {COUNTRY_PROFILES[c].flag} {COUNTRY_PROFILES[c].name} ({c})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brandRegisteredAddress">Brand registered address</Label>
                  <Textarea
                    id="brandRegisteredAddress"
                    rows={2}
                    value={business.brandRegisteredAddress}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, brandRegisteredAddress: e.target.value }))
                    }
                    placeholder="Street, City, Country"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brandEmail">Brand email</Label>
                  <Input
                    id="brandEmail"
                    type="email"
                    value={business.brandEmail}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, brandEmail: e.target.value }))
                    }
                    placeholder="info@brand.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Public contact email for the brand company. Surfaced on the storefront Contact page brand card.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveBusiness} disabled={savingBusiness}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingBusiness ? 'Saving…' : 'Save brand & partner info'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Distribution partner</CardTitle>
                <CardDescription>
                  The local importer / distributor handling fulfillment, GST,
                  and grievances. Global — same record everywhere. Per-country
                  contact details (phone, email, hours) live in the next card.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-2">
                  <Label htmlFor="partnerRoleLabel">Partner role label</Label>
                  <Input
                    id="partnerRoleLabel"
                    value={business.partnerRoleLabel}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, partnerRoleLabel: e.target.value }))
                    }
                    placeholder="Authorized Importer & Distribution Partner"
                  />
                  <p className="text-xs text-muted-foreground">
                    Displayed as the heading of the partner card on the storefront.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="legalEntityName">Partner legal entity name</Label>
                    <Input
                      id="legalEntityName"
                      value={business.legalEntityName}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, legalEntityName: e.target.value }))
                      }
                      placeholder="e.g. GTS Trade Solutions Pvt Ltd"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="gstin">GSTIN</Label>
                    <Input
                      id="gstin"
                      value={business.gstin}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, gstin: e.target.value }))
                      }
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="registeredAddress">Partner registered office address</Label>
                  <Textarea
                    id="registeredAddress"
                    rows={3}
                    value={business.registeredAddress}
                    onChange={(e) =>
                      setBusiness((b) => ({ ...b, registeredAddress: e.target.value }))
                    }
                    placeholder="Street, City, State, PIN"
                  />
                </div>

                <div className="border-t pt-4">
                  <p className="text-sm font-medium">Default contact details</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Fallback values used when a visitor&apos;s country has no
                    override row in the &ldquo;Per-country contact overrides&rdquo;
                    card below.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="publicPhone">Default public phone</Label>
                      <Input
                        id="publicPhone"
                        value={business.publicPhone}
                        onChange={(e) =>
                          setBusiness((b) => ({ ...b, publicPhone: e.target.value }))
                        }
                        placeholder="+91 98xxxxxxxx"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="supportEmail">Default support email</Label>
                      <Input
                        id="supportEmail"
                        type="email"
                        value={business.supportEmail}
                        onChange={(e) =>
                          setBusiness((b) => ({ ...b, supportEmail: e.target.value }))
                        }
                        placeholder="info@madenkorea.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="businessHours">Default business hours</Label>
                      <Input
                        id="businessHours"
                        value={business.businessHours}
                        onChange={(e) =>
                          setBusiness((b) => ({ ...b, businessHours: e.target.value }))
                        }
                        placeholder="Mon-Fri 9AM - 6PM IST"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div>
                    <h4 className="text-base font-semibold">Grievance Redressal Officer</h4>
                    <p className="text-sm text-muted-foreground">
                      Required by Consumer Protection (E-Commerce) Rules 2020. Shown in the
                      footer and on the Privacy page. Officer must acknowledge complaints
                      within 48 hours and resolve within one month.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="goName">Name</Label>
                      <Input
                        id="goName"
                        value={business.grievanceOfficerName}
                        onChange={(e) =>
                          setBusiness((b) => ({ ...b, grievanceOfficerName: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="goDesignation">Designation</Label>
                      <Input
                        id="goDesignation"
                        value={business.grievanceOfficerDesignation}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            grievanceOfficerDesignation: e.target.value,
                          }))
                        }
                        placeholder="Founder / Director"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="goEmail">Email</Label>
                      <Input
                        id="goEmail"
                        type="email"
                        value={business.grievanceOfficerEmail}
                        onChange={(e) =>
                          setBusiness((b) => ({
                            ...b,
                            grievanceOfficerEmail: e.target.value,
                          }))
                        }
                        placeholder="grievance@madenkorea.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="cdscoRegistration">CDSCO registration #</Label>
                    <Input
                      id="cdscoRegistration"
                      value={business.cdscoRegistration}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, cdscoRegistration: e.target.value }))
                      }
                      placeholder="For imported cosmetics"
                    />
                    <p className="text-xs text-muted-foreground">
                      Required under Cosmetics Rules 2020 for imported cosmetics. Optional
                      for now.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="jurisdictionCity">Jurisdiction city</Label>
                    <Input
                      id="jurisdictionCity"
                      value={business.jurisdictionCity}
                      onChange={(e) =>
                        setBusiness((b) => ({ ...b, jurisdictionCity: e.target.value }))
                      }
                      placeholder="Chennai"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used in the Terms &amp; Conditions dispute-resolution clause.
                    </p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Label className="text-base font-semibold">
                        Marketplace seller disclosure
                      </Label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        When on, vendor-supplied products show a &ldquo;Sold by&rdquo;
                        card on their detail page with the vendor&apos;s legal name,
                        address, and GSTIN. Required by Consumer Protection
                        (E-Commerce) Rules 2020 once you have approved vendors with
                        accurate records. Leave off until vendor data is correct.
                      </p>
                    </div>
                    <Switch
                      checked={business.marketplaceDisclosureEnabled}
                      onCheckedChange={(v) =>
                        setBusiness((b) => ({
                          ...b,
                          marketplaceDisclosureEnabled: v,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveBusiness} disabled={savingBusiness}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingBusiness ? 'Saving…' : 'Save partner info'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Per-country contact overrides</CardTitle>
                <CardDescription>
                  When a visitor is in country X, the storefront uses the values
                  in row X for phone, WhatsApp, support email, hours and public
                  address. Empty fields fall back to the &ldquo;Default contact
                  details&rdquo; above. Countries with no row see only the defaults.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {countryContacts.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No country overrides yet. Pick a country below to add one.
                  </p>
                )}
                {countryContacts.map((row, idx) => (
                  <div
                    key={row.countryCode}
                    className="rounded-md border p-4 space-y-3 bg-muted/20"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {COUNTRY_PROFILES[row.countryCode as keyof typeof COUNTRY_PROFILES]?.flag}{' '}
                          {COUNTRY_PROFILES[row.countryCode as keyof typeof COUNTRY_PROFILES]?.name ?? row.countryCode}
                        </span>
                        <span className="text-xs text-muted-foreground">({row.countryCode})</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={row.isActive}
                            onCheckedChange={(v) => {
                              setCountryContacts((rs) =>
                                rs.map((r, i) =>
                                  i === idx ? { ...r, isActive: v } : r
                                )
                              );
                            }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {row.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setCountryContacts((rs) =>
                              rs.filter((_, i) => i !== idx)
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="grid gap-1.5 md:col-span-3">
                        <Label htmlFor={`cc-name-${idx}`} className="text-xs">
                          Contact name
                        </Label>
                        <Input
                          id={`cc-name-${idx}`}
                          value={row.contactName}
                          onChange={(e) =>
                            setCountryContacts((rs) =>
                              rs.map((r, i) =>
                                i === idx ? { ...r, contactName: e.target.value } : r
                              )
                            )
                          }
                          placeholder="Person or department (e.g. Customer Care · Manoj Prabhu)"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`cc-phone-${idx}`} className="text-xs">
                          Phone
                        </Label>
                        <Input
                          id={`cc-phone-${idx}`}
                          value={row.publicPhone}
                          onChange={(e) =>
                            setCountryContacts((rs) =>
                              rs.map((r, i) =>
                                i === idx ? { ...r, publicPhone: e.target.value } : r
                              )
                            )
                          }
                          placeholder="(falls back to default)"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`cc-wa-${idx}`} className="text-xs">
                          WhatsApp number
                        </Label>
                        <Input
                          id={`cc-wa-${idx}`}
                          value={row.whatsappNumber}
                          onChange={(e) =>
                            setCountryContacts((rs) =>
                              rs.map((r, i) =>
                                i === idx ? { ...r, whatsappNumber: e.target.value } : r
                              )
                            )
                          }
                          placeholder="Digits only, e.g. 919384857587"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label htmlFor={`cc-email-${idx}`} className="text-xs">
                          Support email
                        </Label>
                        <Input
                          id={`cc-email-${idx}`}
                          type="email"
                          value={row.supportEmail}
                          onChange={(e) =>
                            setCountryContacts((rs) =>
                              rs.map((r, i) =>
                                i === idx ? { ...r, supportEmail: e.target.value } : r
                              )
                            )
                          }
                          placeholder="(falls back to default)"
                        />
                      </div>
                      <div className="grid gap-1.5 md:col-span-1">
                        <Label htmlFor={`cc-hours-${idx}`} className="text-xs">
                          Business hours
                        </Label>
                        <Input
                          id={`cc-hours-${idx}`}
                          value={row.businessHours}
                          onChange={(e) =>
                            setCountryContacts((rs) =>
                              rs.map((r, i) =>
                                i === idx ? { ...r, businessHours: e.target.value } : r
                              )
                            )
                          }
                          placeholder="(falls back to default)"
                        />
                      </div>
                      <div className="grid gap-1.5 md:col-span-2">
                        <Label htmlFor={`cc-addr-${idx}`} className="text-xs">
                          Public address (optional)
                        </Label>
                        <Input
                          id={`cc-addr-${idx}`}
                          value={row.publicAddress}
                          onChange={(e) =>
                            setCountryContacts((rs) =>
                              rs.map((r, i) =>
                                i === idx ? { ...r, publicAddress: e.target.value } : r
                              )
                            )
                          }
                          placeholder="Local office or mailing address"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="border-t pt-4 flex flex-wrap items-end gap-3">
                  <div className="grid gap-1.5 min-w-[14rem]">
                    <Label className="text-xs">Add country</Label>
                    <Select
                      value={addCountryCode}
                      onValueChange={(v) => setAddCountryCode(v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a country…" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED_COUNTRIES.filter(
                          (c) => !countryContacts.some((r) => r.countryCode === c)
                        ).map((c) => (
                          <SelectItem key={c} value={c}>
                            {COUNTRY_PROFILES[c].flag} {COUNTRY_PROFILES[c].name} ({c})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    disabled={!addCountryCode}
                    onClick={() => {
                      if (!addCountryCode) return;
                      setCountryContacts((rs) => [
                        ...rs,
                        {
                          countryCode: addCountryCode,
                          contactName: '',
                          publicPhone: '',
                          whatsappNumber: '',
                          supportEmail: '',
                          businessHours: '',
                          publicAddress: '',
                          isActive: true,
                        },
                      ]);
                      setAddCountryCode('');
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add country
                  </Button>

                  <div className="flex-1" />

                  <Button
                    onClick={handleSaveCountryContacts}
                    disabled={savingCountryContacts}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {savingCountryContacts ? 'Saving…' : 'Save country contacts'}
                  </Button>
                </div>
              </CardContent>
            </Card>

          </TabsContent>

          <TabsContent value="payments">
            <Card>
              <CardHeader>
                <CardTitle>Payment Settings</CardTitle>
                <CardDescription>Configure payment gateway and tax settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="taxInclusive">Tax Inclusive Pricing</Label>
                    <p className="text-sm text-muted-foreground">Show prices with tax included</p>
                  </div>
                  <Switch
                    id="taxInclusive"
                    checked={settings.taxInclusive}
                    onCheckedChange={(checked) => setSettings({ ...settings, taxInclusive: checked })}
                  />
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Payment gateway integration (Razorpay/Stripe) will be available after backend setup
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>Configure notification preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="emailNotifications">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive order and system notifications via email</p>
                  </div>
                  <Switch
                    id="emailNotifications"
                    checked={settings.emailNotifications}
                    onCheckedChange={(checked) => setSettings({ ...settings, emailNotifications: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="smsNotifications">SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive critical alerts via SMS</p>
                  </div>
                  <Switch
                    id="smsNotifications"
                    checked={settings.smsNotifications}
                    onCheckedChange={(checked) => setSettings({ ...settings, smsNotifications: checked })}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
