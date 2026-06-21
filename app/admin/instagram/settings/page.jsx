"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

export default function InstagramSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // For showing current connection details
  const [account, setAccount] = useState(null);

  // Manual form
  const [form, setForm] = useState({
    ig_business_account_id: "",
    username: "",
    access_token: "",
    token_expires_at: "",
  });

  const [message, setMessage] = useState("");
  const [showManual, setShowManual] = useState(true);
  const [showHowTo, setShowHowTo] = useState(false);

  // Read any ?success or ?error from URL (optional – kept for future use)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success === "manual_saved") {
      setMessage("Instagram account updated with manual token.");
    } else if (error) {
      setMessage(decodeURIComponent(error));
    }
  }, []);

  useEffect(() => {
    const loadAccount = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/instagram/account");
        if (!res.ok) {
          throw new Error("Failed to load instagram account");
        }
        const data = await res.json();

        if (data.account) {
          setAccount(data.account);
          setForm((prev) => ({
            ...prev,
            ig_business_account_id:
              data.account.ig_business_account_id || "",
            username: data.account.username || "",
            token_expires_at: data.account.token_expires_at
              ? data.account.token_expires_at.substring(0, 10)
              : "",
          }));
        } else {
          setAccount(null);
        }
      } catch (err) {
        console.error(err);
        setMessage("Could not load existing Instagram settings.");
      } finally {
        setLoading(false);
      }
    };

    loadAccount();
  }, []);

  // ----- STATUS LABEL -----
  const tokenStatus = useMemo(() => {
    if (!account || !account.token_expires_at) {
      return { label: "Not connected (no token saved)", tone: "warning" };
    }
    const expiry = new Date(account.token_expires_at);
    const now = new Date();
    const diffDays =
      (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) {
      return {
        label: "Expired – please generate and paste a new token",
        tone: "error",
      };
    }
    if (diffDays < 7) {
      return {
        label: `Expiring soon (${Math.round(
          diffDays
        )} days left) – prepare a new token`,
        tone: "warning",
      };
    }
    return {
      label: `Connected (expires ${expiry.toLocaleDateString()})`,
      tone: "ok",
    };
  }, [account]);

  const statusColorClass =
    tokenStatus.tone === "ok"
      ? "text-green-700 bg-green-50 border-green-200"
      : tokenStatus.tone === "warning"
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : "text-red-700 bg-red-50 border-red-200";

  // ----- Manual form handlers -----
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/instagram/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save Instagram account");
      }

      setMessage("Instagram account saved with manual token.");
      setForm((prev) => ({ ...prev, access_token: "" }));
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error saving Instagram account.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <>
      <AdminBackBar title="Instagram Settings" to="/admin" />
      <main className="min-h-screen px-4 py-10">
        <p>Loading...</p>
      </main>
      </>
    );
  }

  return (
    <>
    <AdminBackBar title="Instagram Settings" to="/admin" />
    <main className="min-h-screen px-4 py-10 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Instagram Settings</h1>
      <p className="text-sm text-gray-600 mb-4">
        This page uses <span className="font-semibold">manual tokens</span>.
        Paste a long-lived access token from Meta, and we will store it in the
        database so that your admin can{" "}
        <span className="font-medium">
          manage Instagram and Facebook page posts
        </span>{" "}
        from the dashboard.
      </p>

      {/* STATUS */}
      <div
        className={`mb-4 border rounded-md px-3 py-2 text-xs flex flex-col gap-1 ${statusColorClass}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium">Connection status (manual mode)</p>
            <p className="mt-1">
              {tokenStatus.label}
              {account?.username && (
                <>
                  {" "}
                  – <span className="font-mono">@{account.username}</span>
                </>
              )}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-gray-600 mt-1">
          When the token expires, just generate a new one from Meta tools and
          paste it below. No Facebook login button is required.
        </p>
      </div>

      {message && (
        <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          {message}
        </div>
      )}

      {/* HOW TO GET A TOKEN */}
      <div className="mb-4 border rounded-md">
        <button
          type="button"
          onClick={() => setShowHowTo((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium"
        >
          <span>How to generate a long-lived token (step-by-step)</span>
          <span>{showHowTo ? "▲" : "▼"}</span>
        </button>

        {showHowTo && (
          <div className="border-t px-3 py-3 text-xs text-gray-700 space-y-2">
            <p className="text-[11px] text-gray-500">
              You can share these steps with a non-technical admin. They only
              need a Facebook login and access to your Page/Instagram.
            </p>

            <ol className="list-decimal list-inside space-y-1">
              <li>
                Make sure your Instagram account is a{" "}
                <span className="font-medium">Business</span> or{" "}
                <span className="font-medium">Creator</span> account and it is{" "}
                <span className="font-medium">
                  connected to your Facebook Page
                </span>{" "}
                in Meta Business / Page settings.
              </li>
              <li>
                Open the{" "}
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  Graph API Explorer
                </a>{" "}
                while logged in to Facebook. Choose your app (or &quot;User
                Token&quot;) and generate an access token with permissions like:
                <code className="ml-1 bg-gray-100 px-1 py-0.5 rounded">
                  pages_show_list, pages_read_engagement, pages_manage_posts,
                  instagram_basic, instagram_manage_comments
                </code>
                .
              </li>
              <li>
                Copy that short-lived token and open the{" "}
                <a
                  href="https://developers.facebook.com/tools/debug/accesstoken/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline"
                >
                  Access Token Debugger
                </a>
                . Paste the token and click <strong>Debug</strong>, then click{" "}
                <strong>Extend Access Token</strong>. This converts it to a
                long-lived token (usually around 60 days).
              </li>
              <li>
                Copy the new long-lived token from the Debugger and paste it
                into the <strong>Access Token</strong> field in the form below.
                Optionally, set the <strong>Token Expiry</strong> date by
                looking at the &quot;Expires&quot; value in the debugger.
              </li>
              <li>
                To find your{" "}
                <strong>Instagram Business Account ID (1784…)</strong>, you can
                use the same Graph API Explorer and call:
                <code className="block mt-1 bg-gray-100 px-2 py-1 rounded text-[11px] whitespace-pre">
                  GET /me/accounts?fields=name,id,instagram_business_account&#123;id,username&#125;
                </code>
                Then copy the{" "}
                <code className="bg-gray-100 px-1 rounded">id</code> from{" "}
                <code className="bg-gray-100 px-1 rounded">
                  instagram_business_account
                </code>{" "}
                into <strong>Instagram Business Account ID</strong> here.
              </li>
            </ol>

            <p className="text-[11px] text-gray-500">
              Tip: You only need to find the Business Account ID once. After
              that, when the token expires, you can just repeat steps 2–4 and
              paste a new token.
            </p>
          </div>
        )}
      </div>

      {/* MANUAL TOKEN FORM */}
      <div className="mt-4 border rounded-md">
        <button
          type="button"
          onClick={() => setShowManual((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium"
        >
          <span>Manual token setup</span>
          <span>{showManual ? "▲" : "▼"}</span>
        </button>

        {showManual && (
          <div className="border-t px-3 py-3">
            <p className="text-xs text-gray-500 mb-3">
              Paste the long-lived token you generated from Meta. We store it
              securely in Supabase and use it for your Facebook/Instagram
              marketing features.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Instagram Business Account ID *
                </label>
                <input
                  type="text"
                  name="ig_business_account_id"
                  value={form.ig_business_account_id}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="e.g. 1784xxxxxxxxxxxx"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Use Graph API Explorer to find this once (see step 5 above).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Instagram Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="@yourbusiness"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Access Token *
                </label>
                <textarea
                  name="access_token"
                  value={form.access_token}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="Paste long-lived access token here"
                  rows={3}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  We do not show this token again after saving. If it expires or
                  is revoked, simply generate a new one and paste it here.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Token Expiry (optional)
                </label>
                <input
                  type="date"
                  name="token_expires_at"
                  value={form.token_expires_at}
                  onChange={handleChange}
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Set this based on the &quot;Expires&quot; value from the
                  Access Token Debugger. We use it to show &quot;expiring
                  soon&quot; warnings.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-4 py-2 rounded-md text-sm font-medium bg-black text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save manual token"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
    </>
  );
}
