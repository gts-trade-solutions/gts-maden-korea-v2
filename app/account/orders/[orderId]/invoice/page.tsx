'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/contexts/AuthContext';
import { resolveMediaUrl } from '@/lib/storage/backend';

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl('product-media', path) ?? null;
}

function formatINR(v?: number | null, currency?: string | null) {
  if (v == null) return '';
  const code = (currency ?? 'INR').toUpperCase();
  if (code === 'INR') return `₹${v.toLocaleString('en-IN')}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
    }).format(v);
  } catch {
    return `${code} ${v.toLocaleString()}`;
  }
}

export default function InvoicePage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      router.replace(`/auth/login?redirect=/account/orders/${orderId}/invoice`);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        // Backend-aware: ownership-checked order + items via the account API
        // (server resolves the user). No browser supabase.auth (fails post-flip).
        const res = await fetch(`/api/account/orders/${encodeURIComponent(orderId)}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const j = await res.json();
          setOrder(j?.order ?? null);
          setItems(j?.items ?? []);
        } else {
          setOrder(null);
          setItems([]);
        }
      } catch {
        setOrder(null);
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, isAuthenticated, orderId, router]);

  const itemCount = useMemo(
    () => items.reduce((n, i) => n + (i.quantity || 1), 0),
    [items]
  );

  const handlePrint = () => window.print();

  if (!ready) {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading invoice…
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="container mx-auto py-16 text-muted-foreground">
        Loading invoice…
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto py-16">
        <h1 className="text-2xl font-bold mb-4">Invoice not found</h1>
        <Button onClick={() => router.push('/account/orders')}>Back to Orders</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 print:py-0">
      <div className="flex justify-between items-center mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Invoice</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Back
          </Button>
          <Button onClick={handlePrint}>Print / Save PDF</Button>
        </div>
      </div>

      <Card className="shadow print:shadow-none print:border-0">
        <CardContent className="p-6 print:p-0">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">MadenKorea</h2>
              <p className="text-sm text-muted-foreground">www.madenkorea.com</p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Invoice No.</div>
              <div className="font-semibold">
                {`INV-${String(order?.order_number || order?.id).replace(/[^\w]/g, '')}`}
              </div>
              <div className="text-sm text-muted-foreground mt-2">Date</div>
              <div className="font-semibold">
                {order?.created_at
                  ? new Date(order.created_at).toLocaleDateString('en-IN')
                  : '--'}
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <div className="text-sm text-muted-foreground">Bill To</div>
              {order?.address_snapshot ? (
                <div className="mt-1 text-sm">
                  <div className="font-medium">{order.address_snapshot.name}</div>
                  <div>{order.address_snapshot.address || order.address_snapshot.line1}</div>
                  {order.address_snapshot.line2 ? (
                    <div>{order.address_snapshot.line2}</div>
                  ) : null}
                  <div>
                    {order.address_snapshot.city}, {order.address_snapshot.state} -{' '}
                    {order.address_snapshot.pincode}
                  </div>
                  <div>{order.address_snapshot.country || 'India'}</div>
                  {order.address_snapshot.phone ? (
                    <div>Phone: {order.address_snapshot.phone}</div>
                  ) : null}
                  {order.address_snapshot.email ? (
                    <div>Email: {order.address_snapshot.email}</div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-1 text-sm text-muted-foreground">
                  Address not available.
                </div>
              )}
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Order Number</div>
              <div className="font-medium">{order?.order_number || order?.id}</div>

              <div className="text-sm text-muted-foreground mt-3">Status</div>
              <div className="font-medium">{order?.status || '--'}</div>

              <div className="text-sm text-muted-foreground mt-3">Items</div>
              <div className="font-medium">{itemCount}</div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="space-y-4">
            {items.map((it, idx) => {
              const img = storagePublicUrl(it.hero_image_path);
              return (
                <div key={idx} className="flex items-center gap-3">
                  <div className="relative h-16 w-16 bg-muted rounded overflow-hidden">
                    {img ? (
                      <Image src={img} alt={it.name} fill className="object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-2">{it.name}</div>
                    {it.sku ? (
                      <div className="text-xs text-muted-foreground">SKU: {it.sku}</div>
                    ) : null}
                    <div className="text-sm text-muted-foreground">Qty: {it.quantity}</div>
                  </div>

                  <div className="text-right">
                    <div className="font-semibold">
                      {formatINR(it.unit_price, order?.currency)}
                    </div>
                    <div className="text-sm">
                      {formatINR(it.line_total, order?.currency)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Separator className="my-4" />

          <div className="ml-auto max-w-sm space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatINR(order?.subtotal, order?.currency)}</span>
            </div>

            <div className="flex justify-between">
              <span>Shipping</span>
              <span>
                {order?.shipping_fee === 0
                  ? 'FREE'
                  : formatINR(order?.shipping_fee, order?.currency)}
              </span>
            </div>

            {order?.discount_total > 0 ? (
              <div className="flex justify-between text-emerald-600">
                <span>Discount</span>
                <span>-{formatINR(order?.discount_total, order?.currency)}</span>
              </div>
            ) : null}

            <Separator />

            <div className="flex justify-between text-base font-bold">
              <span>Total Paid</span>
              <span>{formatINR(order?.total, order?.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
