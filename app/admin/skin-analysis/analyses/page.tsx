"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Loader2, FileText, Search } from "lucide-react";
import { scoreRating } from "@/lib/integrations/skinConcerns";

type Row = {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  kind: string;
  overall: number | null;
  topConcerns: string[];
};

export default function AdminSkinAnalysesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (p: number, query: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (query.trim()) params.set("q", query.trim());
        const r = await fetch(`/api/admin/skin/analyses?${params}`, {
          cache: "no-store",
        });
        const data = await r.json();
        setRows(data.analyses ?? []);
        setTotal(data.total ?? 0);
        setPageSize(data.pageSize ?? 50);
        setPage(data.page ?? p);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    load(1, "");
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All skin analyses</CardTitle>
              <CardDescription>
                Every completed analysis across accounts — {total} total. Open
                one to view the full report.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(page, q)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              load(1, q);
            }}
          >
            <Input
              placeholder="Search by user email or name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={loading}>
              <Search className="mr-2 h-4 w-4" /> Search
            </Button>
          </form>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Top concerns</TableHead>
                  <TableHead className="text-right">Report</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {loading ? "Loading…" : "No analyses found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {fmtDate(r.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="font-medium">{r.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.email || r.userId.slice(0, 8)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.overall != null ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreRating(r.overall).chipClass}`}
                          >
                            {Math.round(r.overall * 100)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                        {r.topConcerns.join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/skin-analysis/analyses/${r.id}`}>
                            <FileText className="mr-2 h-4 w-4" /> View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => load(page - 1, q)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => load(page + 1, q)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
