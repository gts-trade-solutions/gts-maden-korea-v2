'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle } from 'lucide-react';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/contexts/AuthContext';

type OrderRow = {
  id: string;
  user_id: string | null;
  order_number: string | null;
  status: string | null;
  currency: string | null;
  total: number | null;
  created_at: string | null;
};

function formatMoney(v?: number | null, currency?: string | null) {
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

function SuccessFallback() {
  const t = useTranslations('orderSuccess');
  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-2xl mx-auto text-center">
          <CardHeader>
            <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
            <CardTitle className="text-3xl">{t('title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t('loadingOrder')}</p>
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={<SuccessFallback />}>
      <OrderSuccessInner />
    </Suspense>
  );
}

function OrderSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, isAuthenticated } = useAuth();
  const t = useTranslations('orderSuccess');

  const queryOrderId = searchParams.get('order') || searchParams.get('order_id');

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resolvedOrderId, setResolvedOrderId] = useState<string | null>(queryOrderId);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('payment_success_redirecting');
      }
    } catch {}

    if (queryOrderId) {
      setResolvedOrderId(queryOrderId);
      return;
    }
    try {
      if (typeof window !== 'undefined') {
        const cached = sessionStorage.getItem('last_success_order_id');
        if (cached) setResolvedOrderId(cached);
      }
    } catch {}
  }, [queryOrderId]);

  useEffect(() => {
    if (!ready) return;

    if (!isAuthenticated) {
      const redirectTarget = resolvedOrderId
        ? `/order/success?order=${encodeURIComponent(resolvedOrderId)}`
        : '/order/success';
      router.replace(
        `/auth/login?redirect=${encodeURIComponent(
          redirectTarget
        )}`
      );
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      setInfo(null);

      // Backend-aware: the order comes from the account API routes (server
      // resolves the user from the session under Supabase OR NextAuth). No
      // client-side supabase.auth — that threw "Auth session missing!" post-flip.
      let data: OrderRow | null = null;

      if (resolvedOrderId) {
        try {
          const res = await fetch(`/api/account/orders/${encodeURIComponent(resolvedOrderId)}`, {
            credentials: 'include',
            cache: 'no-store',
          });
          if (res.ok) {
            const j = await res.json();
            data = (j?.order as OrderRow | null) ?? null;
          }
        } catch (e) {
          console.error('[order-success] by-id error:', e);
        }
      }

      if (!data) {
        try {
          const res = await fetch('/api/account/orders', {
            credentials: 'include',
            cache: 'no-store',
          });
          if (res.ok) {
            const j = await res.json();
            const list = (j?.orders ?? []) as OrderRow[];
            data = list[0] ?? null;
            if (data && !resolvedOrderId) setInfo(t('fallbackInfoLatest'));
            else if (!data) setInfo(t('fallbackInfoMyOrders'));
          } else {
            setInfo(t('fallbackInfoMyOrders'));
          }
        } catch (e) {
          console.error('[order-success] latest-order error:', e);
          setInfo(t('fallbackInfoMyOrders'));
        }
      }

      setOrder(data);
      setLoading(false);
    })();
  }, [ready, isAuthenticated, resolvedOrderId, router]);

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-2xl mx-auto text-center">
          <CardHeader>
            <CheckCircle className="h-20 w-20 mx-auto text-green-500 mb-4" />
            <CardTitle className="text-3xl">{t('title')}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {!ready || loading ? (
              <div>
                <p className="text-muted-foreground">{t('loadingOrder')}</p>
              </div>
            ) : error ? (
              <div className="space-y-4">
                <p className="text-red-600 font-medium">{error}</p>

                <div className="flex gap-4 justify-center flex-wrap">
                  <Button asChild variant="outline" size="lg">
                    <Link href="/account/orders">{t('goToMyOrders')}</Link>
                  </Button>
                  <Button asChild size="lg">
                    <Link href="/">{t('continueShopping')}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {order ? (
                  <div>
                    <p className="text-muted-foreground mb-2">{t('orderNumberLabel')}</p>
                    <p className="text-2xl font-bold">
                      {order?.order_number || order?.id}
                    </p>
                  </div>
                ) : null}

                {order ? (
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      {t('placedOn', {
                        date: order?.created_at
                          ? new Date(order.created_at).toLocaleDateString('en-IN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })
                          : '--',
                      })}
                    </p>
                    <p>{t('statusLabel', { status: order?.status || '--' })}</p>
                    <p>{t('totalPaidLabel', { total: formatMoney(order?.total, order?.currency) })}</p>
                  </div>
                ) : null}

                <p className="text-muted-foreground">{t('confirmationEmailBody')}</p>
                {info ? (
                  <p className="text-sm text-muted-foreground">{info}</p>
                ) : null}

                <div className="flex gap-4 justify-center flex-wrap">
                  {order?.id ? (
                    <Button asChild size="lg">
                      <Link href={`/account/orders/${order.id}`}>
                        {t('viewOrderDetails')}
                      </Link>
                    </Button>
                  ) : null}

                  <Button asChild variant="outline" size="lg">
                    <Link href="/account/orders">{t('viewOrders')}</Link>
                  </Button>

                  <Button asChild variant="outline" size="lg">
                    <Link href="/">{t('continueShopping')}</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </CustomerLayout>
  );
}
