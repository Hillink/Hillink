import { NextRequest } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwardedFor.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const cfIp = req.headers.get("cf-connecting-ip")?.trim();
  return firstForwarded || realIp || cfIp || "unknown";
}

function nowMs(): number {
  return Date.now();
}

function compactExpiredBuckets(currentMs: number) {
  if (buckets.size < 5000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= currentMs) {
      buckets.delete(key);
    }
  }
}

export function applyRateLimit(params: {
  req: NextRequest;
  routeKey: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const ip = clientIp(params.req);
  const key = `${params.routeKey}:${ip}`;
  const currentMs = nowMs();

  compactExpiredBuckets(currentMs);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= currentMs) {
    const nextBucket: Bucket = {
      count: 1,
      resetAt: currentMs + params.windowMs,
    };
    buckets.set(key, nextBucket);

    return {
      ok: true,
      remaining: Math.max(0, params.limit - 1),
      retryAfterSeconds: Math.ceil(params.windowMs / 1000),
    };
  }

  existing.count += 1;
  buckets.set(key, existing);

  const remaining = Math.max(0, params.limit - existing.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - currentMs) / 1000));

  return {
    ok: existing.count <= params.limit,
    remaining,
    retryAfterSeconds,
  };
}
