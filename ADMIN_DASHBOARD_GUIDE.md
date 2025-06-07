# 🛡️ Admin Dashboard - API Management Guide

## 📋 Overview

This guide provides a complete implementation for an **Admin Dashboard** to manage API keys, monitor usage, and control access to your Trading AI Agent service.

## 🏗️ Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Dashboard                          │
├─────────────────────────────────────────────────────────────┤
│  🔑 API Key Management  │  📊 Usage Analytics  │  👥 Users  │
│  • Create Keys          │  • Rate Limits       │  • Roles   │
│  • Revoke Keys          │  • Quotas            │  • Access  │
│  • Update Permissions   │  • Request Logs      │  • Audit   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │   Trading AI API     │
                    │   Admin Endpoints    │
                    │   (Express.js)       │
                    └──────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │   MongoDB + Redis    │
                    │   (Data Storage)     │
                    └──────────────────────┘
```

## 🚀 Quick Setup

### **1. Admin Dashboard Client Library**

```typescript
// lib/adminApiClient.ts
export interface ApiKeyData {
  keyId: string;
  name: string;
  description?: string;
  type: "admin" | "trading" | "read_only" | "integration" | "webhook";
  status: "active" | "suspended" | "expired" | "revoked";
  permissions: string[];
  usage: {
    totalRequests: number;
    lastUsed?: string;
    dailyUsage: number;
    monthlyUsage: number;
  };
  quotas: {
    daily?: number;
    monthly?: number;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  userId?: string;
}

export interface CreateKeyRequest {
  name: string;
  description?: string;
  type: ApiKeyData["type"];
  permissions: string[];
  userId?: string;
  expiresAt?: string;
  quotas?: {
    daily?: number;
    monthly?: number;
  };
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
  ipWhitelist?: string[];
  allowedOrigins?: string[];
}

export class AdminApiClient {
  private baseUrl: string;
  private adminApiKey: string;

  constructor(baseUrl: string, adminApiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.adminApiKey = adminApiKey;

    if (!adminApiKey.startsWith("admin_")) {
      throw new Error("Admin API key required for dashboard access");
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "X-API-Key": this.adminApiKey,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ message: `HTTP ${response.status}` }));
        throw new Error(error.message || `Request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      console.error("Admin API request failed:", error);
      throw error;
    }
  }

  // === API KEY MANAGEMENT ===

  async listApiKeys(filters?: {
    type?: string;
    status?: string;
    userId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: { keys: ApiKeyData[]; pagination: any } }> {
    const params = new URLSearchParams(filters as any);
    return this.request(`/api/keys?${params}`);
  }

  async createApiKey(data: CreateKeyRequest): Promise<{
    data: { keyId: string; apiKey: string; name: string; type: string };
  }> {
    return this.request("/api/keys", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getApiKey(keyId: string): Promise<{ data: ApiKeyData }> {
    return this.request(`/api/keys/${keyId}`);
  }

  async updateKeyStatus(
    keyId: string,
    status: "active" | "suspended" | "revoked",
    reason?: string
  ): Promise<{ success: boolean }> {
    return this.request(`/api/keys/${keyId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status, reason }),
    });
  }

  async revokeApiKey(
    keyId: string,
    reason?: string
  ): Promise<{ success: boolean }> {
    return this.request(`/api/keys/${keyId}`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    });
  }

  // === USAGE ANALYTICS ===

  async getKeyUsage(keyId: string): Promise<{
    data: {
      currentRequests: number;
      remaining: number;
      resetTime: string;
      dailyUsage: number;
      monthlyUsage: number;
      recentRequests: Array<{
        timestamp: string;
        endpoint: string;
        ip: string;
      }>;
    };
  }> {
    return this.request(`/api/keys/${keyId}/usage`);
  }

  async resetKeyUsage(keyId: string): Promise<{ success: boolean }> {
    return this.request(`/api/keys/${keyId}/reset`, {
      method: "POST",
    });
  }

  async getSystemStats(): Promise<{
    data: {
      totalKeys: number;
      activeKeys: number;
      totalRequests: number;
      rateLimitHits: number;
      topUsers: Array<{ keyId: string; name: string; requests: number }>;
    };
  }> {
    return this.request("/api/admin/stats");
  }
}

// Create admin client
export function createAdminClient(): AdminApiClient {
  const baseUrl =
    process.env.NEXT_PUBLIC_TRADING_API_URL || process.env.TRADING_API_URL;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!baseUrl || !adminKey) {
    throw new Error(
      "Missing TRADING_API_URL or ADMIN_API_KEY environment variables"
    );
  }

  return new AdminApiClient(baseUrl, adminKey);
}
```

### **2. API Key Management Components**

#### **API Key List Component**

```tsx
// components/admin/ApiKeyList.tsx
"use client";

import { useState, useEffect } from "react";
import { AdminApiClient, ApiKeyData } from "../../lib/adminApiClient";

interface ApiKeyListProps {
  adminClient: AdminApiClient;
}

export function ApiKeyList({ adminClient }: ApiKeyListProps) {
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: "",
    status: "",
    search: "",
  });

  useEffect(() => {
    loadKeys();
  }, [filters]);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const response = await adminClient.listApiKeys(filters);
      setKeys(response.data.keys);
    } catch (error) {
      console.error("Failed to load API keys:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (keyId: string, status: string) => {
    try {
      await adminClient.updateKeyStatus(keyId, status as any);
      await loadKeys(); // Refresh list
    } catch (error) {
      console.error("Failed to update key status:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "suspended":
        return "bg-yellow-100 text-yellow-800";
      case "revoked":
        return "bg-red-100 text-red-800";
      case "expired":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleColor = (type: string) => {
    switch (type) {
      case "admin":
        return "bg-purple-100 text-purple-800";
      case "trading":
        return "bg-blue-100 text-blue-800";
      case "read_only":
        return "bg-gray-100 text-gray-800";
      case "integration":
        return "bg-indigo-100 text-indigo-800";
      case "webhook":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Type
            </label>
            <select
              value={filters.type}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, type: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="">All Types</option>
              <option value="admin">Admin</option>
              <option value="trading">Trading</option>
              <option value="read_only">Read Only</option>
              <option value="integration">Integration</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="revoked">Revoked</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
              placeholder="Search by name or description..."
              className="w-full rounded-md border-gray-300 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* API Keys Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Key Details
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Type & Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center">
                  Loading API keys...
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                  No API keys found
                </td>
              </tr>
            ) : (
              keys.map((key) => (
                <tr key={key.keyId}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {key.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {key.description || "No description"}
                      </div>
                      <div className="text-xs text-gray-400">
                        ID: {key.keyId}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(key.type)}`}
                      >
                        {key.type}
                      </span>
                      <br />
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(key.status)}`}
                      >
                        {key.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    <div>
                      <div>Daily: {key.usage.dailyUsage}</div>
                      <div>Monthly: {key.usage.monthlyUsage}</div>
                      <div>Total: {key.usage.totalRequests}</div>
                      {key.usage.lastUsed && (
                        <div className="text-xs text-gray-500">
                          Last:{" "}
                          {new Date(key.usage.lastUsed).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {key.status === "active" && (
                      <button
                        onClick={() =>
                          handleStatusChange(key.keyId, "suspended")
                        }
                        className="text-yellow-600 hover:text-yellow-900"
                      >
                        Suspend
                      </button>
                    )}
                    {key.status === "suspended" && (
                      <button
                        onClick={() => handleStatusChange(key.keyId, "active")}
                        className="text-green-600 hover:text-green-900"
                      >
                        Activate
                      </button>
                    )}
                    {key.status !== "revoked" && (
                      <button
                        onClick={() => handleStatusChange(key.keyId, "revoked")}
                        className="text-red-600 hover:text-red-900"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## 🔧 **Environment Setup for Admin Dashboard**

```bash
# .env.local (Admin Dashboard)
NEXT_PUBLIC_TRADING_API_URL=https://your-trading-api.com
ADMIN_API_KEY=admin_your_admin_key_here_64_characters_minimum
```

## 📋 **Admin Workflows**

### **Daily Admin Tasks:**

1. **Monitor API Usage** - Check for unusual patterns
2. **Review Rate Limits** - Adjust limits based on usage
3. **Manage Expired Keys** - Clean up or extend expiring keys
4. **User Support** - Help users with integration issues

### **Security Tasks:**

1. **Audit Key Usage** - Review access logs
2. **Rotate Admin Keys** - Regular key rotation
3. **Monitor Failed Requests** - Investigate authentication failures
4. **Update Permissions** - Adjust role permissions as needed

This gives you a complete admin dashboard foundation! The REST APIs are already there, so you can build the UI incrementally based on your needs.
