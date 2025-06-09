# 🚀 Production Admin Dashboard - Complete Implementation Guide

## 📋 Project Overview

This guide provides a complete implementation blueprint for a production-ready Admin Dashboard to manage the Trading AI Agent system. The backend APIs are already implemented - this guide focuses on the frontend implementation.

## 🏗️ Tech Stack & Architecture

```
Frontend: Next.js 14 + TypeScript + Tailwind CSS
State Management: Zustand + React Query
UI Components: Shadcn/ui + Headless UI
Authentication: JWT + HTTP-only cookies
Charts: Recharts or Chart.js
Tables: TanStack Table v8
```

## 📁 Project Structure

```
admin-dashboard/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── layout.tsx
│   │   ├── (dashboard)/
│   │   │   ├── api-keys/
│   │   │   ├── users/
│   │   │   ├── signals/
│   │   │   ├── analytics/
│   │   │   ├── tokens/
│   │   │   ├── settings/
│   │   │   └── layout.tsx
│   │   ├── api/                      # API routes for SSR
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                       # Shadcn/ui components
│   │   ├── dashboard/
│   │   │   ├── ApiKeyManagement/
│   │   │   ├── UserManagement/
│   │   │   ├── SignalLogs/
│   │   │   ├── Analytics/
│   │   │   ├── TokenManagement/
│   │   │   └── Settings/
│   │   ├── auth/
│   │   ├── layout/
│   │   └── common/
│   ├── lib/
│   │   ├── api/                      # API client & endpoints
│   │   ├── auth/                     # Auth utilities
│   │   ├── stores/                   # Zustand stores
│   │   ├── utils/                    # Helper functions
│   │   └── validations/              # Zod schemas
│   ├── hooks/                        # Custom React hooks
│   ├── types/                        # TypeScript definitions
│   └── constants/                    # App constants
├── .env.local
├── .env.example
├── tailwind.config.js
├── next.config.js
└── package.json
```

## 🔐 Authentication Implementation

### Auth Store (Zustand)

```typescript
// lib/stores/authStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: string;
  email: string;
  role: "admin" | "super_admin";
  permissions: string[];
  name: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (credentials) => {
        set({ isLoading: true });
        try {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(credentials),
          });

          if (!response.ok) throw new Error("Login failed");

          const { user } = await response.json();
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        try {
          const response = await fetch("/api/auth/me");
          if (response.ok) {
            const { user } = await response.json();
            set({ user, isAuthenticated: true });
          } else {
            set({ user: null, isAuthenticated: false });
          }
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },
    }),
    { name: "auth-storage" }
  )
);
```

### Auth Middleware

```typescript
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verify } from "jsonwebtoken";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Public paths
  if (path.startsWith("/login") || path.startsWith("/api/auth/login")) {
    return NextResponse.next();
  }

  // Protected dashboard routes
  if (path.startsWith("/dashboard") || path.startsWith("/api/admin")) {
    const token = request.cookies.get("admin_token")?.value;

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      verify(token, process.env.JWT_SECRET!);
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/admin/:path*", "/login"],
};
```

## 📊 API Client Implementation

### Base API Client

```typescript
// lib/api/client.ts
class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // API Key Management
  async getApiKeys(params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    search?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/api/admin/keys?${query}`);
  }

  async createApiKey(data: {
    name: string;
    type: string;
    permissions: string[];
    expiresAt?: string;
    quotas?: { daily?: number; monthly?: number };
  }) {
    return this.request("/api/admin/keys", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateApiKeyStatus(keyId: string, status: string, reason?: string) {
    return this.request(`/api/admin/keys/${keyId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason }),
    });
  }

  // User Management
  async getUsers(params?: {
    page?: number;
    limit?: number;
    role?: string;
    status?: string;
    search?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/api/admin/users?${query}`);
  }

  async updateUserStatus(userId: string, status: string) {
    return this.request(`/api/admin/users/${userId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  // Signal Logs
  async getSignalLogs(params?: {
    page?: number;
    limit?: number;
    userId?: string;
    symbol?: string;
    signalType?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const query = new URLSearchParams(params as any).toString();
    return this.request(`/api/admin/signals?${query}`);
  }

  // Analytics
  async getAnalytics(timeframe: "24h" | "7d" | "30d" | "90d") {
    return this.request(`/api/admin/analytics?timeframe=${timeframe}`);
  }

  // Token Management
  async getTokens() {
    return this.request("/api/admin/tokens");
  }

  async updateToken(
    address: string,
    data: {
      symbol?: string;
      name?: string;
      isActive?: boolean;
    }
  ) {
    return this.request(`/api/admin/tokens/${address}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
```

## 🔑 API Key Management Components

### API Key List Component

```typescript
// components/dashboard/ApiKeyManagement/ApiKeyList.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/common/DataTable';
import { CreateApiKeyDialog } from './CreateApiKeyDialog';

export function ApiKeyList() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    type: '',
    status: '',
    search: '',
  });

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['api-keys', filters],
    queryFn: () => apiClient.getApiKeys(filters),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ keyId, status, reason }: {
      keyId: string;
      status: string;
      reason?: string;
    }) => apiClient.updateApiKeyStatus(keyId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const columns = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }: any) => (
        <div>
          <div className="font-medium">{row.original.name}</div>
          <div className="text-sm text-gray-500">{row.original.keyId}</div>
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }: any) => (
        <Badge variant={getTypeBadgeVariant(row.original.type)}>
          {row.original.type}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }: any) => (
        <Badge variant={getStatusBadgeVariant(row.original.status)}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'usage',
      header: 'Usage',
      cell: ({ row }: any) => (
        <div className="text-sm">
          <div>Daily: {row.original.usage.dailyUsage}</div>
          <div>Monthly: {row.original.usage.monthlyUsage}</div>
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }: any) => (
        <div className="space-x-2">
          {row.original.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateStatusMutation.mutate({
                  keyId: row.original.keyId,
                  status: 'suspended',
                })
              }
            >
              Suspend
            </Button>
          )}
          {row.original.status === 'suspended' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateStatusMutation.mutate({
                  keyId: row.original.keyId,
                  status: 'active',
                })
              }
            >
              Activate
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              updateStatusMutation.mutate({
                keyId: row.original.keyId,
                status: 'revoked',
              })
            }
          >
            Revoke
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">API Key Management</h1>
        <CreateApiKeyDialog />
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          />
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, type: e.target.value, page: 1 }))
            }
            className="px-3 py-2 border rounded-md"
          >
            <option value="">All Types</option>
            <option value="admin">Admin</option>
            <option value="trading">Trading</option>
            <option value="read_only">Read Only</option>
            <option value="integration">Integration</option>
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
            <option value="revoked">Revoked</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.data?.keys || []}
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

function getTypeBadgeVariant(type: string) {
  switch (type) {
    case 'admin': return 'destructive';
    case 'trading': return 'default';
    case 'read_only': return 'secondary';
    case 'integration': return 'outline';
    default: return 'secondary';
  }
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'active': return 'default';
    case 'suspended': return 'outline';
    case 'revoked': return 'destructive';
    default: return 'secondary';
  }
}
```

## 📋 Key Implementation Requirements

### 1. Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://your-trading-api.com
JWT_SECRET=your-jwt-secret-minimum-32-characters
ADMIN_EMAIL=admin@yourcompany.com
```

### 2. Package Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.0.0",
    "@tanstack/react-query": "^5.0.0",
    "zustand": "^4.4.0",
    "@radix-ui/react-*": "latest",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "recharts": "^2.8.0",
    "date-fns": "^3.0.0",
    "zod": "^3.22.0",
    "react-hook-form": "^7.48.0",
    "@hookform/resolvers": "^3.3.0"
  }
}
```

### 3. Critical Features to Implement

**Security:**

- JWT token refresh mechanism
- Role-based access control per component
- CSRF protection
- Input validation with Zod

**User Experience:**

- Loading states for all async operations
- Error boundaries and toast notifications
- Responsive design (mobile-first)
- Keyboard navigation support

**Data Management:**

- Real-time updates with React Query
- Optimistic updates where appropriate
- Pagination with URL state
- Export functionality for logs/analytics

**Production Features:**

- Error logging and monitoring
- Performance monitoring
- SEO optimization
- Progressive Web App capabilities

This implementation guide provides a complete foundation for building a production-ready admin dashboard. Each component should be implemented with proper error handling, loading states, and responsive design.

The modular structure allows for incremental development - start with authentication and API key management, then progressively add other features.
