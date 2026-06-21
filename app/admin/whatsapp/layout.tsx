'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin/whatsapp', label: 'Dashboard' },
  { href: '/admin/whatsapp/contacts', label: 'Contacts' },
  { href: '/admin/whatsapp/templates', label: 'Templates' },
  { href: '/admin/whatsapp/campaigns', label: 'Campaigns' },
];

export default function WhatsappLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <aside className="w-64 border-r bg-muted/40">
        <div className="px-4 py-5 border-b">
          <h1 className="text-lg font-semibold">WhatsApp Campaigns</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Internal admin tools
          </p>
        </div>

        <nav className="mt-2 space-y-1 px-2">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-md px-3 py-2 text-sm font-medium hover:bg-muted',
                  active
                    ? 'bg-primary text-primary-foreground hover:bg-primary'
                    : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
