'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const sendReset = async () => {
    if (!email.trim()) {
      toast.error(t('missingEmailToast'));
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok) {
      toast.error(t('couldNotProcess'));
      setStatus({ type: 'error', message: t('couldNotSend') });
      return;
    }

    if (data?.deliveryStatus === 'failed' || data?.success === false) {
      const msg = data?.message || t('couldNotSend');
      toast.error(msg);
      setStatus({ type: 'error', message: msg });
      setSent(false);
      return;
    }

    const msg = data?.message || t('successGeneric');
    toast.success(msg);
    setStatus({ type: 'success', message: msg });
    setSent(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendReset();
  };

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">{t('title')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>

          <form onSubmit={onSubmit}>
            {!sent ? (
              <>
                <CardContent className="space-y-4">
                  {status && (
                    <div
                      className={`rounded-md border px-3 py-3 text-sm ${
                        status.type === 'error'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {status.message}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('emailLabel')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? t('submitting') : t('submit')}
                  </Button>
                  <p className="text-sm text-center text-muted-foreground">
                    {t('rememberedItPrefix')}{' '}
                    <Link href="/auth/login" className="text-primary hover:underline">
                      {t('signInLink')}
                    </Link>
                  </p>
                </CardFooter>
              </>
            ) : (
              <>
                <CardContent className="space-y-4">
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
                    <p className="font-medium">{status?.message || t('successGeneric')}</p>
                    <p className="mt-1">{t('didntReceive')}</p>
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="button" className="w-full" disabled={submitting} onClick={sendReset}>
                    {submitting ? t('submitting') : t('resend')}
                  </Button>
                  <p className="text-sm text-center text-muted-foreground">
                    {t('backToSignInPrefix')}{' '}
                    <Link href="/auth/login" className="text-primary hover:underline">
                      {t('signInLink')}
                    </Link>
                  </p>
                </CardFooter>
              </>
            )}
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
