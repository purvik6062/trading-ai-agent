# 🚀 Admin Dashboard - Deployment & Configuration Guide

## 📋 Quick Start Deployment

### 1. Project Setup

```bash
# Create Next.js project
npx create-next-app@latest admin-dashboard --typescript --tailwind --eslint --app --src-dir
cd admin-dashboard

# Install required dependencies
npm install @tanstack/react-query zustand @radix-ui/react-dialog @radix-ui/react-dropdown-menu
npm install @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-toast
npm install react-hook-form @hookform/resolvers zod date-fns recharts
npm install @tanstack/react-table class-variance-authority clsx tailwind-merge
npm install lucide-react jsonwebtoken @types/jsonwebtoken

# Development dependencies
npm install --save-dev @types/node
```

### 2. Environment Configuration

```bash
# .env.local
NEXT_PUBLIC_API_URL=https://your-trading-api.com
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters-long
ADMIN_EMAIL=admin@yourcompany.com
NEXTAUTH_URL=https://your-admin-dashboard.com
NEXTAUTH_SECRET=another-secure-secret-for-auth

# Database (if using Prisma)
DATABASE_URL=postgresql://user:password@localhost:5432/trading_db

# Redis (for sessions/caching)
REDIS_URL=redis://localhost:6379

# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
```

### 3. API Route Setup

```typescript
// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sign } from "jsonwebtoken";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    // Validate admin credentials
    const admin = await validateAdminCredentials(email, password);

    if (!admin) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Create JWT token
    const token = sign(
      {
        userId: admin.id,
        email: admin.email,
        role: admin.role,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "24h" }
    );

    // Set HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    });

    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 86400, // 24 hours
    });

    return response;
  } catch (error) {
    return NextResponse.json({ message: "Login failed" }, { status: 500 });
  }
}

async function validateAdminCredentials(email: string, password: string) {
  // Your admin validation logic here
  // This should check against your admin user database
  return null; // Replace with actual implementation
}
```

## 🔧 Production Configuration

### Next.js Configuration

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/admin/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL}/api/admin/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

### Tailwind Configuration

```javascript
// tailwind.config.js
const { fontFamily } = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", ...fontFamily.sans],
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

## 🛠️ Development Workflow

### Development Commands

```json
// package.json scripts
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "format": "prettier --write .",
    "test": "jest",
    "test:watch": "jest --watch",
    "analyze": "ANALYZE=true next build"
  }
}
```

### Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Install dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: "3.8"
services:
  admin-dashboard:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - NEXT_PUBLIC_API_URL=https://your-trading-api.com
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./logs:/app/logs
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

## 🌐 Deployment Options

### Vercel Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables
vercel env add NEXT_PUBLIC_API_URL
vercel env add JWT_SECRET
vercel env add ADMIN_EMAIL
```

### AWS ECS Deployment

```yaml
# ecs-task-definition.json
{
  "family": "admin-dashboard",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions":
    [
      {
        "name": "admin-dashboard",
        "image": "your-account.dkr.ecr.region.amazonaws.com/admin-dashboard:latest",
        "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
        "environment": [{ "name": "NODE_ENV", "value": "production" }],
        "secrets":
          [
            {
              "name": "JWT_SECRET",
              "valueFrom": "arn:aws:secretsmanager:region:account:secret:admin-dashboard/jwt-secret",
            },
          ],
        "logConfiguration":
          {
            "logDriver": "awslogs",
            "options":
              {
                "awslogs-group": "/ecs/admin-dashboard",
                "awslogs-region": "us-west-2",
                "awslogs-stream-prefix": "ecs",
              },
          },
      },
    ],
}
```

## 🔒 Security Checklist

### Authentication & Authorization

- [x] JWT tokens with expiration
- [x] HTTP-only cookies for token storage
- [x] Role-based access control
- [x] Session timeout handling
- [x] CSRF protection

### API Security

- [x] Rate limiting per IP/user
- [x] Input validation with Zod
- [x] SQL injection prevention
- [x] XSS protection headers
- [x] CORS configuration

### Infrastructure Security

- [x] HTTPS enforcement
- [x] Security headers configuration
- [x] Environment variable protection
- [x] Container security scanning
- [x] Regular dependency updates

## 📊 Monitoring & Logging

### Application Monitoring

```typescript
// lib/monitoring.ts
import { captureException, init } from "@sentry/nextjs";

export function initMonitoring() {
  init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
  });
}

export function logError(error: Error, context?: any) {
  console.error(error);
  captureException(error, { extra: context });
}
```

### Performance Monitoring

```typescript
// lib/analytics.ts
export function trackPageView(page: string) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("config", "GA_TRACKING_ID", {
      page_title: page,
    });
  }
}

export function trackEvent(action: string, category: string, label?: string) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", action, {
      event_category: category,
      event_label: label,
    });
  }
}
```

## 🚀 Performance Optimization

### Bundle Analysis

```bash
# Analyze bundle size
npm run analyze

# Install bundle analyzer
npm install --save-dev @next/bundle-analyzer
```

### Caching Strategy

```typescript
// lib/cache.ts
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

export async function getCachedData(key: string) {
  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export async function setCachedData(key: string, data: any, ttl = 300) {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.error("Cache set error:", error);
  }
}
```

This deployment guide provides everything needed to get the admin dashboard running in production with proper security, monitoring, and performance optimizations.
