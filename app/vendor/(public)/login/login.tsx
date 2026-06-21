'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn } from 'lucide-react';

type VendorInfo = {
  id: string;
  display_name: string;
  slug: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  role: 'owner' | 'manager' | 'staff' | null;
  rejected_reason?: string | null;
};

// Supabase RPC that RETURNS TABLE comes back as an array.
// This helper normalizes it to a single object or null.
function coerceVendor(data: any): VendorInfo | null {
  const arr = Array.isArray(data) ? data : (data ? [data] : []);
  const v = arr[0];
  if (!v || !v.id) return null;
  return {
    id: v.id,
    display_name: v.display_name,
    slug: v.slug ?? null,
    status: v.status,
    role: v.role ?? null,
    rejected_reason: v.rejected_reason ?? null,
  } as VendorInfo;
}

export default function VendorLoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const redirect = sp.get('redirect') || '/vendor';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Wait for auth hydration, then smart-redirect if already logged in
  useEffect(() => {
    let mounted = true;
    (async () => {
      // Use getSession to avoid early nulls
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user) { setHydrated(true); return; }

      const { data, error } = await supabase.rpc('get_my_vendor');
      if (error) {
        console.error('get_my_vendor error', error);
        setHydrated(true);
        return;
      }
      const v = coerceVendor(data);
      setHydrated(true);
      router.replace(v ? redirect : '/vendor/register');
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt) => {
      // If the user logs in on another tab, we’ll re-run the logic on submit anyway.
      setHydrated(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router, redirect]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message || 'Login failed');
      return;
    }
    toast.success('Logged in');

    // After login, check vendor status and route accordingly
    const { data, error: verr } = await supabase.rpc('get_my_vendor');
    if (verr) {
      toast.error(verr.message || 'Could not load vendor status');
      return;
    }
    const v = coerceVendor(data);
    router.replace(v ? redirect : '/vendor/register');
  };

  return (
    <div className="container mx-auto py-16">
      <Card className="max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl">Vendor Login</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onLogin}>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e)=>setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={()=>setShow(s=>!s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button className="w-full" type="submit" disabled={busy || !hydrated}>
              <LogIn className="mr-2 h-4 w-4" />
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Don’t have a vendor account?{' '}
              <Link className="text-primary underline" href="/vendor/register">Register</Link>
            </div>
            <div className="text-xs text-center mt-2">
              <Link className="text-muted-foreground underline" href="/auth/forgot">
                Forgot password?
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
