"use client";

import { useEffect, useState } from "react";
import { AdminBackBar } from "@/components/admin/AdminBackBar";

export default function InstagramInboxPage() {
  const [instagramAccounts, setInstagramAccounts] = useState([]);
  const [activeAccountId, setActiveAccountId] = useState("");
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [syncingConversations, setSyncingConversations] = useState(false);
  const [syncingMessages, setSyncingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [message, setMessage] = useState("");

  // Load IG accounts (via admin service-role endpoint — the anon Supabase
  // client is RLS-blocked from `instagram_accounts` under NextAuth).
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const res = await fetch("/api/instagram/accounts");
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error || "Failed to load Instagram accounts");
        }
        const data = json.data || [];
        setInstagramAccounts(data);
        if (data.length > 0) {
          setActiveAccountId(data[0].id);
        }
      } catch (err) {
        console.error("Load instagram_accounts error:", err);
        setMessage("Failed to load Instagram accounts.");
      }
    };

    loadAccounts();
  }, []);

  const loadConversations = async (accountId) => {
    if (!accountId) return;
    setLoadingConversations(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/conversations?instagram_account_id=${accountId}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load conversations");
      setConversations(json.conversations || []);
      if (json.conversations && json.conversations.length > 0) {
        setSelectedConversationId(json.conversations[0].id);
      } else {
        setSelectedConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error loading conversations.");
    } finally {
      setLoadingConversations(false);
    }
  };

  // Load conversations when active IG account changes
  useEffect(() => {
    if (activeAccountId) loadConversations(activeAccountId);
  }, [activeAccountId]);

  const loadMessages = async (convId) => {
    if (!convId) return;
    setLoadingMessages(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/conversations/${convId}/messages`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load messages");
      setMessages(json.messages || []);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error loading messages.");
    } finally {
      setLoadingMessages(false);
    }
  };

  // Load messages when conversation changes
  useEffect(() => {
    if (selectedConversationId) loadMessages(selectedConversationId);
  }, [selectedConversationId]);

  const handleSyncConversations = async () => {
    if (!activeAccountId) return;
    setSyncingConversations(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/conversations/sync?instagram_account_id=${activeAccountId}`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to sync conversations");
      setMessage(
        `Synced ${json.synced_count || 0} conversations from Instagram.`
      );
      await loadConversations(activeAccountId);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error syncing conversations.");
    } finally {
      setSyncingConversations(false);
    }
  };

  const handleSyncMessages = async () => {
    if (!selectedConversationId) return;
    setSyncingMessages(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/conversations/${selectedConversationId}/messages/sync`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to sync messages");
      setMessage(
        `Synced ${json.synced_count || 0} messages for this conversation.`
      );
      await loadMessages(selectedConversationId);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error syncing messages.");
    } finally {
      setSyncingMessages(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!selectedConversationId) return;
    if (!composeText.trim()) {
      setMessage("Message text cannot be empty.");
      return;
    }
    setSending(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/instagram/conversations/${selectedConversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: composeText.trim() }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to send message");
      setComposeText("");
      setMessage("Message sent.");
      await loadMessages(selectedConversationId);
    } catch (err) {
      console.error(err);
      setMessage(err.message || "Error sending message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
    <AdminBackBar title="Instagram Inbox" to="/admin" />
    <main className="min-h-screen px-4 py-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">
        Instagram DM Inbox
      </h1>

      {message && (
        <div className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          {message}
        </div>
      )}

      {/* Account selector + top actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <label className="block text-xs font-medium mb-1">
            Instagram Account
          </label>
          <select
            className="border rounded-md px-3 py-2 text-sm w-full max-w-xs"
            value={activeAccountId}
            onChange={(e) => setActiveAccountId(e.target.value)}
          >
            {instagramAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                @{acc.username || acc.ig_business_account_id}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSyncConversations}
          disabled={!activeAccountId || syncingConversations}
          className="px-4 py-2 rounded-md text-sm font-medium bg-black text-white disabled:opacity-60"
        >
          {syncingConversations ? "Syncing..." : "Sync conversations"}
        </button>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-4">
        {/* Conversations list */}
        <aside className="border rounded-lg bg-white overflow-hidden">
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Conversations
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {loadingConversations ? (
              <div className="p-3 text-sm text-gray-500">
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">
                No conversations yet. Try syncing.
              </div>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedConversationId(c.id)}
                  className={`w-full text-left px-3 py-2 border-b text-sm hover:bg-zinc-50 ${
                    selectedConversationId === c.id
                      ? "bg-zinc-100 font-semibold"
                      : ""
                  }`}
                >
                  <div className="truncate">
                    {c.participant_username || "Unknown user"}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {c.last_message || <em>No messages</em>}
                  </div>
                  {c.last_message_at && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(c.last_message_at).toLocaleString()}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Messages panel */}
        <section className="border rounded-lg bg-white flex flex-col min-h-[520px]">
          <div className="border-b px-3 py-2 flex items-center justify-between">
            <div className="text-sm font-semibold">
              {selectedConversationId
                ? "Conversation"
                : "Select a conversation"}
            </div>
            <button
              onClick={handleSyncMessages}
              disabled={!selectedConversationId || syncingMessages}
              className="px-3 py-1 rounded-md text-xs font-medium bg-black text-white disabled:opacity-60"
            >
              {syncingMessages ? "Syncing..." : "Sync messages"}
            </button>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 text-sm">
            {loadingMessages ? (
              <div className="text-gray-500">Loading messages...</div>
            ) : !selectedConversationId ? (
              <div className="text-gray-500">
                Choose a conversation from the left.
              </div>
            ) : messages.length === 0 ? (
              <div className="text-gray-500">
                No messages yet. Try syncing.
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.sender_type === "business"
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                      m.sender_type === "business"
                        ? "bg-black text-white"
                        : "bg-zinc-100 text-gray-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.sent_at && (
                      <div className="mt-1 text-[10px] opacity-70 text-right">
                        {new Date(m.sent_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSend}
            className="border-t px-3 py-2 flex items-center gap-2"
          >
            <input
              type="text"
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder={
                selectedConversationId
                  ? "Type a message…"
                  : "Select a conversation first"
              }
              disabled={!selectedConversationId || sending}
              className="flex-1 border rounded-md px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={!selectedConversationId || sending}
              className="px-4 py-2 rounded-md text-sm font-medium bg-black text-white disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </form>
        </section>
      </div>
    </main>
    </>
  );
}
