'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useCart } from '@/lib/contexts/CartContext';
import { resolveMediaUrl } from '@/lib/storage/backend';
import { toast } from 'sonner';

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

function storagePublicUrl(path?: string | null) {
  if (!path) return null;
  return resolveMediaUrl('product-media', path) ?? null;
}

function statusVariant(s?: string) {
  return s === 'delivered'
    ? 'default'
    : s === 'shipped'
      ? 'secondary'
      : s === 'processing' || s === 'paid' || s === 'pending_payment'
        ? 'outline'
        : 'outline';
}

export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const router = useRouter();
  const { ready, isAuthenticated } = useAuth();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payment, setPayment] = useState<any | null>(null);

  const [shipment, setShipment] = useState<any | null>(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackData, setTrackData] = useState<any | null>(null);

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      router.replace(`/auth/login?redirect=/account/orders/${orderId}`);
      return;
    }

    (async () => {
      setLoading(true);
      // Order detail now comes from the server route (MySQL behind the flag,
      // Supabase fallback). Identity + ownership are enforced server-side.
      try {
        const res = await fetch(`/api/account/orders/${orderId}`);
        if (res.status === 401) {
          router.replace(`/auth/login?redirect=/account/orders/${orderId}`);
          return;
        }
        const json = await res.json().catch(() => ({} as any));
        if (res.status === 404 || !json?.order) {
          toast.error('Order not found');
          return;
        }
        if (!res.ok) {
          toast.error(json?.error || 'Unable to load order');
          return;
        }
        setOrder(json.order);
        setItems(json.items ?? []);
        setShipment(json.shipment ?? null);
        setPayment(json.payment ?? null);
      } catch {
        toast.error('Unable to load order');
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, isAuthenticated, orderId, router]);

  const itemCount = useMemo(
    () => items.reduce((n, i) => n + (i.quantity || 1), 0),
    [items]
  );
  const paymentRef =
    order?.payment_reference ||
    payment?.reference ||
    payment?.razorpay_payment_id ||
    payment?.payment_reference ||
    null;

  const fetchTracking = async () => {
    if (!shipment?.reference_number) {
      toast.message('Tracking will be available once your shipment is booked.');
      return;
    }

    try {
      setTrackLoading(true);
      const res = await fetch(`/api/dtdc/track?order_id=${orderId}`, {
        cache: 'no-store',
      });
      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) {
        toast.error(j?.error || 'Tracking not available yet');
        return;
      }

      setTrackData(j);
    } catch (e: any) {
      toast.error(e?.message || 'Tracking failed');
    } finally {
      setTrackLoading(false);
    }
  };

  if (!ready) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16 text-muted-foreground">
          Loading order…
        </div>
      </CustomerLayout>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <CustomerLayout>
      <div className="container mx-auto py-8">
        {loading ? (
          <div className="text-muted-foreground">Loading order…</div>
        ) : !order ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Order not found</h1>
            <Button asChild>
              <Link href="/account/orders">Back to Orders</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold">Order {order?.order_number}</h1>
                <p className="text-muted-foreground">
                  Placed on{' '}
                  {order?.created_at
                    ? new Date(order.created_at).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : '--'}
                </p>
              </div>
              <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
            </div>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Items</span>
                  <span>{itemCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold">
                    {formatINR(order?.subtotal, order?.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping</span>
                  <span className="font-semibold">
                    {order?.shipping_fee === 0
                      ? 'FREE'
                      : formatINR(order?.shipping_fee, order?.currency)}
                  </span>
                </div>
                {order?.discount_total > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount</span>
                    <span className="font-semibold">
                      -{formatINR(order?.discount_total, order?.currency)}
                    </span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total</span>
                  <span>{formatINR(order?.total, order?.currency)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Payment Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Method: </span>
                  <span className="font-medium">{payment?.method || 'Razorpay'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium">{payment?.status || order?.status || '--'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Reference: </span>
                  <span className="font-medium break-all">{paymentRef || '--'}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {order?.address_snapshot ? (
                  <div className="space-y-0.5">
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
                  <div className="text-muted-foreground">No address available.</div>
                )}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Shipment Tracking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!shipment ? (
                  <p className="text-sm text-muted-foreground">
                    Tracking will appear here once your shipment is booked.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">
                          Reference Number
                        </div>
                        <div className="font-medium">{shipment.reference_number}</div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Shipment Status</div>
                        <div className="font-medium">{shipment.status || '--'}</div>
                      </div>

                      <div className="flex gap-2">
                        <Button onClick={fetchTracking} disabled={trackLoading}>
                          {trackLoading ? 'Loading...' : 'Track Shipment'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setTrackData(null);
                            fetchTracking();
                          }}
                          disabled={trackLoading}
                        >
                          Reload
                        </Button>
                      </div>
                    </div>

                    {trackData?.events?.length ? (
                      <div className="space-y-3 pt-2">
                        {trackData.events.map((ev: any, idx: number) => (
                          <div key={idx} className="rounded-md border p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="font-medium">{ev.action || 'Update'}</div>
                              <div className="text-xs text-muted-foreground">
                                {ev.event_at
                                  ? new Date(ev.event_at).toLocaleString('en-IN')
                                  : ''}
                              </div>
                            </div>
                            {ev.origin || ev.destination ? (
                              <div className="text-sm text-muted-foreground">
                                {ev.origin ? `From: ${ev.origin}` : ''}
                                {ev.origin && ev.destination ? ' · ' : ''}
                                {ev.destination ? `To: ${ev.destination}` : ''}
                              </div>
                            ) : null}
                            {ev.remarks ? (
                              <div className="text-sm mt-1">{ev.remarks}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {trackData
                          ? 'No tracking events yet. Please check again later.'
                          : 'Click “Track Shipment” to load updates.'}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                        <div className="text-sm text-muted-foreground">Qty: {it.quantity}</div>
                        {it.sku ? (
                          <div className="text-xs text-muted-foreground">SKU: {it.sku}</div>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">
                          {formatINR(it.unit_price, order?.currency)}
                        </div>
                        <div className="text-sm">
                          × {it.quantity} ={' '}
                          <span className="font-medium">
                            {formatINR(it.line_total, order?.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-3 items-center">
              <Button
                variant="outline"
                onClick={() => router.push(`/account/orders/${orderId}/invoice`)}
              >
                View / Download Invoice
              </Button>

              {items.some((i) => !!i.product_id) && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    for (const it of items) {
                      if (it.product_id) {
                        await addItem(it.product_id, it.quantity || 1);
                      }
                    }
                    toast.success('Items added to cart');
                    router.push('/cart');
                  }}
                >
                  Reorder
                </Button>
              )}

              <Button variant="outline" onClick={() => router.push('/account/orders')}>
                Back to Orders
              </Button>
            </div>
          </>
        )}
      </div>
    </CustomerLayout>
  );
}
