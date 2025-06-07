# 🚀 Next.js Integration Guide for Trading AI Agent API

## 📋 Prerequisites

1. **Obtain API Keys**: Contact your admin for API keys
2. **Environment Setup**: Configure secure environment variables
3. **Network Access**: Ensure your app can reach the Trading AI API

## 🔑 Step 1: Secure API Key Storage

### **Environment Variables (.env.local)**

```bash
# Trading AI Agent API Configuration
TRADING_API_URL=https://your-trading-api.com
TRADING_API_KEY=trading_abc123_def456789...  # Server-side only
NEXT_PUBLIC_TRADING_API_URL=https://your-trading-api.com  # Client-safe
```

⚠️ **Security Notes:**

- **NEVER** put API keys in `NEXT_PUBLIC_*` variables
- API keys should only be used server-side (API routes, server components)
- Use Next.js API routes as a proxy for client-side requests

## 🛡️ Step 2: Create API Client

### **lib/trading-api.ts**

```typescript
interface TradingAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  retryAfter?: number;
}

interface SignalRequest {
  message: string;
}

interface PositionsResponse {
  positions: Array<{
    tokenId: string;
    amount: number;
    value: number;
    pnl: number;
  }>;
  totalValue: number;
}

class TradingAPIClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey = apiKey;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<TradingAPIResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Trading API request failed:", error);
      throw error;
    }
  }

  // Send trading signal
  async sendSignal(message: string): Promise<TradingAPIResponse> {
    return this.request("/signal", {
      method: "POST",
      body: JSON.stringify({ message }),
    });
  }

  // Get current positions
  async getPositions(): Promise<TradingAPIResponse<PositionsResponse>> {
    return this.request("/positions");
  }

  // Get system health
  async getHealth(): Promise<TradingAPIResponse> {
    return this.request("/health");
  }

  // Get system configuration
  async getConfig(): Promise<TradingAPIResponse> {
    return this.request("/config");
  }
}

// Server-side client (with API key)
export function createServerTradingClient(): TradingAPIClient {
  const baseUrl = process.env.TRADING_API_URL;
  const apiKey = process.env.TRADING_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error(
      "Missing required environment variables: TRADING_API_URL, TRADING_API_KEY"
    );
  }

  return new TradingAPIClient(baseUrl, apiKey);
}

// Client-side client (no API key, uses Next.js API routes)
export function createClientTradingClient(): TradingAPIClient {
  const baseUrl = process.env.NEXT_PUBLIC_TRADING_API_URL || "/api/trading";
  return new TradingAPIClient(baseUrl, ""); // Empty key for client-side
}
```

## 🛠️ Step 3: Next.js API Routes (Proxy)

### **pages/api/trading/signal.ts** (or **app/api/trading/signal/route.ts** for App Router)

```typescript
// pages/api/trading/signal.ts (Pages Router)
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerTradingClient } from "../../../lib/trading-api";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    const client = createServerTradingClient();
    const result = await client.sendSignal(message);

    res.status(200).json(result);
  } catch (error) {
    console.error("Signal API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
```

```typescript
// app/api/trading/signal/route.ts (App Router)
import { NextRequest, NextResponse } from "next/server";
import { createServerTradingClient } from "../../../../lib/trading-api";

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message is required" },
        { status: 400 }
      );
    }

    const client = createServerTradingClient();
    const result = await client.sendSignal(message);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Signal API error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### **pages/api/trading/positions.ts**

```typescript
import type { NextApiRequest, NextApiResponse } from "next";
import { createServerTradingClient } from "../../../lib/trading-api";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const client = createServerTradingClient();
    const result = await client.getPositions();
    res.status(200).json(result);
  } catch (error) {
    console.error("Positions API error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
```

## 🎨 Step 4: React Components

### **components/TradingSignalForm.tsx**

```tsx
"use client";

import { useState } from "react";

interface TradingSignalFormProps {
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
}

export function TradingSignalForm({
  onSuccess,
  onError,
}: TradingSignalFormProps) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/trading/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const result = await response.json();

      if (result.success) {
        setMessage("");
        onSuccess?.(result);
      } else {
        onError?.(result.message || "Failed to send signal");
      }
    } catch (error) {
      onError?.("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="signal-message" className="block text-sm font-medium">
          Trading Signal Message
        </label>
        <textarea
          id="signal-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Enter trading signal (e.g., BUY WETH target $3500)"
          className="mt-1 block w-full rounded-md border px-3 py-2"
          rows={3}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading || !message.trim()}
        className="bg-blue-600 text-white px-4 py-2 rounded-md disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Signal"}
      </button>
    </form>
  );
}
```

### **components/PositionsList.tsx**

```tsx
"use client";

import { useEffect, useState } from "react";

interface Position {
  tokenId: string;
  amount: number;
  value: number;
  pnl: number;
}

export function PositionsList() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      const response = await fetch("/api/trading/positions");
      const result = await response.json();

      if (result.success) {
        setPositions(result.data.positions || []);
      } else {
        setError(result.message || "Failed to fetch positions");
      }
    } catch (err) {
      setError("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading positions...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Current Positions</h3>

      {positions.length === 0 ? (
        <p className="text-gray-500">No positions found</p>
      ) : (
        <div className="grid gap-4">
          {positions.map((position) => (
            <div key={position.tokenId} className="border rounded-lg p-4">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">{position.tokenId}</h4>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    position.pnl >= 0
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {position.pnl >= 0 ? "+" : ""}
                  {position.pnl.toFixed(2)}%
                </span>
              </div>
              <div className="mt-2 text-sm text-gray-600">
                <p>Amount: {position.amount}</p>
                <p>Value: ${position.value.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## 🔧 Step 5: Error Handling & Rate Limiting

### **lib/api-error-handler.ts**

```typescript
export interface APIError {
  code: string;
  message: string;
  retryAfter?: number;
}

export function handleAPIError(error: any): APIError {
  if (error.code === "RATE_LIMITED") {
    return {
      code: "RATE_LIMITED",
      message: `Rate limit exceeded. Try again in ${error.retryAfter} seconds.`,
      retryAfter: error.retryAfter,
    };
  }

  if (error.code === "INVALID_API_KEY") {
    return {
      code: "AUTH_ERROR",
      message: "Authentication failed. Please check your API key.",
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error.message || "An unexpected error occurred",
  };
}
```

## 📊 Step 6: Usage with React Query (Optional)

### **hooks/useTradingAPI.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: async () => {
      const response = await fetch("/api/trading/positions");
      const result = await response.json();
      if (!result.success) throw new Error(result.message);
      return result.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useSendSignal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch("/api/trading/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      // Refresh positions after successful signal
      queryClient.invalidateQueries({ queryKey: ["positions"] });
    },
  });
}
```

## 🚀 Step 7: Complete Page Example

### **pages/trading/dashboard.tsx**

```tsx
import { useState } from "react";
import { TradingSignalForm } from "../../components/TradingSignalForm";
import { PositionsList } from "../../components/PositionsList";

export default function TradingDashboard() {
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSignalSuccess = (result: any) => {
    setNotification({
      type: "success",
      message: `Signal sent successfully! ${result.signalsFound} signals processed.`,
    });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSignalError = (error: string) => {
    setNotification({
      type: "error",
      message: error,
    });
    setTimeout(() => setNotification(null), 5000);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-3xl font-bold">Trading Dashboard</h1>

      {notification && (
        <div
          className={`p-4 rounded-md ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {notification.message}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Send Trading Signal</h2>
          <TradingSignalForm
            onSuccess={handleSignalSuccess}
            onError={handleSignalError}
          />
        </div>

        <div>
          <PositionsList />
        </div>
      </div>
    </div>
  );
}
```

## ⚙️ Environment Setup Checklist

- [ ] Add API keys to `.env.local`
- [ ] Configure `TRADING_API_URL`
- [ ] Set up Next.js API routes as proxies
- [ ] Test API connectivity
- [ ] Implement error handling
- [ ] Add loading states
- [ ] Configure CORS if needed

## 🔒 Security Best Practices

1. **Never expose API keys client-side**
2. **Use Next.js API routes as proxies**
3. **Validate inputs on both client and server**
4. **Implement proper error handling**
5. **Add request timeout handling**
6. **Monitor API usage and rate limits**
7. **Use HTTPS in production**
8. **Rotate API keys regularly**
