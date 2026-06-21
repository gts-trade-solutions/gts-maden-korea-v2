'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import Link from 'next/link';

export default function VendorRegisterPage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [hasUser, setHasUser] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [website, setWebsite] = useState('');
  const [addr, setAddr] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
  });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  // Allow the page to render when signed-out; only suggest login instead of redirecting
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setHasUser(!!user);
      setAuthReady(true);

      if (user) {
        // If already has vendor, send to /vendor
        const { data, error } = await supabase.rpc('get_my_vendor');
        if (!error) {
          const arr = Array.isArray(data) ? data : data ? [data] : [];
          const v = arr[0];
          if (v?.status) router.replace('/vendor'); // VendorGate will handle pending/approved UI
        }
      }
    })();
  }, [router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasUser) {
      toast.error('Please sign in first to submit your vendor application.');
      return;
    }
    if (!agree) {
      toast.error('Please accept the terms to continue.');
      return;
    }
    setBusy(true);
    const address_json = {
      line1: addr.line1,
      line2: addr.line2 || null,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country || 'India',
    };
    const { error } = await supabase.rpc('register_vendor', {
      p_display_name: displayName,
      p_legal_name: legalName || null,
      p_slug: slug || null,
      p_email: email || null,
      p_phone: phone || null,
      p_gstin: gstin || null,
      p_website: website || null,
      p_address_json: address_json,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Could not submit application');
      return;
    }
    // Fire the admin bell notification (best-effort).
    void (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const at = s?.session?.access_token;
        await fetch('/api/vendor/notify-signup', {
          method: 'POST',
          credentials: 'include',
          headers: at ? { authorization: `Bearer ${at}` } : undefined,
        });
      } catch {
        /* swallow — bell isn't critical to the apply flow */
      }
    })();

    toast.success('Application submitted! We’ll review and notify you.');
    router.replace('/vendor'); // VendorGate will show “Pending” if not yet approved
  };

  if (!authReady) {
    return (
      <div className="container mx-auto py-12 text-muted-foreground">
        Loading…
      </div>
    );
  }

  // When signed out: show a friendly login prompt instead of redirecting
  if (!hasUser) {
    return (
      <div className="container mx-auto py-12">
        <Card className="max-w-md mx-auto text-center">
          <CardHeader>
            <CardTitle className="text-2xl">Vendor Registration</CardTitle>
            <CardDescription>Sign in to continue your application.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full">
              <Link href="/vendor/login?redirect=/vendor/register">Sign in to continue</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Don’t have an account? Use your store login. We’ll link your vendor application to it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Signed in → render the form
  return (
    <div className="container mx-auto py-12">
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Vendor Registration</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={onSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Display Name *</Label>
                <Input value={displayName} onChange={(e)=>setDisplayName(e.target.value)} required />
              </div>
              <div>
                <Label>Legal Name</Label>
                <Input value={legalName} onChange={(e)=>setLegalName(e.target.value)} />
              </div>
              <div>
                <Label>Preferred Slug</Label>
                <Input
                  value={slug}
                  onChange={(e)=>setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'))}
                  placeholder="e.g. my-brand"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Optional. We’ll make it unique if taken.
                </p>
              </div>
              <div>
                <Label>Website</Label>
                <Input value={website} onChange={(e)=>setWebsite(e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <Label>Contact Email</Label>
                <Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input inputMode="numeric" maxLength={10} value={phone} onChange={(e)=>setPhone(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>GSTIN</Label>
                <Input value={gstin} onChange={(e)=>setGstin(e.target.value.toUpperCase())} />
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-medium">Business Address</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Address Line 1 *</Label>
                  <Input value={addr.line1} onChange={(e)=>setAddr(a=>({...a, line1:e.target.value}))} required />
                </div>
                <div>
                  <Label>Address Line 2</Label>
                  <Input value={addr.line2} onChange={(e)=>setAddr(a=>({...a, line2:e.target.value}))} />
                </div>
                <div>
                  <Label>City *</Label>
                  <Input value={addr.city} onChange={(e)=>setAddr(a=>({...a, city:e.target.value}))} required />
                </div>
                <div>
                  <Label>State *</Label>
                  <Input value={addr.state} onChange={(e)=>setAddr(a=>({...a, state:e.target.value}))} required />
                </div>
                <div>
                  <Label>Pincode *</Label>
                  <Input inputMode="numeric" maxLength={6} value={addr.pincode} onChange={(e)=>setAddr(a=>({...a, pincode:e.target.value}))} required />
                </div>
                <div>
                  <Label>Country *</Label>
                  <Input value={addr.country} onChange={(e)=>setAddr(a=>({...a, country:e.target.value}))} required />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="agree" checked={agree} onCheckedChange={(v)=>setAgree(!!v)} />
              <Label htmlFor="agree" className="text-sm">
                I confirm the above details are accurate and agree to the terms.
              </Label>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit Application'}</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/vendor/login?redirect=/vendor/register">Back to Login</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
