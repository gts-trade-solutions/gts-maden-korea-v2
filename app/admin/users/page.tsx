"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/contexts/AuthContext";
import { supabase } from "@/lib/supabaseClient";
import { AdminBackBar } from "@/components/admin/AdminBackBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  ShieldCheck,
  ShieldOff,
  Lock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MailCheck,
  MailWarning,
  MailX,
  MoreHorizontal,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  CheckCheck,
  Trash2,
} from "lucide-react";
import { COUNTRY_PROFILES, type CountryCode } from "@/lib/countries";
import { CountryFlag } from "@/components/CountryFlag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";

type SortKey =
  | "newest"
  | "oldest"
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "recent_activity";

type Filters = {
  joinedFrom: string;
  joinedTo: string;
  role: "" | "customer" | "admin" | "super_admin";
  verification: "" | "verified" | "unverified" | "locked";
  country: string;
};

const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name_asc: "Name A → Z",
  name_desc: "Name Z → A",
  email_asc: "Email A → Z",
  email_desc: "Email Z → A",
  recent_activity: "Recently active",
};

// Date range presets (UTC dates so the comparisons match the DB).
function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const DATE_PRESETS: Array<{ key: string; label: string; compute: () => { from: string; to: string } | null }> = [
  { key: "any", label: "Any time", compute: () => null },
  {
    key: "today",
    label: "Today",
    compute: () => {
      const t = dateOnly(new Date());
      return { from: t, to: t };
    },
  },
  {
    key: "7d",
    label: "Last 7 days",
    compute: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 6 * 86400000);
      return { from: dateOnly(from), to: dateOnly(to) };
    },
  },
  {
    key: "30d",
    label: "Last 30 days",
    compute: () => {
      const to = new Date();
      const from = new Date(to.getTime() - 29 * 86400000);
      return { from: dateOnly(from), to: dateOnly(to) };
    },
  },
  {
    key: "this_month",
    label: "This month",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: dateOnly(from), to: dateOnly(now) };
    },
  },
  {
    key: "last_month",
    label: "Last month",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: dateOnly(from), to: dateOnly(to) };
    },
  },
  {
    key: "this_year",
    label: "This year",
    compute: () => {
      const now = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: dateOnly(from), to: dateOnly(now) };
    },
  },
  { key: "custom", label: "Custom range…", compute: () => null },
];

// Admin Users page.
// Lists every account (paginated, search by email/name/phone) and lets
// an admin promote a customer to `admin` or revoke admin from another
// admin. Super admins show up with a locked badge and no toggle.
//
// All safety rails (self-demote, last-admin guard, super-admin immune)
// live in /api/admin/users/[user_id]. The UI mirrors them so the wrong
// buttons never even render — but the server is the source of truth.

const PAGE_LIMIT = 50;

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  preferred_country: string | null;
  role: "customer" | "admin" | "super_admin";
  last_sign_in_at: string | null;
  created_at: string | null;
  email_verified_at: string | null;
  email_verification_grace_starts_at: string | null;
  email_verification_deadline_override: string | null;
};

type EmailChangeRequest = {
  id: string;
  user_id: string;
  current_email: string;
  requested_email: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  reason: string | null;
  admin_note: string | null;
  requested_at: string;
  processed_at: string | null;
  requester_name: string | null;
};

type UsersResponse = {
  ok: boolean;
  total: number;
  page: number;
  limit: number;
  users: UserRow[];
  current_user_id: string;
  error?: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function roleBadge(role: UserRow["role"]) {
  if (role === "super_admin") {
    return (
      <Badge className="bg-purple-100 text-purple-800 border border-purple-300">
        <Lock className="h-3 w-3 mr-1" /> SUPER ADMIN
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300">
        <ShieldCheck className="h-3 w-3 mr-1" /> Admin
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Customer
    </Badge>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { hasRole, ready } = useAuth();

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{
    row: UserRow;
    nextRole: "customer" | "admin";
  } | null>(null);

  // Filter / sort state.
  const [sort, setSort] = useState<SortKey>("newest");
  const [filters, setFilters] = useState<Filters>({
    joinedFrom: "",
    joinedTo: "",
    role: "",
    verification: "",
    country: "",
  });
  const [datePreset, setDatePreset] = useState<string>("any");

  // Email-change-request review state.
  const [emailRequests, setEmailRequests] = useState<EmailChangeRequest[]>([]);
  const [emailRequestsLoading, setEmailRequestsLoading] = useState(true);
  const [reviewingRequest, setReviewingRequest] =
    useState<EmailChangeRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  // Verification per-row state.
  const [extendDialog, setExtendDialog] = useState<UserRow | null>(null);
  const [extendDays, setExtendDays] = useState(7);
  const [verifyBusy, setVerifyBusy] = useState<string | null>(null);

  // Hard-delete user state.
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEmailRequests = async () => {
    setEmailRequestsLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/email-change-requests?status=pending`,
        {
          credentials: "include",
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
          cache: "no-store",
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setEmailRequests((body.rows as EmailChangeRequest[]) ?? []);
      }
    } finally {
      setEmailRequestsLoading(false);
    }
  };

  const callUserVerification = async (
    userId: string,
    payload: Record<string, unknown>,
    successMsg: string
  ) => {
    setVerifyBusy(userId);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(userId)}/verification`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        toast.error(body?.message || body?.error || "Action failed.");
        return;
      }
      if (body?.alreadyVerified) {
        toast.info("User is already verified.");
      } else {
        toast.success(successMsg);
      }
      await fetchPage(q, page);
    } finally {
      setVerifyBusy(null);
    }
  };

  const performDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeletingId(target.id);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/users/${encodeURIComponent(target.id)}`,
        {
          method: "DELETE",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ confirmEmail: deleteConfirmEmail }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        const code = body?.code || body?.error;
        const messages: Record<string, string> = {
          CANNOT_DELETE_SELF: "You can't delete your own account.",
          CANNOT_DELETE_STAFF:
            "Demote the admin to customer first, then delete.",
          CANNOT_DELETE_VENDOR:
            "This account is a vendor. Remove the vendor record first.",
          MISSING_CONFIRMATION: "Type the email to confirm.",
          EMAIL_MISMATCH:
            "The confirmation email doesn't match this account.",
        };
        toast.error(
          messages[code] || body?.message || body?.error || "Delete failed."
        );
        return;
      }
      toast.success(`Deleted ${target.email ?? target.full_name ?? "user"}.`);
      setDeleting(null);
      setDeleteConfirmEmail("");
      await fetchPage(q, page);
    } catch (e: any) {
      toast.error(e?.message || "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  };

  const submitReview = async () => {
    if (!reviewingRequest || !reviewAction) return;
    setReviewBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(
        `/api/admin/email-change-requests/${encodeURIComponent(reviewingRequest.id)}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: reviewAction,
            adminNote: reviewNote.trim() || undefined,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok === false) {
        toast.error(body?.message || body?.error || "Action failed.");
        return;
      }
      toast.success(
        reviewAction === "approve"
          ? "Email change approved. Verification email sent to the new address."
          : "Request rejected."
      );
      setReviewingRequest(null);
      setReviewAction(null);
      setReviewNote("");
      await fetchEmailRequests();
      await fetchPage(q, page);
    } finally {
      setReviewBusy(false);
    }
  };

  const fetchPage = async (
    qParam: string,
    p: number,
    sortParam: SortKey = sort,
    filterParams: Filters = filters
  ) => {
    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const params = new URLSearchParams();
      if (qParam.trim()) params.set("q", qParam.trim());
      params.set("page", String(p));
      params.set("limit", String(PAGE_LIMIT));
      params.set("sort", sortParam);
      if (filterParams.joinedFrom) params.set("joined_from", filterParams.joinedFrom);
      if (filterParams.joinedTo) params.set("joined_to", filterParams.joinedTo);
      if (filterParams.role) params.set("role", filterParams.role);
      if (filterParams.verification) params.set("verification", filterParams.verification);
      if (filterParams.country) params.set("country", filterParams.country);
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        credentials: "include",
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });
      const body: UsersResponse = await res.json();
      if (!res.ok || body.ok === false) {
        toast.error(body.error || `HTTP ${res.status}`);
        return;
      }
      setData(body);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  // Apply sort/filter changes immediately (no debounce — selects are
  // intentional clicks, not typing). Resets page to 1.
  useEffect(() => {
    if (!ready || !hasRole("admin")) return;
    setPage(1);
    fetchPage(q, 1, sort, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sort,
    filters.joinedFrom,
    filters.joinedTo,
    filters.role,
    filters.verification,
    filters.country,
  ]);

  const activeFilterCount =
    (filters.joinedFrom || filters.joinedTo ? 1 : 0) +
    (filters.role ? 1 : 0) +
    (filters.verification ? 1 : 0) +
    (filters.country ? 1 : 0);

  const resetFilters = () => {
    setFilters({
      joinedFrom: "",
      joinedTo: "",
      role: "",
      verification: "",
      country: "",
    });
    setDatePreset("any");
    setSort("newest");
  };

  const applyDatePreset = (key: string) => {
    setDatePreset(key);
    const preset = DATE_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const range = preset.compute();
    if (range) {
      setFilters((f) => ({ ...f, joinedFrom: range.from, joinedTo: range.to }));
    } else if (key === "any") {
      setFilters((f) => ({ ...f, joinedFrom: "", joinedTo: "" }));
    }
    // custom → leave fields alone, user edits them directly
  };

  useEffect(() => {
    if (!ready) return;
    if (!hasRole("admin")) {
      router.push(typeof window !== "undefined" ? `/admin?from=${encodeURIComponent(window.location.pathname + window.location.search)}` : "/admin");
      return;
    }
    fetchPage(q, page);
    void fetchEmailRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, hasRole, router, page]);

  // Debounced search — wait 300ms after the user stops typing, then
  // reset to page 1 and refetch.
  useEffect(() => {
    if (!ready || !hasRole("admin")) return;
    const handle = setTimeout(() => {
      setPage(1);
      fetchPage(q, 1);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!ready) {
    return (
      <>
        <AdminBackBar to="/admin" title="Users" />
        <div className="container mx-auto py-6 max-w-6xl">
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </div>
      </>
    );
  }
  if (!hasRole("admin")) return null;

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const currentUserId = data?.current_user_id ?? null;

  const performRoleChange = async (
    row: UserRow,
    nextRole: "customer" | "admin"
  ) => {
    setBusyRow(row.id);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s?.session?.access_token;
      const res = await fetch(`/api/admin/users/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ role: nextRole }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        const code = body?.code || body?.error;
        if (code === "CANNOT_MODIFY_SUPER_ADMIN") {
          toast.error("Super admin cannot be modified from this page.");
        } else if (code === "CANNOT_DEMOTE_SELF") {
          toast.error("You cannot demote your own account.");
        } else if (code === "LAST_ADMIN_GUARD") {
          toast.error(
            "There must always be at least one admin. Promote another user first."
          );
        } else {
          toast.error(body?.error || "Failed to update role.");
        }
        return;
      }
      toast.success(
        nextRole === "admin" ? "Admin access granted." : "Admin access removed."
      );
      // Optimistic update — patch the row locally + bust the cache by
      // refetching the same page so other fields stay accurate.
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) =>
                u.id === row.id ? { ...u, role: nextRole } : u
              ),
            }
          : prev
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to update role.");
    } finally {
      setBusyRow(null);
      setConfirming(null);
    }
  };

  return (
    <>
      <AdminBackBar to="/admin" title="Users" />

      <div className="container mx-auto py-6 space-y-4 max-w-screen-2xl px-4">
        <p className="text-sm text-muted-foreground">
          Manage account-level admin access. Promoting a user grants full
          access to every <code>/admin/*</code> surface. Super-admin
          accounts are immune to demotion from this page — only direct
          database access can change them.
        </p>

        {/* Pending email change requests */}
        {!emailRequestsLoading && emailRequests.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-700" />
                <span className="text-sm font-semibold text-amber-900">
                  {emailRequests.length} pending email change{" "}
                  {emailRequests.length === 1 ? "request" : "requests"}
                </span>
              </div>
              <div className="space-y-2">
                {emailRequests.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-0.5">
                      <p>
                        <strong>{r.requester_name || "(no name)"}</strong>{" "}
                        <span className="text-muted-foreground">wants to change</span>
                      </p>
                      <p className="font-mono text-[11px]">
                        {r.current_email}{" "}
                        <span className="text-muted-foreground">→</span>{" "}
                        <strong>{r.requested_email}</strong>
                      </p>
                      {r.reason && (
                        <p className="text-muted-foreground italic">
                          &ldquo;{r.reason}&rdquo;
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        Submitted {formatDate(r.requested_at)}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-300 text-red-700"
                        onClick={() => {
                          setReviewingRequest(r);
                          setReviewAction("reject");
                          setReviewNote("");
                        }}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => {
                          setReviewingRequest(r);
                          setReviewAction("approve");
                          setReviewNote("");
                        }}
                      >
                        <CheckCheck className="h-3.5 w-3.5 mr-1" /> Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search + filters + sort */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Label className="text-xs">Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Email, name, or phone…"
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="min-w-[180px]">
                <Label className="text-xs">Sort by</Label>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {SORT_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs">Joined</Label>
                <Select value={datePreset} onValueChange={applyDatePreset}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_PRESETS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[140px]">
                <Label className="text-xs">Role</Label>
                <Select
                  value={filters.role || "all"}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      role:
                        v === "all" ? "" : (v as Filters["role"]),
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="super_admin">Super admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[160px]">
                <Label className="text-xs">Verification</Label>
                <Select
                  value={filters.verification || "all"}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      verification:
                        v === "all" ? "" : (v as Filters["verification"]),
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                    <SelectItem value="locked">Locked out</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-[160px]">
                <Label className="text-xs">Country</Label>
                <Select
                  value={filters.country || "all"}
                  onValueChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      country: v === "all" ? "" : v,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All countries</SelectItem>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {COUNTRY_PROFILES[c].flag} {COUNTRY_PROFILES[c].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(activeFilterCount > 0 || sort !== "newest") && (
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Reset
                </Button>
              )}
            </div>

            {datePreset === "custom" && (
              <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
                <div className="min-w-[160px]">
                  <Label className="text-xs">From</Label>
                  <Input
                    type="date"
                    value={filters.joinedFrom}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, joinedFrom: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
                <div className="min-w-[160px]">
                  <Label className="text-xs">To</Label>
                  <Input
                    type="date"
                    value={filters.joinedTo}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, joinedTo: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Counts */}
        <div className="text-xs text-muted-foreground">
          {loading
            ? "Loading…"
            : data
            ? `${data.total.toLocaleString()} user${
                data.total === 1 ? "" : "s"
              } · page ${data.page} of ${totalPages}`
            : "—"}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-3 py-3 font-medium">Email</th>
                  <th className="text-left px-3 py-3 font-medium hidden sm:table-cell">Name</th>
                  <th className="text-left px-3 py-3 font-medium">Role</th>
                  <th className="text-left px-3 py-3 font-medium">Verification</th>
                  <th className="text-left px-3 py-3 font-medium hidden xl:table-cell">Phone</th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Country</th>
                  <th className="text-left px-3 py-3 font-medium hidden xl:table-cell">Last sign-in</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Joined</th>
                  <th className="text-right px-3 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading users…
                    </td>
                  </tr>
                )}
                {!loading && data && data.users.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-muted-foreground"
                    >
                      No users match this search.
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const isSuper = u.role === "super_admin";
                    const isAdmin = u.role === "admin";
                    return (
                      <tr
                        key={u.id}
                        className={`border-b last:border-b-0 hover:bg-muted/30 ${
                          isSelf ? "bg-muted/20" : ""
                        }`}
                      >
                        <td className="px-3 py-3 font-mono text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate max-w-[180px] sm:max-w-[220px]" title={u.email ?? ""}>
                              {u.email ?? "—"}
                            </span>
                            {isSelf && (
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase tracking-wide flex-shrink-0"
                              >
                                You
                              </Badge>
                            )}
                          </div>
                          {/* Mobile fallback: show name + role badge under email when other cols hidden */}
                          <div className="mt-1 sm:hidden text-[11px] text-muted-foreground">
                            {u.full_name?.trim() || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-3 hidden sm:table-cell">
                          {u.full_name?.trim() || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">{roleBadge(u.role)}</td>
                        <td className="px-3 py-3">
                          <VerificationCell
                            row={u}
                            busy={verifyBusy === u.id}
                            onResend={() =>
                              callUserVerification(
                                u.id,
                                { action: "resend" },
                                "Verification email sent."
                              )
                            }
                            onMarkVerified={() =>
                              callUserVerification(
                                u.id,
                                { action: "mark-verified" },
                                "User marked as verified."
                              )
                            }
                            onExtend={() => {
                              setExtendDays(7);
                              setExtendDialog(u);
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground hidden xl:table-cell">
                          {u.phone || "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                          {u.preferred_country
                            ? (() => {
                                const cc = u.preferred_country as CountryCode;
                                const profile = COUNTRY_PROFILES[cc];
                                return profile ? (
                                  <span
                                    className="inline-flex items-center gap-1.5"
                                    title={profile.name}
                                  >
                                    <CountryFlag code={cc} />
                                    <span className="tabular-nums">{cc}</span>
                                  </span>
                                ) : (
                                  u.preferred_country
                                );
                              })()
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums hidden xl:table-cell">
                          {formatDate(u.last_sign_in_at)}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums hidden md:table-cell">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {isSuper ? (
                            <span
                              className="inline-flex items-center text-xs text-muted-foreground"
                              title="Super admin cannot be demoted from this page."
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" /> Protected
                            </span>
                          ) : isAdmin && isSelf ? (
                            <span
                              className="inline-flex items-center text-xs text-muted-foreground"
                              title="You cannot demote your own account."
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" /> Your account
                            </span>
                          ) : isAdmin ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-700 hover:bg-red-50"
                              disabled={busyRow === u.id}
                              onClick={() =>
                                setConfirming({ row: u, nextRole: "customer" })
                              }
                            >
                              <ShieldOff className="h-4 w-4 mr-1" />
                              Remove admin
                            </Button>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyRow === u.id}
                                onClick={() =>
                                  setConfirming({ row: u, nextRole: "admin" })
                                }
                              >
                                <ShieldCheck className="h-4 w-4 mr-1" />
                                Make admin
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-700 hover:bg-red-50"
                                disabled={busyRow === u.id || deletingId === u.id}
                                onClick={() => {
                                  setDeleting(u);
                                  setDeleteConfirmEmail("");
                                }}
                                title="Delete user and all associated data"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Showing {(data.page - 1) * data.limit + 1}–
              {Math.min(data.page * data.limit, data.total)} of {data.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {data.page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm"
          onClick={() => !busyRow && setConfirming(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">
              {confirming.nextRole === "admin"
                ? "Grant admin access?"
                : "Remove admin access?"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {confirming.nextRole === "admin" ? (
                <>
                  This will give{" "}
                  <strong>{confirming.row.email ?? confirming.row.full_name}</strong>{" "}
                  full access to every <code>/admin/*</code> page in the
                  application. They&apos;ll be able to read and modify all
                  data the admin section exposes.
                </>
              ) : (
                <>
                  This will revoke admin access from{" "}
                  <strong>{confirming.row.email ?? confirming.row.full_name}</strong>.
                  They will return to being a regular customer immediately.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirming(null)}
                disabled={!!busyRow}
              >
                Cancel
              </Button>
              <Button
                variant={confirming.nextRole === "admin" ? "default" : "destructive"}
                onClick={() => performRoleChange(confirming.row, confirming.nextRole)}
                disabled={!!busyRow}
              >
                {busyRow ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                {confirming.nextRole === "admin" ? "Grant admin" : "Remove admin"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete user confirm dialog */}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o && !deletingId) {
            setDeleting(null);
            setDeleteConfirmEmail("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">
              Delete user permanently?
            </DialogTitle>
            <DialogDescription>
              This deletes <strong>{deleting?.email ?? deleting?.full_name}</strong>{" "}
              and all data linked to this account — orders, cart, wishlist,
              addresses, reviews, payouts, tokens, the lot. Cannot be undone.
              <br />
              <br />
              To confirm, type the user&apos;s email below:
              <br />
              <code className="text-xs">{deleting?.email ?? ""}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-email">Confirm email</Label>
            <Input
              id="confirm-email"
              type="email"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={deleting?.email ?? ""}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
                setDeleteConfirmEmail("");
              }}
              disabled={!!deletingId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={performDelete}
              disabled={
                !!deletingId ||
                deleteConfirmEmail.trim().toLowerCase() !==
                  (deleting?.email ?? "").toLowerCase() ||
                !deleting?.email
              }
            >
              {deletingId ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              {deletingId ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend grace period dialog */}
      <Dialog
        open={!!extendDialog}
        onOpenChange={(o) => !o && setExtendDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend grace period</DialogTitle>
            <DialogDescription>
              Add days to the current lockout deadline for{" "}
              <strong>{extendDialog?.email ?? extendDialog?.full_name}</strong>.
              Useful for VIP customers or active disputes where you need to
              give them more time to verify.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="extendDays">Extra days</Label>
            <Input
              id="extendDays"
              type="number"
              min={1}
              max={365}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value) || 1)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExtendDialog(null)}
              disabled={verifyBusy === extendDialog?.id}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!extendDialog) return;
                const target = extendDialog;
                setExtendDialog(null);
                await callUserVerification(
                  target.id,
                  { action: "extend", days: extendDays },
                  `Grace period extended by ${extendDays} day${extendDays === 1 ? "" : "s"}.`
                );
              }}
              disabled={verifyBusy === extendDialog?.id}
            >
              Extend by {extendDays} day{extendDays === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email change request review dialog */}
      <Dialog
        open={!!reviewingRequest && !!reviewAction}
        onOpenChange={(o) => {
          if (!o) {
            setReviewingRequest(null);
            setReviewAction(null);
            setReviewNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approve"
                ? "Approve email change"
                : "Reject email change"}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === "approve" ? (
                <>
                  This will change the user&apos;s sign-in email to{" "}
                  <strong>{reviewingRequest?.requested_email}</strong> and send
                  a fresh verification link to the new address. Their existing
                  verification status will be reset.
                </>
              ) : (
                <>
                  This will reject the request. The user will see the rejection
                  reason on their account settings page next time they visit.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="adminNote" className="flex items-baseline justify-between">
              <span>Note (visible to the user)</span>
              <span className="text-xs text-muted-foreground font-normal">
                {reviewAction === "reject" ? "Required" : "Optional"}
              </span>
            </Label>
            <Textarea
              id="adminNote"
              rows={3}
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder={
                reviewAction === "reject"
                  ? "Explain why so the user knows what to do next."
                  : "Optional message — e.g. confirmed via WhatsApp."
              }
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReviewingRequest(null);
                setReviewAction(null);
                setReviewNote("");
              }}
              disabled={reviewBusy}
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === "approve" ? "default" : "destructive"}
              onClick={submitReview}
              disabled={
                reviewBusy ||
                (reviewAction === "reject" && reviewNote.trim().length === 0)
              }
            >
              {reviewBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {reviewAction === "approve" ? "Approve & send email" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// --------------------------------------------------------------------
// VerificationCell — shows a colored badge based on verification stage
// and a kebab menu of admin actions. Stage is derived purely from row
// fields + cached config (server already computed the absolute lockout
// when we fetched the row, so we just need to translate now() vs that).
// --------------------------------------------------------------------
function VerificationCell({
  row,
  busy,
  onResend,
  onMarkVerified,
  onExtend,
}: {
  row: UserRow;
  busy: boolean;
  onResend: () => void;
  onMarkVerified: () => void;
  onExtend: () => void;
}) {
  // Staff bypass — server-side gate also treats these as verified, but
  // mirror it here so the badge matches.
  const isStaff =
    row.role === "admin" || row.role === "super_admin" || (row.role as any) === "vendor";

  if (isStaff || row.email_verified_at) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
        <MailCheck className="h-3.5 w-3.5" />
        Verified
      </span>
    );
  }

  // Compute deadline client-side using a 30-day default. The server is
  // the source of truth for gating; this is just a display hint.
  const graceStart = row.email_verification_grace_starts_at
    ? new Date(row.email_verification_grace_starts_at)
    : null;
  const deadline = row.email_verification_deadline_override
    ? new Date(row.email_verification_deadline_override)
    : graceStart
      ? new Date(graceStart.getTime() + 30 * 86400000)
      : null;
  const now = Date.now();
  const daysLeft = deadline
    ? Math.ceil((deadline.getTime() - now) / 86400000)
    : null;
  const stage =
    !deadline
      ? "soft"
      : now >= deadline.getTime()
        ? "locked"
        : daysLeft !== null && daysLeft <= 23 // approximate warning window
          ? "warning"
          : "soft";

  const labelStyle: Record<string, string> = {
    soft: "text-blue-700",
    warning: "text-amber-700",
    locked: "text-red-700",
  };
  const Icon =
    stage === "locked" ? MailX : stage === "warning" ? MailWarning : MailCheck;

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 text-xs ${labelStyle[stage]}`}>
        <Icon className="h-3.5 w-3.5" />
        {stage === "locked"
          ? "Locked out"
          : stage === "warning"
            ? `${daysLeft}d left`
            : "Unverified"}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" disabled={busy} className="h-6 w-6 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Verification actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onResend}>
            <Send className="h-4 w-4 mr-2" />
            Send verification email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExtend}>
            <Clock className="h-4 w-4 mr-2" />
            Extend grace period…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMarkVerified}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Mark as verified
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
