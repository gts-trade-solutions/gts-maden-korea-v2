"use client";

import React, { useEffect, useState } from "react";

type Category = {
  id: string;
  label: string;
  slug: string;
};

type ContactCategory = {
  category: Category;
};

type Contact = {
  id: string;
  email: string;
  name?: string | null;
  is_registered: boolean;
  created_at: string;
  categories?: ContactCategory[];
  unsubscribed?: boolean;
};

type FilterType = "all" | "registered";

export default function ContactsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null);

  const fetchContacts = async (ft: FilterType) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/email/contacts?type=${ft}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load contacts");
      }
      setContacts(data.contacts || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts(filter);
  }, [filter]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter(e.target.value as FilterType);
  };

  const toggleUnsubscribe = async (contact: Contact) => {
    if (!contact.email) return;
    setUpdatingEmail(contact.email);
    try {
      const res = await fetch("/api/admin/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.email,
          unsubscribed: !contact.unsubscribed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      // Update client state
      setContacts((prev) =>
        prev.map((c) =>
          c.email === contact.email
            ? { ...c, unsubscribed: !contact.unsubscribed }
            : c
        )
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update status");
    } finally {
      setUpdatingEmail(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Email contacts
          </h1>
          <p className="text-sm text-slate-500">
            Imported contacts and website users, grouped by category.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">View:</span>
          <select
            value={filter}
            onChange={handleFilterChange}
            className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white"
          >
            <option value="all">All contacts</option>
            <option value="registered">Website users (registered)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-800 px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-600">Loading contacts…</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-slate-600">
          No contacts found. Try importing an Excel file from the Send Email
          page.
        </p>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full text-[12px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Email</th>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                <th className="px-3 py-2 text-left font-semibold">
                  Categories
                </th>
                <th className="px-3 py-2 text-left font-semibold">
                  Unsubscribed
                </th>
                <th className="px-3 py-2 text-left font-semibold">
                  Registered?
                </th>
                <th className="px-3 py-2 text-left font-semibold">Created</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const cats =
                  c.categories
                    ?.map((cc) => cc.category?.label || cc.category?.slug)
                    .filter(Boolean)
                    .join(", ") || "—";

                const createdDate = new Date(c.created_at).toLocaleString();

                const unsubLabel = c.unsubscribed ? "Unsubscribed" : "Active";
                const unsubColor = c.unsubscribed
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700";

                return (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 align-top">
                      <div className="text-[12px] text-slate-900">
                        {c.email}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {c.name ? (
                        <span className="text-[12px] text-slate-800">
                          {c.name}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-[11px] text-slate-700">
                        {cats}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => toggleUnsubscribe(c)}
                        disabled={updatingEmail === c.email}
                        className={
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium " +
                          unsubColor +
                          (updatingEmail === c.email
                            ? " opacity-70 cursor-wait"
                            : "")
                        }
                      >
                        {updatingEmail === c.email
                          ? "Updating…"
                          : unsubLabel}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {c.is_registered ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] text-emerald-700">
                          Yes
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">No</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-[11px] text-slate-500">
                      {createdDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
