'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LogOut, Download } from 'lucide-react';
import { toast } from 'sonner';

export default function VendorPayoutsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  if (!hasRole('vendor')) {
    router.push('/vendor');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  const handleDownloadStatement = () => {
    toast.info('Statement download coming soon');
  };

  const mockPayouts = [];

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/vendor')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Payouts</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8">
        <div className="grid gap-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹0</div>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Payout</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹0</div>
                <p className="text-xs text-muted-foreground mt-1">Next payout cycle</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">Last Payout</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">₹0</div>
                <p className="text-xs text-muted-foreground mt-1">-</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Payout History</CardTitle>
                <CardDescription>View your earnings and payout statements</CardDescription>
              </div>
              <Button variant="outline" onClick={handleDownloadStatement}>
                <Download className="mr-2 h-4 w-4" />
                Download Statement
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {mockPayouts.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No payouts yet</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Net Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No payout records found
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
