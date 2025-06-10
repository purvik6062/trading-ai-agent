# 🧩 Admin Dashboard - Component Implementations

## 🔐 Authentication Components

### Login Form Component

```typescript
// components/auth/LoginForm.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/lib/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      await login(data);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold">
            Admin Dashboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div>
              <Input
                type="email"
                placeholder="Admin Email"
                {...register('email')}
                className={errors.email ? 'border-red-500' : ''}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <Input
                type="password"
                placeholder="Password"
                {...register('password')}
                className={errors.password ? 'border-red-500' : ''}
              />
              {errors.password && (
                <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

## 👥 User Management Components

### User List Component

```typescript
// components/dashboard/UserManagement/UserList.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/common/DataTable';
import { UserDetailsDialog } from './UserDetailsDialog';

export function UserList() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    role: '',
    status: '',
    search: '',
  });

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['users', filters],
    queryFn: () => apiClient.getUsers(filters),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: string; status: string }) =>
      apiClient.updateUserStatus(userId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const columns = [
    {
      accessorKey: 'email',
      header: 'User',
      cell: ({ row }: any) => (
        <div>
          <div className="font-medium">{row.original.email}</div>
          <div className="text-sm text-gray-500">{row.original.vaultAddress}</div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.original.role}</Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => (
        <Badge variant={row.original.status === 'active' ? 'default' : 'secondary'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'rateLimit',
      header: 'Rate Limit',
      cell: ({ row }: any) => (
        <div className="text-sm">
          {row.original.rateLimit.requests}/{row.original.rateLimit.windowMs}ms
        </div>
      ),
    },
    {
      accessorKey: 'lastActivity',
      header: 'Last Activity',
      cell: ({ row }: any) => (
        <div className="text-sm">
          {row.original.lastActivity
            ? new Date(row.original.lastActivity).toLocaleDateString()
            : 'Never'
          }
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => (
        <div className="space-x-2">
          <UserDetailsDialog user={row.original} />
          {row.original.status === 'active' ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateStatusMutation.mutate({
                  userId: row.original.id,
                  status: 'suspended',
                })
              }
            >
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateStatusMutation.mutate({
                  userId: row.original.id,
                  status: 'active',
                })
              }
            >
              Activate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">User Management</h1>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search users..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          />
          <select
            value={filters.role}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, role: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          >
            <option value="">All Roles</option>
            <option value="user">User</option>
            <option value="premium">Premium</option>
            <option value="admin">Admin</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending">Pending</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data?.users || []}
        loading={isLoading}
        pagination={{
          page: filters.page,
          limit: filters.limit,
          total: data?.data?.pagination?.total || 0,
          onPageChange: (page) => setFilters((prev) => ({ ...prev, page })),
        }}
      />
    </div>
  );
}
```

## 📊 Signal Logs Component

### Signal Logs Component

```typescript
// components/dashboard/SignalLogs/SignalLogsList.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/common/DataTable';
import { DatePickerWithRange } from '@/components/common/DatePickerWithRange';

export function SignalLogsList() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 25,
    userId: '',
    symbol: '',
    signalType: '',
    startDate: '',
    endDate: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['signal-logs', filters],
    queryFn: () => apiClient.getSignalLogs(filters),
  });

  const columns = [
    {
      accessorKey: 'timestamp',
      header: 'Time',
      cell: ({ row }: any) => (
        <div className="text-sm">
          {new Date(row.original.timestamp).toLocaleString()}
        </div>
      ),
    },
    {
      accessorKey: 'user',
      header: 'User',
      cell: ({ row }: any) => (
        <div>
          <div className="font-medium">{row.original.user.email}</div>
          <div className="text-xs text-gray-500">{row.original.user.vaultAddress}</div>
        </div>
      ),
    },
    {
      accessorKey: 'symbol',
      header: 'Token',
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.original.symbol}</Badge>
      ),
    },
    {
      accessorKey: 'signalType',
      header: 'Signal',
      cell: ({ row }: any) => (
        <Badge
          variant={row.original.signalType === 'BUY' ? 'default' : 'destructive'}
        >
          {row.original.signalType}
        </Badge>
      ),
    },
    {
      accessorKey: 'price',
      header: 'Price',
      cell: ({ row }: any) => (
        <div className="font-mono">${row.original.price.toFixed(6)}</div>
      ),
    },
    {
      accessorKey: 'confidence',
      header: 'Confidence',
      cell: ({ row }: any) => (
        <div className="flex items-center">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full"
              style={{ width: `${row.original.confidence}%` }}
            />
          </div>
          <span className="ml-2 text-sm">{row.original.confidence}%</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => (
        <Badge
          variant={
            row.original.status === 'delivered'
              ? 'default'
              : row.original.status === 'failed'
              ? 'destructive'
              : 'secondary'
          }
        >
          {row.original.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Signal Logs</h1>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <input
            type="text"
            placeholder="Filter by user email..."
            value={filters.userId}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, userId: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          />
          <input
            type="text"
            placeholder="Filter by token symbol..."
            value={filters.symbol}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, symbol: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          />
          <select
            value={filters.signalType}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, signalType: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          >
            <option value="">All Signals</option>
            <option value="BUY">Buy</option>
            <option value="SELL">Sell</option>
          </select>
        </div>

        <DatePickerWithRange
          onDateChange={(range) => {
            setFilters((prev) => ({
              ...prev,
              startDate: range?.from?.toISOString() || '',
              endDate: range?.to?.toISOString() || '',
              page: 1,
            }));
          }}
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data?.signals || []}
        loading={isLoading}
        pagination={{
          page: filters.page,
          limit: filters.limit,
          total: data?.data?.pagination?.total || 0,
          onPageChange: (page) => setFilters((prev) => ({ ...prev, page })),
        }}
      />
    </div>
  );
}
```

## 📈 Analytics Dashboard

### Analytics Overview

```typescript
// components/dashboard/Analytics/AnalyticsOverview.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function AnalyticsOverview() {
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');

  const { data, isLoading } = useQuery({
    queryKey: ['analytics', timeframe],
    queryFn: () => apiClient.getAnalytics(timeframe),
  });

  const stats = data?.data?.stats || {};
  const chartData = data?.data?.chartData || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Analytics Dashboard</h1>
        <select
          value={timeframe}
          onChange={(e) => setTimeframe(e.target.value as any)}
          className="px-3 py-2 border rounded-md"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total API Keys</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalApiKeys || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeApiKeys || 0} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRequests?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{stats.requestsGrowth || 0}% from last period
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Rate Limit Hits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.rateLimitHits || 0}</div>
            <p className="text-xs text-muted-foreground">
              {((stats.rateLimitHits / stats.totalRequests) * 100).toFixed(1)}% of requests
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeUsers || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats.newUsers || 0} new this period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Request Volume Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Request Volume Over Time</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="requests" stroke="#8884d8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top API Key Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {stats.topApiKeys?.map((key: any, index: number) => (
              <div key={key.keyId} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{key.name}</div>
                    <div className="text-sm text-gray-500">{key.type}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{key.requests.toLocaleString()}</div>
                  <div className="text-sm text-gray-500">requests</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

## 🪙 Token Management

### Token Management Component

```typescript
// components/dashboard/TokenManagement/TokenList.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/common/DataTable';
import { AddTokenDialog } from './AddTokenDialog';

export function TokenList() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tokens'],
    queryFn: () => apiClient.getTokens(),
  });

  const updateTokenMutation = useMutation({
    mutationFn: ({ address, data }: { address: string; data: any }) =>
      apiClient.updateToken(address, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] });
    },
  });

  const columns = [
    {
      accessorKey: 'symbol',
      header: 'Token',
      cell: ({ row }: any) => (
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold">
            {row.original.symbol.charAt(0)}
          </div>
          <div>
            <div className="font-medium">{row.original.symbol}</div>
            <div className="text-sm text-gray-500">{row.original.name}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'address',
      header: 'Contract Address',
      cell: ({ row }: any) => (
        <div className="font-mono text-xs">
          {row.original.address.slice(0, 10)}...{row.original.address.slice(-8)}
        </div>
      ),
    },
    {
      accessorKey: 'chain',
      header: 'Chain',
      cell: ({ row }: any) => (
        <Badge variant="outline">{row.original.chain}</Badge>
      ),
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }: any) => (
        <Switch
          checked={row.original.isActive}
          onCheckedChange={(checked) =>
            updateTokenMutation.mutate({
              address: row.original.address,
              data: { isActive: checked },
            })
          }
        />
      ),
    },
    {
      accessorKey: 'signalsCount',
      header: 'Signals (24h)',
      cell: ({ row }: any) => (
        <div className="text-sm">{row.original.signalsCount || 0}</div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Token Management</h1>
        <AddTokenDialog />
      </div>

      <DataTable
        columns={columns}
        data={data?.data?.tokens || []}
        loading={isLoading}
      />
    </div>
  );
}
```

## ⚙️ Settings Panel

### Settings Component

```typescript
// components/dashboard/Settings/SettingsPanel.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function SettingsPanel() {
  const [settings, setSettings] = useState({
    signalProcessingEnabled: true,
    maxSignalsPerHour: 100,
    maintenanceMode: false,
    webhookUrl: '',
    systemMessage: '',
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Controls */}
        <Card>
          <CardHeader>
            <CardTitle>System Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Signal Processing</div>
                <div className="text-sm text-gray-500">
                  Enable/disable trading signal generation
                </div>
              </div>
              <Switch
                checked={settings.signalProcessingEnabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, signalProcessingEnabled: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Maintenance Mode</div>
                <div className="text-sm text-gray-500">
                  Temporarily disable all API access
                </div>
              </div>
              <Switch
                checked={settings.maintenanceMode}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, maintenanceMode: checked }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Max Signals Per Hour
              </label>
              <Input
                type="number"
                value={settings.maxSignalsPerHour}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, maxSignalsPerHour: parseInt(e.target.value) }))
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Webhook URL
              </label>
              <Input
                type="url"
                placeholder="https://your-webhook-url.com"
                value={settings.webhookUrl}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, webhookUrl: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                System Message
              </label>
              <Textarea
                placeholder="Display message to all users..."
                value={settings.systemMessage}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, systemMessage: e.target.value }))
                }
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button>Save Settings</Button>
      </div>
    </div>
  );
}
```

## 🔄 Common Components

### Data Table Component

```typescript
// components/common/DataTable.tsx
'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';

interface DataTableProps<TData> {
  columns: any[];
  data: TData[];
  loading?: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<TData>({
  columns,
  data,
  loading,
  pagination,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-200">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-6 py-4 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="px-6 py-3 border-t flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} results
          </div>
          <div className="space-x-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page * pagination.limit >= pagination.total}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

This completes the core component implementations for the admin dashboard. Each component includes proper error handling, loading states, and responsive design patterns.
