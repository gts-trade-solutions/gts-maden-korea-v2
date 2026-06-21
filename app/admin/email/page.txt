"use client";

import React, { useEffect, useState, useMemo } from "react";
import * as XLSX from "xlsx";

type Category = {
  id: string;
  slug: string;
  label: string;
  description?: string | null;
};

type TargetType = "category" | "registered_users" | "upload_only";

type UploadRecipient = {
  email: string;
  name?: string | null;
};

type EditorMode = "html" | "text";

type RegisteredUser = {
  id: string;
  email: string;
  name?: string | null;
  unsubscribed?: boolean;
};

export default function AdminEmailPage() {
  // Categories
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    new Set()
  );

  // Editor
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("html");

  // Targeting
  const [targetType, setTargetType] = useState<TargetType>("category");

  // Import (master list)
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // One-time upload
  const [uploadOnlyFile, setUploadOnlyFile] = useState<File | null>(null);
  const [uploadRecipients, setUploadRecipients] = useState<UploadRecipient[]>(
    []
  );

  // Registered users
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [registeredLoading, setRegisteredLoading] = useState(false);
  const [selectedRegisteredEmails, setSelectedRegisteredEmails] = useState<
    Set<string>
  >(new Set());

  // Status
  const [sendLoading, setSendLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Init: categories ----
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/admin/email/categories");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load categories");
        setCategories(data.categories || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load categories");
      }
    }
    fetchCategories();
  }, []);

  // ---- Load registered users when that mode is selected ----
  useEffect(() => {
    if (targetType !== "registered_users") return;

    async function fetchRegistered() {
      try {
        setRegisteredLoading(true);
        const res = await fetch("/api/admin/email/contacts?type=registered");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load users");

        const users: RegisteredUser[] = (data.contacts || []).map((c: any) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          unsubscribed: c.unsubscribed,
        }));

        setRegisteredUsers(users);

        // Default: select all non-unsubscribed
        const sel = new Set<string>();
        for (const u of users) {
          if (!u.unsubscribed) sel.add(u.email.toLowerCase());
        }
        setSelectedRegisteredEmails(sel);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load registered users");
      } finally {
        setRegisteredLoading(false);
      }
    }

    fetchRegistered();
  }, [targetType]);

  // ---- Helpers ----

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setImportFile(file);
  };

  const handleImportSubmit = async () => {
    setMessage(null);
    setError(null);

    if (!importFile) {
      setError("Please select an Excel file to import.");
      return;
    }

    setImportLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);

      const res = await fetch("/api/admin/email/upload-import", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      setMessage(
        `Import success: rows=${data.totalRows}, contactsCreated=${data.contactsCreated}, linksCreated=${data.linksCreated}`
      );

      // Refresh categories
      const catRes = await fetch("/api/admin/email/categories");
      const catData = await catRes.json();
      if (catRes.ok) setCategories(catData.categories || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Import failed");
    } finally {
      setImportLoading(false);
    }
  };

  const handleUploadOnlyFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0] || null;
    setUploadOnlyFile(file);
    setUploadRecipients([]);
    if (file) parseUploadOnlyFile(file);
  };

  const parseUploadOnlyFile = (file: File) => {
    setMessage(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      if (!data) return;
      const workbook = XLSX.read(data, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const rows: UploadRecipient[] = rawRows
        .map((row) => {
          const email =
            (row.Email || row.email || row.EMAIL || "").toString().trim();
          const name =
            (row.Name || row.name || row.NAME || "").toString().trim() || null;
          return { email, name };
        })
        .filter((r) => r.email);

      setUploadRecipients(rows);
      setMessage(`Parsed ${rows.length} recipients from upload-only file.`);
    };
    reader.readAsBinaryString(file);
  };

  // Registered user selection
  const toggleRegisteredEmail = (email: string) => {
    const lower = email.toLowerCase();
    setSelectedRegisteredEmails((prev) => {
      const copy = new Set(prev);
      if (copy.has(lower)) copy.delete(lower);
      else copy.add(lower);
      return copy;
    });
  };

  const selectAllRegistered = () => {
    const sel = new Set<string>();
    for (const u of registeredUsers) {
      if (!u.unsubscribed) sel.add(u.email.toLowerCase());
    }
    setSelectedRegisteredEmails(sel);
  };

  const clearAllRegistered = () => {
    setSelectedRegisteredEmails(new Set());
  };

  // Live preview
  const previewMarkup = useMemo(() => {
    if (editorMode === "html") {
      const html = bodyHtml?.trim()
        ? bodyHtml
        : '<p class="text-gray-400 text-sm">Start typing to see a preview…</p>';
      return { __html: html };
    }

    const text = bodyText?.trim();
    if (!text) {
      return {
        __html:
          '<p class="text-gray-400 text-sm">Start typing to see a preview…</p>',
      };
    }
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const html = `<pre class="whitespace-pre-wrap text-sm">${escaped}</pre>`;
    return { __html: html };
  }, [editorMode, bodyHtml, bodyText]);

  // ---- Send campaign ----
  const handleSendCampaign = async () => {
    setMessage(null);
    setError(null);

    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }

    const activeBody =
      editorMode === "html" ? bodyHtml.trim() : bodyText.trim();
    if (!activeBody) {
      setError("Email body is required.");
      return;
    }

    const payload: any = { subject, targetType };

    if (editorMode === "html") {
      payload.bodyHtml = bodyHtml;
    } else {
      const htmlFromText = bodyText
        .split("\n")
        .map((line) => line || " ")
        .join("<br/>");
      payload.bodyHtml = htmlFromText;
    }

    if (targetType === "category") {
      const ids = Array.from(selectedCategoryIds);
      if (ids.length === 0) {
        setError("Please select at least one category.");
        return;
      }
      payload.categoryIds = ids;
    } else if (targetType === "upload_only") {
      if (uploadRecipients.length === 0) {
        setError(
          "No upload-only recipients parsed. Please upload an Excel file."
        );
        return;
      }
      payload.uploadRecipients = uploadRecipients;
    } else if (targetType === "registered_users") {
      const emails = Array.from(selectedRegisteredEmails);
      if (emails.length === 0) {
        setError("Please select at least one registered user.");
        return;
      }
      payload.selectedEmails = emails;
    }

    setSendLoading(true);
    try {
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");

      setMessage(
        `Campaign sent! ID=${data.campaignId}, recipients=${data.recipientsCount}`
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Send failed");
    } finally {
      setSendLoading(false);
    }
  };

  const selectedCategoryCount = selectedCategoryIds.size;
  const selectedRegisteredCount = selectedRegisteredEmails.size;

  // ---- UI ----
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Send email campaign
          </h1>
          <p className="text-sm text-slate-500">
            Import contacts, compose your message, and send to categories,
            website users, or a one-time list.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="border border-rose-300 bg-rose-50 text-rose-800 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="border border-emerald-300 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-md text-sm">
          {message}
        </div>
      )}

      {/* 1. Import contacts */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              1. Import contacts from Excel
            </h2>
            <p className="text-xs text-slate-500">
              Columns expected:&nbsp;
              <span className="font-medium">Email</span>,&nbsp;
              <span className="font-medium">Name</span>,&nbsp;
              <span className="font-medium">Category</span> (doctor,
              shopkeeper, etc.).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/api/admin/email/template";
            }}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs"
          >
            Download template
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFileChange}
            className="text-xs text-slate-700"
          />
          <button
            onClick={handleImportSubmit}
            disabled={importLoading || !importFile}
            className="inline-flex items-center px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs disabled:opacity-50"
          >
            {importLoading ? "Importing…" : "Import contacts"}
          </button>
          {categories.length > 0 && (
            <span className="text-[11px] text-slate-500">
              Current categories:&nbsp;
              <span className="font-semibold text-slate-800">
                {categories.length}
              </span>
            </span>
          )}
        </div>
      </section>

      {/* 2. Compose + targeting */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-4 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">
          2. Compose and target campaign
        </h2>

        {/* Subject */}
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-700">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
            placeholder="Enter email subject"
          />
        </div>

        {/* Editor + preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-700">
              Email content
            </label>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">Editor mode:</span>
              <button
                type="button"
                onClick={() => setEditorMode("html")}
                className={
                  "px-2 py-1 rounded-md border text-[11px] " +
                  (editorMode === "html"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300")
                }
              >
                HTML
              </button>
              <button
                type="button"
                onClick={() => setEditorMode("text")}
                className={
                  "px-2 py-1 rounded-md border text-[11px] " +
                  (editorMode === "text"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-300")
                }
              >
                Plain text
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Editor */}
            <div className="space-y-1">
              <p className="text-[11px] text-slate-500">
                {editorMode === "html"
                  ? "Write HTML content or paste from your template builder."
                  : "Write plain text; it will be converted to basic HTML with line breaks."}
              </p>
              {editorMode === "html" ? (
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs h-40 font-mono"
                  placeholder="<h1>Hello</h1><p>Your content...</p>"
                />
              ) : (
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-xs h-40"
                  placeholder={"Hello,\nYour content..."}
                />
              )}
              <p className="text-[11px] text-slate-500">
                Include{" "}
                <code className="px-1 py-0.5 bg-slate-100 rounded">
                  {"{{unsubscribe_url}}"}
                </code>{" "}
                where the unsubscribe link should appear.
              </p>
            </div>

            {/* Preview */}
            <div className="border border-slate-200 rounded-md px-3 py-3 bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase text-slate-500">
                  Live preview
                </span>
              </div>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={previewMarkup}
              />
            </div>
          </div>
        </div>

        {/* Target type */}
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">
            Send to
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="targetType"
                value="category"
                checked={targetType === "category"}
                onChange={() => setTargetType("category")}
              />
              <span>Selected categories (doctor, shopkeeper, etc.)</span>
              {selectedCategoryCount > 0 && (
                <span className="text-[11px] text-slate-500">
                  · {selectedCategoryCount} selected
                </span>
              )}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="targetType"
                value="registered_users"
                checked={targetType === "registered_users"}
                onChange={() => setTargetType("registered_users")}
              />
              <span>Website users (registered)</span>
              {selectedRegisteredCount > 0 &&
                targetType === "registered_users" && (
                  <span className="text-[11px] text-slate-500">
                    · {selectedRegisteredCount} selected
                  </span>
                )}
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="targetType"
                value="upload_only"
                checked={targetType === "upload_only"}
                onChange={() => setTargetType("upload_only")}
              />
              <span>Upload-only list (Excel, one-time)</span>
              {uploadRecipients.length > 0 &&
                targetType === "upload_only" && (
                  <span className="text-[11px] text-slate-500">
                    · {uploadRecipients.length} recipients
                  </span>
                )}
            </label>
          </div>
        </div>

        {/* Category selection */}
        {targetType === "category" && (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Choose categories
            </label>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-500">
                No categories yet. Import from Excel first, or insert rows into{" "}
                <code className="px-1 bg-slate-100 rounded text-[10px]">
                  email_category
                </code>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 text-xs">
                {categories.map((cat) => {
                  const active = selectedCategoryIds.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id)}
                      className={
                        "px-3 py-1 rounded-full border transition-colors " +
                        (active
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50")
                      }
                    >
                      {cat.label || cat.slug}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Registered users selection */}
        {targetType === "registered_users" && (
          <div className="space-y-2 border border-slate-200 rounded-md px-3 py-3 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-slate-700">
                Registered users (Supabase Auth)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllRegistered}
                  className="px-2 py-1 border border-slate-300 rounded-md bg-white"
                  disabled={registeredLoading}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAllRegistered}
                  className="px-2 py-1 border border-slate-300 rounded-md bg-white"
                  disabled={registeredLoading}
                >
                  Clear
                </button>
              </div>
            </div>

            {registeredLoading ? (
              <p className="text-[11px] text-slate-600">
                Loading registered users…
              </p>
            ) : registeredUsers.length === 0 ? (
              <p className="text-[11px] text-slate-600">
                No registered users with email found.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-md bg-white">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Send</th>
                      <th className="px-2 py-1 text-left">Email</th>
                      <th className="px-2 py-1 text-left">Name</th>
                      <th className="px-2 py-1 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registeredUsers.map((u) => {
                      const lower = u.email.toLowerCase();
                      const selected = selectedRegisteredEmails.has(lower);
                      return (
                        <tr key={u.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              disabled={u.unsubscribed}
                              checked={selected && !u.unsubscribed}
                              onChange={() => toggleRegisteredEmail(u.email)}
                            />
                          </td>
                          <td className="px-2 py-1">{u.email}</td>
                          <td className="px-2 py-1">
                            {u.name || (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {u.unsubscribed ? (
                              <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] text-rose-700">
                                Unsubscribed
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-700">
                                Active
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Upload-only list */}
        {targetType === "upload_only" && (
          <div className="space-y-2 border border-slate-200 rounded-md px-3 py-3 bg-slate-50">
            <label className="block text-xs font-medium text-slate-700">
              Upload Excel for this campaign only
            </label>
            <p className="text-[11px] text-slate-500">
              Columns expected: <span className="font-medium">Email</span>,{" "}
              <span className="font-medium">Name</span>. Category is ignored for
              this mode.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleUploadOnlyFileChange}
              className="text-xs text-slate-700"
            />
            {uploadOnlyFile && (
              <p className="text-[11px] text-slate-600">
                Selected file:{" "}
                <span className="font-medium">{uploadOnlyFile.name}</span> ·
                parsed{" "}
                <span className="font-medium">{uploadRecipients.length}</span>{" "}
                recipients.
              </p>
            )}
          </div>
        )}

        {/* Send button */}
        <div className="pt-1">
          <button
            onClick={handleSendCampaign}
            disabled={sendLoading}
            className="inline-flex items-center px-4 py-2 rounded-md bg-emerald-600 text-white text-sm disabled:opacity-50"
          >
            {sendLoading ? "Sending…" : "Send campaign"}
          </button>
        </div>
      </section>
    </div>
  );
}
