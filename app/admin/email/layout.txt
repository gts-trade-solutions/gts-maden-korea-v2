"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

const navItems = [
  {
    label: "Dashboard",
    href: "/admin/email/dashboard",
  },
  {
    label: "Email list",
    href: "/admin/email/contacts",
  },
  {
    label: "Send email",
    href: "/admin/email",
  },
];

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="text-xs uppercase tracking-wide text-slate-400">
          Admin
        </div>
        <div className="mt-1 text-lg font-semibold">Email console</div>
      </div>

      <nav className="flex-1 py-3">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin/email" &&
                pathname?.startsWith(item.href));

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={[
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                    active
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "h-1.5 w-1.5 rounded-full",
                      active ? "bg-emerald-400" : "bg-slate-600",
                    ].join(" ")}
                  />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-500">
        <div className="font-medium text-slate-300">
          Email system
        </div>
        <div>Manage campaigns, contacts & tracking.</div>
      </div>
    </aside>
  );
}

export default function EmailAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex">
      <Sidebar />

      <main className="flex-1 flex flex-col">
        {/* Top bar */}
        <header className="h-14 border-b border-slate-200 bg-white flex items-center px-6">
          <div className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">
              Email administration
            </span>{" "}
            · manage campaigns & recipients
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
