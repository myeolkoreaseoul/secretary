import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter (resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60 * 1000; // 1 minute

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // chat-relay는 자체 RELAY_SECRET 검증 → x-api-key 검증 스킵
    if (request.nextUrl.pathname.includes('/chat-relay')) {
      return NextResponse.next();
    }

    const apiKey = request.headers.get('x-api-key');
    const expectedKey = process.env.API_SECRET_KEY;

    if (!expectedKey || apiKey !== expectedKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit per API key
    if (!checkRateLimit(apiKey)) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
