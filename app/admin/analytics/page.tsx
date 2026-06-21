'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, ShoppingCart, Users, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const salesData = [
  { month: 'Jan', revenue: 45000, orders: 120 },
  { month: 'Feb', revenue: 52000, orders: 145 },
  { month: 'Mar', revenue: 48000, orders: 132 },
  { month: 'Apr', revenue: 61000, orders: 168 },
  { month: 'May', revenue: 55000, orders: 151 },
  { month: 'Jun', revenue: 67000, orders: 189 },
  { month: 'Jul', revenue: 72000, orders: 203 },
  { month: 'Aug', revenue: 68000, orders: 195 },
  { month: 'Sep', revenue: 75000, orders: 215 },
  { month: 'Oct', revenue: 82000, orders: 234 },
];

const categoryData = [
  { name: 'Skincare', sales: 45000 },
  { name: 'Makeup', sales: 32000 },
  { name: 'Hair Care', sales: 28000 },
  { name: 'Body Care', sales: 21000 },
  { name: 'Accessories', sales: 15000 },
];

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { user, hasRole, logout } = useAuth();

  if (!hasRole('admin')) {
    router.push('/admin');
    return null;
  }

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin')}>
              ← Back
            </Button>
            <h1 className="text-2xl font-bold">Analytics & Reports</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">₹245,670</div>
              <p className="text-xs text-green-600 mt-1">+12.5% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">1,234</div>
              <p className="text-xs text-green-600 mt-1">+8.2% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">₹1,990</div>
              <p className="text-xs text-green-600 mt-1">+3.1% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">New Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">567</div>
              <p className="text-xs text-green-600 mt-1">+15.3% from last month</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Monthly revenue over the last 10 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => `₹${value.toLocaleString('en-IN')}`}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#8884d8"
                      fill="#8884d8"
                      fillOpacity={0.6}
                      name="Revenue (₹)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Orders Trend</CardTitle>
              <CardDescription>Number of orders per month</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="orders"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      name="Orders"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sales by Category</CardTitle>
              <CardDescription>Revenue breakdown by product category</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => `₹${value.toLocaleString('en-IN')}`}
                    />
                    <Legend />
                    <Bar dataKey="sales" fill="#8884d8" name="Sales (₹)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
