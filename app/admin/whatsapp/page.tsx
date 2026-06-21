'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { AdminBackBar } from '@/components/admin/AdminBackBar';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  MessageCircle,
  Send,
  Users,
} from 'lucide-react';

type DashboardStats = {
  totalContacts: number;
  activeTemplates: number;
  totalCampaigns: number;
  runningCampaigns: number;
};

type DashboardCampaign = {
  id: string;
  name: string;
  status: string;
  total_target_count: number | null;
  created_at: string;
};

export default function WhatsappDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<DashboardCampaign[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      // 1) aggregate counts
      const [
        contactsRes,
        templatesRes,
        campaignsCountRes,
        runningCampaignsRes,
        recentCampaignsRes,
      ] = await Promise.all([
        supabase
          .from('whatsapp_contacts')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('whatsapp_templates')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('whatsapp_campaigns')
          .select('id', { count: 'exact', head: true }),
        supabase
          .from('whatsapp_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'running'),
        supabase
          .from('whatsapp_campaigns')
          .select(
            'id, name, status, total_target_count, created_at'
          )
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const totalContacts = contactsRes.count ?? 0;
      const activeTemplates = templatesRes.count ?? 0;
      const totalCampaigns = campaignsCountRes.count ?? 0;
      const runningCampaigns = runningCampaignsRes.count ?? 0;

      setStats({
        totalContacts,
        activeTemplates,
        totalCampaigns,
        runningCampaigns,
      });

      if (!recentCampaignsRes.error && recentCampaignsRes.data) {
        setRecentCampaigns(
          recentCampaignsRes.data as DashboardCampaign[]
        );
      }

      setLoading(false);
    }

    loadDashboard();
  }, []);

  return (
    <>
    <AdminBackBar title="WhatsApp Marketing" to="/admin" />
    <div className="container mx-auto py-6 space-y-6">
      {/* Top header + quick actions */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            WhatsApp Dashboard
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Overview of contacts, templates and campaigns for WhatsApp
            messaging.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="default">
            <Link href="/admin/whatsapp/campaigns/new">
              <Send className="mr-1 h-4 w-4" />
              New campaign
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/whatsapp/contacts">
              <Users className="mr-1 h-4 w-4" />
              Manage contacts
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/whatsapp/templates">
              <MessageCircle className="mr-1 h-4 w-4" />
              Templates
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="WhatsApp contacts"
          value={stats?.totalContacts ?? 0}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Active templates"
          value={stats?.activeTemplates ?? 0}
          icon={<MessageCircle className="h-4 w-4" />}
        />
        <StatCard
          label="Total campaigns"
          value={stats?.totalCampaigns ?? 0}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Running campaigns"
          value={stats?.runningCampaigns ?? 0}
          icon={<Send className="h-4 w-4" />}
        />
      </div>

      {/* Recent campaigns table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Recent campaigns
          </CardTitle>
          <Button asChild size="xs" variant="ghost">
            <Link href="/admin/whatsapp/campaigns">
              View all
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-xs text-muted-foreground">
              Loading…
            </p>
          ) : recentCampaigns.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No campaigns yet. Create your first WhatsApp
              campaign.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">
                      Target count
                    </th>
                    <th className="px-3 py-2 text-left">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCampaigns.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b last:border-0"
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/whatsapp/campaigns/${c.id}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {c.total_target_count ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </>
  );
}

/* --- Small helper components --- */

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();

  let variant: 'default' | 'outline' | 'destructive' = 'outline';
  let label = status;

  if (s === 'draft') {
    variant = 'outline';
  } else if (s === 'scheduled') {
    variant = 'default';
  } else if (s === 'running') {
    variant = 'default';
  } else if (s === 'completed') {
    variant = 'outline';
  } else if (s === 'failed') {
    variant = 'destructive';
  }

  return (
    <Badge variant={variant} className="text-[11px]">
      {label}
    </Badge>
  );
}
