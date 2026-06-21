"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

type Point = { day: string; clicks: number; orders: number };

export default function MetricsChart({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("influencer_timeseries", { p_from: from, p_to: to });
      if (!cancelled) {
        const rows: any[] = Array.isArray(data) ? data : [];
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
