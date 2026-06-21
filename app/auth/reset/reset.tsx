'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CustomerLayout } from '@/components/CustomerLayout';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

// ---- Strength helpers (no external libs) ----
type Strength = { score: 0|1|2|3|4; label: string; tips: string[] };

function hasUpper(s: string) { return /[A-Z]/.test(s); }
function hasNumber(s: string) { return /\d/.test(s); }
function hasSymbol(s: string) { return /[^A-Za-z0-9\s]/.test(s); }
function hasSequence(s: string) { return /(0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|defg|qwer|asdf|zxcv)/i.test(s); }
function hasRepeat(s: string) { return /(.)\1{2,}/.test(s); }

type StrengthTipId =
  | 'tipLonger'
  | 'tipUppercase'
  | 'tipNumber'
  | 'tipSymbol'
  | 'tipNoSequence'
  | 'tipNoRepeat';

type Strength2 = { score: 0|1|2|3|4; labelKey: string; tips: StrengthTipId[] };

const STRENGTH_LABEL_KEYS = [
  'strengthTooWeak',
  'strengthWeak',
  'strengthOkay',
  'strengthStrong',
  'strengthVeryStrong',
] as const;

function scorePassword(pw: string): Strength2 {
  const tips: StrengthTipId[] = [];
  if (!pw) return { score: 0, labelKey: STRENGTH_LABEL_KEYS[0], tips: ['tipLonger'] };

  let score = 0;

  if (pw.length >= 15) score += 3;
  else if (pw.length >= 11) score += 2;
  else if (pw.length >= 8) score += 1;

  const varieties = [/[a-z]/.test(pw), hasUpper(pw), hasNumber(pw), hasSymbol(pw)].filter(Boolean).length;
  score += Math.max(0, varieties - 1);

  if (hasSequence(pw)) score -= 1;
  if (hasRepeat(pw)) score -= 1;

  score = Math.max(0, Math.min(4, score));

  if (pw.length < 12) tips.push('tipLonger');
  if (!hasUpper(pw)) tips.push('tipUppercase');
  if (!hasNumber(pw)) tips.push('tipNumber');
  if (!hasSymbol(pw)) tips.push('tipSymbol');
  if (hasSequence(pw)) tips.push('tipNoSequence');
  if (hasRepeat(pw)) tips.push('tipNoRepeat');

  return { score: score as 0|1|2|3|4, labelKey: STRENGTH_LABEL_KEYS[score], tips };
}

function segClass(active: boolean, idx: number, score: number) {
  if (!active) return 'bg-muted';
  return [
    'bg-red-500',
    score >= 2 ? 'bg-orange-500' : 'bg-red-500',
    score >= 3 ? 'bg-yellow-500' : 'bg-orange-500',
    score >= 4 ? 'bg-emerald-500' : 'bg-yellow-500',
  ][idx];
}

export default function ResetPasswordPage() {
  const sp = useSearchParams();
  const t = useTranslations('auth.reset');
  const tSignUp = useTranslations('auth.signUp');
  const tSignIn = useTranslations('auth.signIn');
  const token = (sp.get('token') || '').trim();

  const [checking, setChecking] = useState(true);
  const [canReset, setCanReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const peekPwTimeout = useRef<number | null>(null);
  const peekConfirmTimeout = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!token) {
        if (!cancelled) {
          setCanReset(false);
          setChecking(false);
        }
        return;
      }

      const res = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (cancelled) return;
      setCanReset(!!data?.valid);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const strength = useMemo(() => scorePassword(password), [password]);
  const meetsMin = password.length >= 8;
  const hasU = hasUpper(password);
  const hasN = hasNumber(password);
  const hasS = hasSymbol(password);
  const match = !!password && password === confirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetsMin || !hasU || !hasN || !hasS) {
      toast.error(t('errWeak'));
      return;
    }
    if (!match) {
      toast.error(t('errMismatch'));
      return;
    }

    setSubmitting(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (!res.ok || !data?.ok) {
      toast.error(data?.error || t('errGeneric'));
      return;
    }

    toast.success(t('successToast'));
    setDone(true);
  };

  const holdToPeek = (which: 'pw' | 'confirm', down: boolean) => {
    const setFn = which === 'pw' ? setShowPw : setShowConfirm;
    const timeoutRef = which === 'pw' ? peekPwTimeout : peekConfirmTimeout;

    if (down) {
      setFn(true);
      const id = window.setTimeout(() => setFn(false), 2000);
      if (which === 'pw') peekPwTimeout.current = id;
      else peekConfirmTimeout.current = id;
    } else {
      setFn(false);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    }
  };

  if (checking) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader><CardTitle>{t('title')}</CardTitle></CardHeader>
            <CardContent><p className="text-muted-foreground">{t('verifyingLink')}</p></CardContent>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  if (!canReset) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>{t('linkExpiredTitle')}</CardTitle>
              <CardDescription>{t('linkExpiredBody')}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href="/auth/forgot" className="text-primary hover:underline">{t('sendNewLink')}</Link>
            </CardFooter>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  if (done) {
    return (
      <CustomerLayout>
        <div className="container mx-auto py-16">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle>{t('passwordUpdatedTitle')}</CardTitle>
              <CardDescription>{t('passwordUpdatedBody')}</CardDescription>
            </CardHeader>
            <CardFooter>
              <Button asChild className="w-full">
                <Link href="/auth/login">{t('goToSignIn')}</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout>
      <div className="container mx-auto py-16">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">{t('titleNew')}</CardTitle>
            <CardDescription>{t('descriptionNew')}</CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">{t('newPasswordLabel')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowPw(v => !v)}
                    onMouseDown={() => holdToPeek('pw', true)}
                    onMouseUp={() => holdToPeek('pw', false)}
                    onMouseLeave={() => holdToPeek('pw', false)}
                    onTouchStart={() => holdToPeek('pw', true)}
                    onTouchEnd={() => holdToPeek('pw', false)}
                    aria-label={showPw ? tSignIn('hidePassword') : tSignIn('showPassword')}
                    title={t('holdPeekTooltip')}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                <div className="mt-2">
                  <div className="flex gap-1 h-2">
                    {[0,1,2,3].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded ${segClass(i <= strength.score-1, i, strength.score)}`}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="font-medium">{tSignUp(strength.labelKey)}</span>
                    <span className="text-muted-foreground">{tSignUp('charsCount', { count: password.length })}</span>
                  </div>

                  <ul className="mt-2 space-y-1 text-xs">
                    <li className="flex items-center gap-1">
                      {meetsMin ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      {tSignUp('requireMinLength')}
                    </li>
                    <li className="flex items-center gap-1">
                      {hasU ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      {tSignUp('requireUppercase')}
                    </li>
                    <li className="flex items-center gap-1">
                      {hasN ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      {tSignUp('requireNumber')}
                    </li>
                    <li className="flex items-center gap-1">
                      {hasS ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      {tSignUp('requireSymbol')}
                    </li>
                  </ul>

                  {strength.score < 3 && strength.tips.length > 0 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {tSignUp('tipsPrefix')} {strength.tips.slice(0,3).map((id) => tSignUp(id)).join(' • ')}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">{t('confirmPasswordLabel')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setShowConfirm(v => !v)}
                    onMouseDown={() => holdToPeek('confirm', true)}
                    onMouseUp={() => holdToPeek('confirm', false)}
                    onMouseLeave={() => holdToPeek('confirm', false)}
                    onTouchStart={() => holdToPeek('confirm', true)}
                    onTouchEnd={() => holdToPeek('confirm', false)}
                    aria-label={showConfirm ? tSignIn('hidePassword') : tSignIn('showPassword')}
                    title={t('holdPeekTooltip')}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {confirm.length > 0 && (
                  <p className={`text-xs mt-1 ${match ? 'text-emerald-600' : 'text-destructive'}`}>
                    {match ? tSignUp('passwordsMatch') : tSignUp('passwordsDoNotMatch')}
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t('submitting') : t('submit')}
              </Button>
              <p className="text-sm text-center text-muted-foreground">
                {t('rememberedItPrefix')}{' '}
                <Link href="/auth/login" className="text-primary hover:underline">{t('signInLink')}</Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </CustomerLayout>
  );
}
