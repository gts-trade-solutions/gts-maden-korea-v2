"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

type Point = { day: string; clicks: number; orders: number };

export default function MetricsChart({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Route through the server endpoint so the call is scoped to the
      // logged-in influencer (under NextAuth the browser anon client has no
      // auth.uid(), so the RPC would return empty).
      let rows: any[] = [];
      try {
        const res = await fetch(
          `/api/influencer/timeseries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { credentials: "include", cache: "no-store" }
        );
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.ok && Array.isArray(body.data)) rows = body.data;
      } catch {
        // best-effort — leave the chart empty on failure
      }
      if (!cancelled) {
        setData(
          rows.map((r) => ({
            day: new Date(r.day).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
            clicks: Number(r.clicks || 0),
            orders: Number(r.orders || 0),
          }))
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="orders" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
