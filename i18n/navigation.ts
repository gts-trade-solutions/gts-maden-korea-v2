// Locale-aware navigation primitives. Components import `Link`,
// `useRouter`, `redirect`, etc. from here instead of `next/link` /
// `next/navigation` — these versions automatically prepend the
// active locale prefix when navigating, and strip it when needed.
//
// Pattern follows next-intl v4 docs: createNavigation returns
// drop-in replacements for the Next.js primitives.

import { createNavigation } from "next-intl/navigation";
import { routing } from "@/i18n/routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
