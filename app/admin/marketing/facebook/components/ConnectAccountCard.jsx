// app/admin/marketing/facebook/components/ConnectAccountCard.jsx
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

export default function ConnectAccountCard() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [connection, setConnection] = useState(null);
  const [pages, setPages] = useState([]);

  // Load stored connection
  useEffect(() => {
    const loadConnection = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/facebook/adaccounts", {
          method: "GET",
        });
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Failed to load connection");
          setConnection(null);
        } else {
          setConnection(json.data);
        }
      } catch (err) {
        console.error(err);
        setError("Network error while loading connection");
        setConnection(null);
      } finally {
        setLoading(false);
      }
    };

    loadConnection();
  }, []);

  // Sync from Facebook (Pages + IG biz)
  const handleSync = async () => {
    setSyncing(true);
    setError(null);

    try {
      const res = await fetch("/api/facebook/adaccounts", {
        method: "POST",
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error || "Failed to sync Facebook Pages");
      } else {
        setConnection(json.data);
        setPages(json.pages || []);
      }
    } catch (err) {
      console.error(err);
      setError("Network error while syncing");
    } finally {
      setSyncing(false);
    }
  };

  const primaryPageId = connection?.facebook_page_id || null;
  const primaryPage = pages.find((p) => p.id === primaryPageId) || null;
  const isConnected = !!connection;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">Account Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading connection…</span>
          </div>
        ) : (
          <>
            <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Facebook Page ID</span>
                <span className="font-mono text-[11px]">
                  {primaryPageId || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Page name</span>
                <span className="truncate text-[11px] font-medium">
                  {primaryPage?.name || "Sync to fetch pages"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  IG Business Account ID
                </span>
                <span className="font-mono text-[11px]">
                  {connection?.ig_business_account_id || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">IG Username</span>
                <span className="font-mono text-[11px]">
                  {connection?.username || "—"}
                </span>
              </div>
            </div>

            {/* Pages list from last sync */}
            {pages.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1 font-semibold text-[11px]">
                  Facebook Pages (from last sync)
                </p>
                <ul className="space-y-1">
                  {pages.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex flex-col">
                        <span className="truncate text-[11px]">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {p.id}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Info + error */}
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {isConnected ? (
                <>
                  Connection found. Use{" "}
                  <span className="font-semibold">Sync from Facebook</span> to
                  refresh your Pages and Instagram Business details.
                </>
              ) : (
                <>
                  No Facebook Page linked yet. Make sure your{" "}
                  <span className="font-semibold">instagram_accounts</span> row
                  exists with a valid long-lived token (from your Instagram
                  settings), then click{" "}
                  <span className="font-semibold">Sync from Facebook</span>.
                </>
              )}
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSync}
          disabled={syncing || loading}
          variant="default"
        >
          {syncing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Syncing…
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync from Facebook
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
