# Scalability & Performance Optimization Guide

This document outlines current architecture decisions and future optimization paths as the application scales.

## Current Architecture (Optimized for Single Instance)

### Deployment
- **Platform**: Coolify (single container)
- **Database**: Supabase (managed Postgres with built-in pooling)
- **Edge Functions**: Supabase (Deno runtime)
- **Static Assets**: Next.js standalone build

### In-Memory State
- **Concurrency guard**: `src/lib/server/bookings.ts` — prebookId deduplication
- **Search cache**: `supabase/functions/liteapi-search/index.ts` — 5-min TTL
- **Rate limiters**: Voucher validation, autocomplete (sliding window)

**Limitations**: Lost on server restart. Doesn't work across multiple instances.

---

## Scaling to Multiple Instances

### 1. Distributed Concurrency Control

**Problem**: In-memory `inflight` Set doesn't work with horizontal scaling (load balancer → multiple Next.js containers).

**Solutions**:

#### Option A: Redis-based Locking (Recommended)
```typescript
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
});

async function acquireLock(prebookId: string, ttl = 30000): Promise<boolean> {
  const key = `booking:lock:${prebookId}`;
  const acquired = await redis.set(key, '1', { nx: true, px: ttl });
  return !!acquired;
}

async function releaseLock(prebookId: string): Promise<void> {
  await redis.del(`booking:lock:${prebookId}`);
}
```

**Providers**:
- Upstash (serverless, pay-per-request)
- Redis Cloud (dedicated instance)
- AWS ElastiCache (if on AWS)

#### Option B: Database Unique Constraint
```sql
-- Migration: Add prebook_id column with unique constraint
ALTER TABLE bookings ADD COLUMN prebook_id TEXT UNIQUE;

-- Application handles duplicate key violations:
-- try { insert } catch (UniqueViolationError) { return "Already processed" }
```

**Tradeoff**: Requires DB migration. Simpler than Redis but adds DB load.

---

### 2. Connection Pooling Configuration

**Current**: Supabase handles pooling server-side (PgBouncer). Application creates clients on-demand.

**For High Traffic**:

```typescript
// src/utils/supabase/pool.ts
import { createClient } from '@supabase/supabase-js';

const pool = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    db: {
      schema: 'public',
    },
    auth: {
      persistSession: false, // Server-side: no session storage
    },
    global: {
      headers: {
        'x-connection-pool': 'server', // Custom header for monitoring
      },
    },
  }
);

// Reuse single client instance instead of creating per-request
export { pool as supabasePool };
```

**Monitoring**:
- Track `pg_stat_activity` for active connections
- Set alerts for > 80% pool utilization
- Supabase dashboard shows connection metrics

---

### 3. Caching Strategy (Redis/CDN)

**Current In-Memory Caches** (single-instance only):
- Hotel search results: 5min TTL (liteapi-search Edge Function)
- Rate limiters: 1min sliding windows

**Distributed Cache Migration**:

```typescript
// Shared cache for search results (all instances)
import { Redis } from '@upstash/redis';

async function getCachedSearch(params: SearchParams): Promise<SearchResult | null> {
  const cacheKey = `search:${hashParams(params)}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  return null;
}

async function setCachedSearch(params: SearchParams, results: SearchResult): Promise<void> {
  const cacheKey = `search:${hashParams(params)}`;
  await redis.set(cacheKey, JSON.stringify(results), { ex: 300 }); // 5min TTL
}
```

**CDN for Static Assets**:
- Add Cloudflare/Fastly in front of Next.js
- Cache `/api/autocomplete` responses (vary by query param)
- Cache static images with long TTL

---

### 4. Image Optimization

**Current**: Raw `<img>` tags → unoptimized, no lazy loading

**Migration**:
1. Use `OptimizedImage` component (`src/components/ui/OptimizedImage.tsx`)
2. Add LiteAPI domains to `next.config.mjs`:
   ```js
   images: {
     remotePatterns: [
       { protocol: "https", hostname: "api.liteapi.travel" },
       { protocol: "https", hostname: "*.liteapicdn.com" }, // If they use CDN
     ],
   }
   ```
3. Replace in priority order:
   - Landing page hero/deals (above fold)
   - Search results (property cards)
   - Property detail gallery
   - Booking cards in `/trips`

**Impact**: ~60% smaller image sizes (WebP/AVIF), better LCP scores.

---

### 5. Bundle Size Optimization

**Current Bundle** (estimate):
- framer-motion: ~60KB gzipped
- lucide-react: Auto tree-shakes (named imports)
- Next.js: Code-splits routes automatically

**Further Optimizations**:

#### A. Lazy Load Heavy Components
```typescript
// Landing page — defer non-critical sections
const PopularDestinations = dynamic(() => import('@/components/landing/PopularDestinations'), {
  loading: () => <SkeletonGrid />,
  ssr: false, // CSR-only if not needed for SEO
});
```

#### B. Dynamic Framer Motion Imports
```typescript
// Only import motion when animations are needed
const MotionDiv = dynamic(() => import('framer-motion').then(mod => mod.motion.div));
```

#### C. Bundle Analysis
```bash
# Add to package.json
"analyze": "ANALYZE=true next build"

# Visualize bundle with next-bundle-analyzer
pnpm add -D @next/bundle-analyzer
```

---

### 6. Database Query Optimization

**Current**: Standard Supabase queries. No specific bottlenecks identified.

**For Scale**:
- Add indexes on frequently queried columns:
  ```sql
  CREATE INDEX idx_bookings_user_checkin ON bookings(user_id, check_in);
  CREATE INDEX idx_bookings_status ON bookings(status) WHERE status != 'confirmed';
  ```
- Use `.explain()` on slow queries (Supabase Studio → SQL Editor)
- Consider materialized views for `/trips` page (if > 10k bookings per user)

---

### 7. API Rate Limiting (Production)

**Current**:
- Autocomplete: 20 req/min per IP (in-memory)
- Voucher validation: 10 req/min per user (in-memory)

**Distributed Rate Limiting**:
```typescript
import { Ratelimit } from '@upstash/ratelimit';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
  analytics: true, // Track rate limit hits
});

const { success } = await ratelimit.limit(clientIp);
if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
```

---

### 8. Monitoring & Observability

**Recommended Tools**:
- **APM**: Sentry (Next.js integration) or Datadog
- **Logs**: Betterstack (Coolify native) or Axiom
- **Metrics**: Prometheus + Grafana (self-hosted) or Vercel Analytics

**Key Metrics**:
- API response times (p50, p95, p99)
- Search cache hit rate
- Booking success rate
- Email delivery rate (from `email_logs` table)
- Database connection pool utilization

---

## Migration Checklist (Single → Multi-Instance)

- [ ] Set up Redis/Upstash account
- [ ] Migrate concurrency guard to Redis locks
- [ ] Migrate search cache to Redis
- [ ] Migrate rate limiters to Redis
- [ ] Add health check endpoint (`/api/health`)
- [ ] Configure load balancer with sticky sessions (optional)
- [ ] Update `NEXT_PUBLIC_SITE_URL` env var per environment
- [ ] Test webhook delivery across instances (ensure idempotency)
- [ ] Monitor database connection pool usage
- [ ] Set up APM/logging for distributed tracing

---

## Cost Optimization

**Current Stack** (estimate for 10k MAU):
- Coolify: ~$20/mo (VPS hosting)
- Supabase: Free tier → ~$25/mo (with usage)
- LiteAPI: Pay-per-booking
- Stripe: 2.9% + $0.30 per transaction

**Scaling Costs**:
- Redis (Upstash): ~$10/mo (10GB, 1M requests)
- Additional Next.js instances: +$20/mo per container
- CDN (Cloudflare): Free tier often sufficient
- Monitoring (Sentry): Free tier → ~$26/mo

**Total at 50k MAU**: ~$150-200/mo (before transaction fees)

---

## When to Scale

Trigger scaling when:
- Response times > 2s at p95
- CPU usage > 70% sustained
- Memory usage > 80%
- Database connections > 80% of pool
- Booking failures due to concurrency (check `booking_sessions` for duplicates)

Monitor via Coolify dashboard + Supabase metrics.
