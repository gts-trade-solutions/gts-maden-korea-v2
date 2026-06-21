"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./NotificationBell";

// Sticky-top header bar with a left "← Back" button + page title and
// an optional right slot for actions (Refresh, Save, etc.). Used as
// the consistent navigation chrome on admin sub-pages so admins can
// always get back to /admin (or a parent route) without using the
// browser back button.
//
// Match the existing pattern in /admin/settings/currencies and
// /admin/international-orders — these were built first; this
// component is a refactor for everywhere else.

type Props = {
  /** Where the back button navigates. Defaults to /admin. */
  to?: string;
  title: string;
  /** Optional content rendered at the right edge (Refresh, Save, etc.). */
  rightSlot?: ReactNode;
};

export function AdminBackBar({ to = "/admin", title, rightSlot }: Props) {
  const router = useRouter();
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push(to)}>
            ← Back
          </Button>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {rightSlot}
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
