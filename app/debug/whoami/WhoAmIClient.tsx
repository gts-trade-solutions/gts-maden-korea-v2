"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function WhoAmIClient() {
  const sb = createClientComponentClient();
  const [client, setClient] = useState<any>(null);
  const [server, setServer] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setErr(null);
    setMsg(null);
    const {
      data: { session },
    } = await sb.auth.getSession();
    setClient(
      session
        ? { user_id: session.user.id, has_access_token: !!session.access_token }
        : null
    );

    const res = await fetch("/api/debug/whoami", {
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
      cache: "no-store",
    });
    let j: any = {};
    try {
      j = await res.json();
    } catch {}
    if (!res.ok) setErr(j?.error || "Failed");
    setServer(j);
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg("Signed in (client). Attaching to server...");
    await fetch("/api/auth/attach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      }),
    });
    await refresh();
  }

  async function signOut() {
    await sb.auth.signOut();
    setMsg("Signed out");
    await refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4">
      <h1 className="text-lg font-semibold">Who am I (debug)</h1>

      <form onSubmit={signIn} className="grid grid-cols-1 gap-2 border rounded p-3">
        <input
          className="border rounded px-3 py-2"
          type="email"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="border rounded px-3 py-2"
          type="password"
          placeholder="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-black text-white text-sm" type="submit">
            Sign in (email/password)
          </button>
          <button className="px-3 py-2 rounded border text-sm" type="button" onClick={signOut}>
            Sign out
          </button>
          <button className="px-3 py-2 rounded border text-sm" type="button" onClick={refresh}>
            Refresh
          </button>
        </div>
      </form>

      {msg && <p className="text-green-700 text-sm">{msg}</p>}
      {err && <p className="text-red-700 text-sm">{err}</p>}

      <div className="border rounded p-3 text-sm">
        <div className="font-medium mb-1">Client session</div>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(client, null, 2)}
        </pre>
      </div>

      <div className="border rounded p-3 text-sm">
        <div className="font-medium mb-1">Server view (/api/debug/whoami)</div>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(server, null, 2)}
        </pre>
      </div>

      <div className="text-xs text-neutral-500">
        Env present: URL {String(!!process.env.NEXT_PUBLIC_SUPABASE_URL)} · ANON{" "}
        {String(!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}
      </div>
    </div>
  );
}
