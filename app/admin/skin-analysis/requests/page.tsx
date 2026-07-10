"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, RefreshCw, Loader2 } from "lucide-react";

type Req = {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  note: string | null;
  createdAt: string;
};

export default function SkinAccessRequestsPage() {
  const [requests, setRequests] = useState<Req[] | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/skin/requests", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        setDenied("You don't have access to this page.");
        setRequests([]);
        return;
      }
      const data = await r.json();
      setRequests(data.requests ?? []);
    } catch {
      toast.error("Failed to load requests.");
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: string, action: "approve" | "deny") {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/skin/requests/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error === "already_reviewed" ? "Already reviewed." : "Action failed.");
      } else {
        toast.success(action === "approve" ? "Approved — user granted another analysis." : "Request denied.");
        setRequests((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      }
    } catch {
      toast.error("Action failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Skin analysis — access requests
          </h1>
          <p className="text-sm text-muted-foreground">
            Approve to grant the user one more analysis.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending</CardTitle>
          <CardDescription>
            {requests == null
              ? "Loading…"
              : `${requests.length} pending request${requests.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {denied ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{denied}</p>
          ) : requests == null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No pending requests.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.email || r.userId}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          size="sm"
                          disabled={busy === r.id}
                          onClick={() => review(r.id, "approve")}
                        >
                          <Check className="mr-1 h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === r.id}
                          onClick={() => review(r.id, "deny")}
                        >
                          <X className="mr-1 h-4 w-4" /> Deny
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
