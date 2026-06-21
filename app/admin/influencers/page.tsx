'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/contexts/AuthContext";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  LogOut,
  Search,
  Check,
  X,
  Eye,
  RefreshCw,
  Wallet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit3,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SUPPORTED_COUNTRIES,
  COUNTRY_PROFILES,
} from '@/lib/countries';
import { CountryFlag } from '@/components/CountryFlag';

type IRStatus = 'pending' | 'approved' | 'rejected';
type IR = {
  id: string;
  user_id: string;
  handle: string | null;
  note: string | null;
  social?: any;
  status: IRStatus;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'customer' | 'admin';
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  // Email lives on auth.users, fetched via /api/admin/users/lookup
  // and merged into this map after the profiles query resolves.
  email?: string | null;
};

type PayoutRow = {
  id: string;
  influencer_id: string;
  amount: number;
  currency?: string | null;
  status: 'initiated' | 'processing' | 'paid' | 'failed' | 'canceled';
  notes?: string | null;
  covering_orders?: string[] | null;
  created_at: string;
  paid_at?: string | null;
  // Bank/PayPal/Wise reference admin pastes when marking a payout
  // as paid — gives the influencer proof of payment on their dashboard.
  settled_reference?: string | null;
};

export default function AdminInfluencersPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // --- Tab handling ---
  const [tab, setTab] = useState<'requests' | 'payouts'>('requests');

  // === Requests state ===
  const [search, setSearch] = useState('');
  const [filter, setFilter] =
    useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  const [rows, setRows] = useState<IR[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // View modal state
  const [viewing, setViewing] = useState<{
    request: IR;
    profile?: Profile;
  } | null>(null);

  // Cap-settings modal — opens in two modes:
  //   mode='approve' → prompted on the Approve button before the
  //     approve_influencer RPC fires. Carries the request_id.
  //   mode='edit'    → fired from the Edit-cap button on approved rows
  //     so admin can revise the cap later via PATCH /api/admin/influencers/[user_id].
  // Also carries the per-influencer region allow-list (empty = active
  // in all supported countries).
  const [capModal, setCapModal] = useState<{
    mode: 'approve' | 'edit';
    request: IR;          // approved rows still carry the request row
    cap: number;          // initial value (cap %)
    def: number;          // initial value (default user discount %)
    regions: string[];    // initial regions (empty = all)
  } | null>(null);

  // === Payouts state ===
  const [pSearch, setPSearch] = useState('');
  const [pFilter, setPFilter] =
    useState<'all' | 'initiated' | 'processing' | 'paid' | 'failed' | 'canceled'>(
      'initiated'
    );
  const [pLoading, setPLoading] = useState(true);
  const [pRefreshKey, setPRefreshKey] = useState(0);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [influencerMap, setInfluencerMap] = useState<
    Record<string, { name: string; handle?: string | null; email?: string | null }>
  >({});
  const [noteEditing, setNoteEditing] = useState<{ id: string; note: string } | null>(
    null
  );
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // gate: must be admin — backend-aware via the auth context (Supabase OR
  // NextAuth). The old getUser() + is_admin RPC both rely on auth.uid(), null
  // under NextAuth, and were bouncing every admin to login.
  const { isAdmin: ctxIsAdmin, ready: authReady, logout: authLogout } = useAuth();
  useEffect(() => {
    if (!authReady) return;
    // Pass the deep-link path as ?from= so the login screen returns
    // here after sign-in, instead of bouncing to /account.
    const bounceUrl =
      typeof window !== 'undefined'
        ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}`
        : '/admin';
    if (!ctxIsAdmin) {
      router.replace(bounceUrl);
      return;
    }
    setIsAdmin(true);
    setReady(true);
  }, [authReady, ctxIsAdmin, router]);

  // ====== LOAD: Influencer requests ======
  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      setLoading(true);

      // Backend-aware: requests + profiles via the admin API (requireAdmin +
      // service-role). Emails still come from /api/admin/users/lookup.
      let reqs: any[] = [];
      let profileRows: any[] = [];
      try {
        const res = await fetch('/api/admin/influencers/requests', {
          credentials: 'include',
          cache: 'no-store',
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) {
          setLoading(false);
          toast.error(j?.error || 'Failed to load requests');
          return;
        }
        reqs = j.requests ?? [];
        profileRows = j.profiles ?? [];
      } catch (e: any) {
        setLoading(false);
        toast.error(e?.message || 'Failed to load requests');
        return;
      }

      setRows(reqs);

      const ids = Array.from(new Set(reqs.map((r) => r.user_id)));
      if (ids.length) {
        const emailResp = await fetchUserMetaMap(ids);

        const map: Record<string, Profile> = {};
        profileRows.forEach((p: any) => {
          const meta = emailResp[p.id as string];
          map[p.id as string] = {
            ...(p as Profile),
            email: meta?.email ?? null,
          };
        });
        // Some requests may not have a corresponding profiles row yet
        // (rare, but seen on accounts that signed up before the
        // profile trigger existed). Surface them anyway with whatever
        // auth metadata we got.
        ids.forEach((id) => {
          if (!map[id] && emailResp[id]) {
            map[id] = {
              id,
              full_name: emailResp[id].full_name ?? null,
              role: (emailResp[id].role as Profile['role']) ?? 'customer',
              phone: null,
              avatar_url: null,
              created_at: emailResp[id].created_at ?? null,
              email: emailResp[id].email ?? null,
            };
          }
        });
        setProfiles(map);
      } else {
        setProfiles({});
      }

      setLoading(false);
    })();
  }, [ready, isAdmin, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      const p = profiles[r.user_id];
      return (
        (r.handle || '').toLowerCase().includes(q) ||
        (r.note || '').toLowerCase().includes(q) ||
        (p?.full_name || '').toLowerCase().includes(q) ||
        (p?.email || '').toLowerCase().includes(q) ||
        (r.user_id || '').toLowerCase().includes(q)
      );
    });
  }, [rows, profiles, search, filter]);

  const getReqBadge = (s: IRStatus) => {
    switch (s) {
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'pending':
        return (
          <Badge variant="outline" className="text-amber-600">
            Pending
          </Badge>
        );
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  };

  const logout = async () => {
    await authLogout();
    router.replace('/');
  };

  const setStatus = async (row: IR, status: IRStatus) => {
    if (status === 'approved') {
      // Don't fire the RPC directly any more — open the settings
      // modal so admin enters cap %, default customer-discount %, and
      // the applicable-regions list before approval. The modal calls
      // approve_influencer with all four params when admin submits.
      setCapModal({
        mode: 'approve',
        request: row,
        cap: 25,  // sensible starting point — admin can change
        def: 10,
        regions: [], // empty = all supported countries
      });
      return;
    }
    if (status === 'rejected') {
      const res = await fetch('/api/admin/influencers/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject', request_id: row.id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        toast.error(j?.error || 'Failed to reject');
        return;
      }
      toast.success('Marked as rejected');
      // Fire the SES notification best-effort. If it fails we still
      // treat the rejection as complete — the admin can resend via
      // another channel.
      void notifyDecision(row.id, 'rejected');
      setRefreshKey((k) => k + 1);
      return;
    }
  };

  // Best-effort SES notification. Resolves even if the email send
  // fails so the admin flow isn't blocked. Surfaces a non-fatal
  // warning toast so the admin knows when the mail didn't go out.
  const notifyDecision = async (
    requestId: string,
    decision: 'approved' | 'rejected'
  ) => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch('/api/admin/influencers/notify-decision', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ request_id: requestId, decision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        toast.warning(
          `Email not sent: ${body?.error || 'unknown error'}`
        );
      }
    } catch (e: any) {
      toast.warning(`Email not sent: ${e?.message || 'network error'}`);
    }
  };

  // Open the cap-editor modal for an already-approved row. Loads the
  // current cap + default discount from the GET endpoint so the modal
  // pre-fills with what's stored, not stale defaults.
  const openEditCap = async (row: IR) => {
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(`/api/admin/influencers/${encodeURIComponent(row.user_id)}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: 'no-store',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to load influencer');
        return;
      }
      setCapModal({
        mode: 'edit',
        request: row,
        cap: Number(body.influencer?.commission_cap_pct ?? 30),
        def: Number(body.influencer?.default_user_discount_pct ?? 15),
        regions: Array.isArray(body.influencer?.applicable_countries)
          ? (body.influencer.applicable_countries as string[])
          : [],
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load influencer');
    }
  };

  // Submit handler for both modal modes. Approve mode → RPC call.
  // Edit mode → PATCH endpoint. Regions is an array of ISO codes; an
  // empty array means "active in all supported countries" — that's the
  // default and lets us add new countries to the catalogue without
  // re-touching every influencer row.
  const submitCapModal = async (
    cap: number,
    def: number,
    regions: string[]
  ) => {
    if (!capModal) return;
    if (!Number.isInteger(cap) || cap < 5 || cap > 100) {
      toast.error('Cap must be a whole number between 5 and 100.');
      return;
    }
    if (!Number.isInteger(def) || def < 0 || def > cap) {
      toast.error(`Default customer % must be between 0 and ${cap}.`);
      return;
    }

    if (capModal.mode === 'approve') {
      const res = await fetch('/api/admin/influencers/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'approve',
          request_id: capModal.request.id,
          cap,
          def,
          regions,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        toast.error(j?.error || 'Failed to approve');
        return;
      }
      toast.success('Approved and profile created');
      // Notify the new partner — best-effort, won't block the approval.
      void notifyDecision(capModal.request.id, 'approved');
    } else {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/influencers/${encodeURIComponent(capModal.request.user_id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            commission_cap_pct: cap,
            default_user_discount_pct: def,
            applicable_countries: regions,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        toast.error(body.error || 'Failed to update');
        return;
      }
      toast.success('Influencer settings updated');
    }
    setCapModal(null);
    setRefreshKey((k) => k + 1);
  };

  // ====== LOAD: Payouts ======
  useEffect(() => {
    if (!ready || !isAdmin) return;
    (async () => {
      setPLoading(true);
      // Backend-aware: payouts + names via the admin API (requireAdmin +
      // service-role). Emails still come from /api/admin/users/lookup.
      let rows: PayoutRow[] = [];
      let profileRows: any[] = [];
      let inflRows: any[] = [];
      try {
        const res = await fetch('/api/admin/influencers/payouts', {
          credentials: 'include',
          cache: 'no-store',
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.ok) {
          setPLoading(false);
          toast.error(j?.error || 'Failed to load payouts');
          return;
        }
        rows = (j.payouts ?? []) as PayoutRow[];
        profileRows = j.profiles ?? [];
        inflRows = j.influencerProfiles ?? [];
      } catch (e: any) {
        setPLoading(false);
        toast.error(e?.message || 'Failed to load payouts');
        return;
      }
      setPayouts(rows);

      // Hydrate influencer name/handle/email. Names/handles come from the API
      // above; emails from the admin lookup endpoint.
      const ids = Array.from(new Set(rows.map((r) => r.influencer_id)));
      const map: Record<string, { name: string; handle?: string | null; email?: string | null }> = {};
      if (ids.length) {
        const emailResp = await fetchUserMetaMap(ids);
        profileRows.forEach((p: any) => {
          map[p.id] = { name: p.full_name || '—' };
        });
        inflRows.forEach((ip: any) => {
          map[ip.user_id] = { ...(map[ip.user_id] || { name: '—' }), handle: ip.handle };
        });
        ids.forEach((id) => {
          const meta = emailResp[id];
          if (!meta) return;
          map[id] = {
            ...(map[id] || { name: meta.full_name || '—' }),
            email: meta.email ?? null,
          };
        });
      }
      setInfluencerMap(map);
      setPLoading(false);
    })();
  }, [ready, isAdmin, pRefreshKey]);

  const payoutFiltered = useMemo(() => {
    const q = pSearch.trim().toLowerCase();
    return payouts.filter((r) => {
      if (pFilter !== 'all' && r.status !== pFilter) return false;
      if (!q) return true;
      const who = influencerMap[r.influencer_id];
      const inString = `${who?.name || ''} ${who?.handle || ''} ${who?.email || ''} ${r.id} ${
        r.influencer_id
      } ${r.notes || ''}`.toLowerCase();
      return inString.includes(q);
    });
  }, [payouts, pFilter, pSearch, influencerMap]);

  const payoutBadge = (s: PayoutRow['status']) => {
    switch (s) {
      case 'initiated':
        return (
          <Badge className="bg-amber-50 text-amber-700 border border-amber-200">
            Pending
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-sky-50 text-sky-700 border border-sky-200">
            Processing
          </Badge>
        );
      case 'paid':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
            Settled
          </Badge>
        );
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="secondary">{s}</Badge>;
    }
  };

  // --- actions: payout status ---
  // When admin marks a payout 'paid', prompt for the settlement
  // reference (bank txn ID, SWIFT reference, PayPal transaction id,
  // Wise transfer id, etc.). Stored on the row so the influencer
  // sees proof of payment on their dashboard. Optional — admin can
  // skip if not yet known and add it later via the note editor.
  async function setPayoutStatus(row: PayoutRow, status: PayoutRow['status']) {
    try {
      setUpdatingId(row.id);
      const patch: any = { status };
      if (status === 'paid') {
        patch.paid_at = new Date().toISOString();
        const ref = window.prompt(
          'Settlement reference (UTR / SWIFT / PayPal txn id) — optional:',
          row.settled_reference || ''
        );
        // null = cancel button → abort the whole update.
        if (ref === null) {
          setUpdatingId(null);
          return;
        }
        const trimmed = ref.trim();
        if (trimmed) patch.settled_reference = trimmed;
      }
      if (status !== 'paid') patch.paid_at = null;

      const res = await fetch(`/api/admin/influencers/payouts/${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Failed to update payout');
      toast.success(`Payout marked as ${status}`);
      setPRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update payout');
    } finally {
      setUpdatingId(null);
    }
  }

  async function savePayoutNote(id: string, note: string) {
    try {
      setUpdatingId(id);
      const res = await fetch(`/api/admin/influencers/payouts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ notes: note }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || 'Failed to save note');
      toast.success('Note saved');
      setNoteEditing(null);
      setPRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save note');
    } finally {
      setUpdatingId(null);
    }
  }

  if (!ready || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Influencer Management</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant={tab === 'requests' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTab('requests');
                setViewing(null);
              }}
            >
              Requests
            </Button>
            <Button
              variant={tab === 'payouts' ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setTab('payouts');
                setViewing(null);
              }}
            >
              Payouts
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (tab === 'requests') setRefreshKey((k) => k + 1);
                else setPRefreshKey((k) => k + 1);
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        {/* ===================== TAB: REQUESTS ===================== */}
        {tab === 'requests' && (
          <Card>
            <CardHeader>
              <CardTitle>Influencer requests</CardTitle>
              <CardDescription>
                Review applications and manage approved creators
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Controls */}
              <div className="mb-4 flex flex-col md:flex-row gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search handle, name, email, note, user id…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={filter === 'pending' ? 'default' : 'outline'}
                    onClick={() => setFilter('pending')}
                  >
                    Pending
                  </Button>
                  <Button
                    variant={filter === 'approved' ? 'default' : 'outline'}
                    onClick={() => setFilter('approved')}
                  >
                    Approved
                  </Button>
                  <Button
                    variant={filter === 'rejected' ? 'default' : 'outline'}
                    onClick={() => setFilter('rejected')}
                  >
                    Rejected
                  </Button>
                  <Button
                    variant={filter === 'all' ? 'default' : 'outline'}
                    onClick={() => setFilter('all')}
                  >
                    All
                  </Button>
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Handle</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="min-w-[220px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-10 text-center text-muted-foreground"
                        >
                          {loading ? 'Loading…' : 'No requests found'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((r) => {
                        const p = profiles[r.user_id];
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              <div>{p?.full_name || '—'}</div>
                              <div className="text-xs text-muted-foreground break-all">
                                {p?.email || (
                                  <span>
                                    {r.user_id.slice(0, 8)}…{r.user_id.slice(-4)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>{r.handle || '—'}</div>
                              {r.note && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {r.note}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              {new Date(r.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell>{getReqBadge(r.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setViewing({
                                      request: r,
                                      profile: profiles[r.user_id],
                                    })
                                  }
                                >
                                  <Eye className="h-4 w-4 mr-1" /> View
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={r.status === 'approved'}
                                  onClick={() => setStatus(r, 'approved')}
                                >
                                  <Check className="h-4 w-4 mr-1" /> Approve
                                </Button>
                                {r.status === 'approved' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openEditCap(r)}
                                  >
                                    <Edit3 className="h-4 w-4 mr-1" /> Edit cap
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={r.status === 'rejected'}
                                  onClick={() => setStatus(r, 'rejected')}
                                >
                                  <X className="h-4 w-4 mr-1" /> Reject
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===================== TAB: PAYOUTS ===================== */}
        {tab === 'payouts' && (
          <Card>
            <CardHeader>
              <CardTitle>Payout requests</CardTitle>
              <CardDescription>
                Approve and settle influencer withdrawals
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Controls */}
              <div className="mb-4 flex flex-col md:flex-row gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, handle, email, payout id, user id, note…"
                    value={pSearch}
                    onChange={(e) => setPSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    ['initiated', 'processing', 'paid', 'failed', 'canceled', 'all'] as const
                  ).map((s) => (
                    <Button
                      key={s}
                      variant={pFilter === s ? 'default' : 'outline'}
                      onClick={() => setPFilter(s)}
                      className="capitalize"
                    >
                      {s === 'initiated' ? 'Pending' : s}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Influencer</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead className="min-w-[320px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pLoading ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : payoutFiltered.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-10 text-center text-muted-foreground"
                        >
                          No items
                        </TableCell>
                      </TableRow>
                    ) : (
                      payoutFiltered.map((r) => {
                        const who = influencerMap[r.influencer_id];
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div>{who?.name || '—'}</div>
                                  <div className="text-xs text-muted-foreground break-all">
                                    @{who?.handle || '—'}
                                    {who?.email ? ` • ${who.email}` : ''}
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="font-semibold">
                                {toINR(r.amount, r.currency)}
                              </div>
                              {r.covering_orders && r.covering_orders.length > 0 && (
                                <div className="text-[11px] text-muted-foreground">
                                  orders: {r.covering_orders.length}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div>{new Date(r.created_at).toLocaleString()}</div>
                              {r.status === 'paid' && r.paid_at && (
                                <div className="text-xs text-emerald-700">
                                  Paid {new Date(r.paid_at).toLocaleString()}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{payoutBadge(r.status)}</TableCell>
                            <TableCell className="max-w-[280px]">
                              {noteEditing?.id === r.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={noteEditing.note}
                                    onChange={(e) =>
                                      setNoteEditing({ id: r.id, note: e.target.value })
                                    }
                                    placeholder="Internal note / reference"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => savePayoutNote(r.id, noteEditing.note)}
                                    disabled={updatingId === r.id}
                                  >
                                    {updatingId === r.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setNoteEditing(null)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="truncate text-sm">
                                    {r.notes || (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </div>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() =>
                                      setNoteEditing({ id: r.id, note: r.notes || '' })
                                    }
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    updatingId === r.id ||
                                    r.status === 'processing' ||
                                    r.status === 'paid'
                                  }
                                  onClick={() => setPayoutStatus(r, 'processing')}
                                >
                                  {updatingId === r.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <AlertCircle className="mr-2 h-4 w-4" />
                                  )}{' '}
                                  Processing
                                </Button>
                                <Button
                                  size="sm"
                                  variant="default"
                                  disabled={updatingId === r.id || r.status === 'paid'}
                                  onClick={() => setPayoutStatus(r, 'paid')}
                                >
                                  {updatingId === r.id ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                  )}{' '}
                                  Mark paid
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={updatingId === r.id || r.status === 'paid'}
                                  onClick={() => setPayoutStatus(r, 'failed')}
                                >
                                  <X className="mr-2 h-4 w-4" /> Fail
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ===================== VIEW MODAL ===================== */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="relative w-full max-w-md rounded-lg border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-semibold">
                    {viewing.profile?.full_name ||
                      viewing.request.handle ||
                      'Unknown user'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {viewing.request.user_id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getReqBadge(viewing.request.status)}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setViewing(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="px-4 py-3 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Full name</p>
                  <p className="font-medium">
                    {viewing.profile?.full_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Role</p>
                  <p className="font-medium">
                    {viewing.profile?.role || '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="font-medium break-all">
                  {viewing.profile?.email || '—'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Phone</p>
                  <p className="font-medium">
                    {viewing.profile?.phone || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Profile created
                  </p>
                  <p className="font-medium">
                    {viewing.profile?.created_at
                      ? new Date(viewing.profile.created_at).toLocaleString()
                      : '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Handle</p>
                <p className="font-medium">{viewing.request.handle || '—'}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Note</p>
                <p className="whitespace-pre-wrap">
                  {viewing.request.note || '—'}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Request created
                </p>
                <p className="font-medium">
                  {new Date(viewing.request.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cap-settings modal (approve OR edit existing) */}
      {capModal && (
        <CapSettingsModal
          mode={capModal.mode}
          initialCap={capModal.cap}
          initialDefault={capModal.def}
          initialRegions={capModal.regions}
          handle={capModal.request.handle}
          onClose={() => setCapModal(null)}
          onSubmit={submitCapModal}
        />
      )}
    </div>
  );
}

/* ---------- Cap-settings modal ---------- */
function CapSettingsModal({
  mode,
  initialCap,
  initialDefault,
  initialRegions,
  handle,
  onClose,
  onSubmit,
}: {
  mode: 'approve' | 'edit';
  initialCap: number;
  initialDefault: number;
  initialRegions: string[];
  handle: string | null;
  onClose: () => void;
  onSubmit: (cap: number, def: number, regions: string[]) => void | Promise<void>;
}) {
  // SUPPORTED_COUNTRIES is the 15-code master list (incl. India).
  // Empty selection = applies in all countries — that's the cleanest
  // convention because it requires zero maintenance when we add a new
  // country to the catalogue.
  const [cap, setCap] = useState<number>(initialCap);
  const [def, setDef] = useState<number>(initialDefault);
  const [regions, setRegions] = useState<string[]>(initialRegions);
  const [busy, setBusy] = useState(false);

  // Influencer-share is the auto-computed remainder. The form only
  // collects the customer share + the cap because the influencer
  // share is fully determined by (cap - customer).
  const influencerShare = Math.max(0, cap - def);

  const toggleCountry = (code: string) => {
    setRegions((rs) =>
      rs.includes(code) ? rs.filter((c) => c !== code) : [...rs, code]
    );
  };
  const clearAllRegions = () => setRegions([]);
  const selectAllRegions = () => setRegions([...SUPPORTED_COUNTRIES]);

  const handleSubmit = async () => {
    setBusy(true);
    try {
      await onSubmit(cap, def, regions);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3">
          <h3 className="text-lg font-semibold">
            {mode === 'approve' ? 'Approve' : 'Edit settings for'}{' '}
            {handle ? `@${handle}` : 'influencer'}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === 'approve'
              ? 'Set the commission cap, the default customer-discount, and the regions this influencer\'s promos apply in. They can pick any split that sums to ≤ cap when creating promos.'
              : 'Adjust this influencer\'s cap, default split, or applicable regions. Existing promos keep their original cap; only new promos use the updated values.'}
          </p>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-medium mb-1">
              Commission cap (%) — total of customer + influencer share
            </label>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={cap}
              onChange={(e) => {
                const v = Math.floor(Number(e.target.value));
                if (!Number.isFinite(v)) return;
                setCap(v);
                // If new cap is below current default, clamp the default
                // down so the constraint always holds.
                if (def > v) setDef(v);
              }}
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Whole percent only. Min 5, max 100.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Default customer discount (%) — pre-fills the influencer&apos;s &quot;Recommended&quot; button
            </label>
            <input
              type="number"
              min={0}
              max={cap}
              step={1}
              value={def}
              onChange={(e) => {
                const v = Math.floor(Number(e.target.value));
                if (!Number.isFinite(v)) return;
                setDef(Math.max(0, Math.min(cap, v)));
              }}
              className="w-full rounded-lg border px-3 py-2"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Must be between 0 and the cap ({cap}%). Influencer will receive {influencerShare}% by default.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
            <div className="font-medium mb-0.5">Default split preview</div>
            Customer {def}% + Influencer {influencerShare}% = {cap}% cap
          </div>

          {/* Applicable regions — empty selection = active in every
              supported country (sensible default). Non-empty = the
              promo only applies for buyers whose mik_country is in the
              picked set. India is included in the list so the admin
              can opt influencers in or out of the domestic market too. */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium">
                Applicable regions
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllRegions}
                  className="text-muted-foreground underline-offset-2 hover:underline"
                >
                  Select all
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={clearAllRegions}
                  className="text-muted-foreground underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              {regions.length === 0
                ? 'Empty selection = promos work in all supported countries (default).'
                : `Promos will only apply for buyers in the ${regions.length} country${regions.length === 1 ? '' : 's'} below.`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUPPORTED_COUNTRIES.map((code) => {
                const profile = COUNTRY_PROFILES[code];
                const selected = regions.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleCountry(code)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    <CountryFlag code={code} />
                    <span>{profile.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Check className="h-4 w-4 mr-1" />
            )}
            {mode === 'approve' ? 'Approve' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */

// Bulk-fetch auth.users metadata (email, role, full_name) for a set
// of user ids via the admin-only lookup endpoint. Service-role is
// required to read auth.users, so this can't be done with the
// browser anon client. Returns an empty map on any error — callers
// fall back to whatever profile data they already have.
type UserMeta = {
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at: string | null;
};
async function fetchUserMetaMap(ids: string[]): Promise<Record<string, UserMeta>> {
  if (ids.length === 0) return {};
  try {
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;
    const res = await fetch(
      `/api/admin/users/lookup?ids=${encodeURIComponent(ids.join(','))}`,
      {
        credentials: 'include',
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok === false) return {};
    return (body.users ?? {}) as Record<string, UserMeta>;
  } catch {
    return {};
  }
}

function toINR(n: number, currency?: string | null) {
  const code = (currency || 'INR').toUpperCase();
  try {
    return n.toLocaleString('en-IN', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    });
  } catch {
    return `${code === 'INR' ? '₹' : code + ' '}${Math.round(n)}`;
  }
}
