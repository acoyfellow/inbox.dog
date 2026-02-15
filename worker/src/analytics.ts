import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

type EventName =
  | 'key_created'
  | 'key_deleted'
  | 'oauth_started'
  | 'oauth_completed'
  | 'oauth_error'
  | 'token_exchanged'
  | 'token_refreshed'
  | 'checkout_started'
  | 'credits_purchased'
  | 'rate_limited'
  | 'error';

interface TrackPayload {
  event: EventName;
  clientId?: string;
  meta?: Record<string, string | number>;
}

// Key format: "evt:{event}:{YYYY-MM-DD}" for daily counters
// Per-client: "client:{clientId}:{event}:{YYYY-MM-DD}"
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export class AnalyticsDO extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/track' && request.method === 'POST') {
      return this.handleTrack(request);
    }

    if (url.pathname === '/stats' && request.method === 'GET') {
      return this.handleStats(url);
    }

    return new Response('Not found', { status: 404 });
  }

  private async handleTrack(request: Request): Promise<Response> {
    const payload = (await request.json()) as TrackPayload;
    const { event, clientId } = payload;
    const day = dayKey();

    // Increment global daily counter
    const globalKey = `evt:${event}:${day}`;
    const current = ((await this.ctx.storage.get<number>(globalKey)) ?? 0) + 1;
    await this.ctx.storage.put(globalKey, current);

    // Increment global all-time counter
    const totalKey = `total:${event}`;
    const total = ((await this.ctx.storage.get<number>(totalKey)) ?? 0) + 1;
    await this.ctx.storage.put(totalKey, total);

    // Increment per-client counter if clientId provided
    if (clientId) {
      const clientKey = `client:${clientId}:${event}:${day}`;
      const clientCount = ((await this.ctx.storage.get<number>(clientKey)) ?? 0) + 1;
      await this.ctx.storage.put(clientKey, clientCount);

      // Track unique clients seen today
      const activeKey = `active:${day}`;
      const activeClients = (await this.ctx.storage.get<string[]>(activeKey)) ?? [];
      if (!activeClients.includes(clientId)) {
        activeClients.push(clientId);
        await this.ctx.storage.put(activeKey, activeClients);
      }
    }

    return new Response('ok');
  }

  private async handleStats(url: URL): Promise<Response> {
    const days = parseInt(url.searchParams.get('days') ?? '7', 10);
    const clientId = url.searchParams.get('client_id');

    // Build date range
    const dates: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    const events: EventName[] = [
      'key_created', 'key_deleted', 'oauth_started', 'oauth_completed',
      'oauth_error', 'token_exchanged', 'token_refreshed',
      'checkout_started', 'credits_purchased', 'rate_limited', 'error',
    ];

    // Fetch all-time totals
    const totals: Record<string, number> = {};
    for (const event of events) {
      totals[event] = (await this.ctx.storage.get<number>(`total:${event}`)) ?? 0;
    }

    // Fetch daily breakdown
    const daily: Record<string, Record<string, number>> = {};
    for (const date of dates) {
      daily[date] = {};
      for (const event of events) {
        const key = clientId
          ? `client:${clientId}:${event}:${date}`
          : `evt:${event}:${date}`;
        const val = (await this.ctx.storage.get<number>(key)) ?? 0;
        if (val > 0) {
          daily[date]![event] = val;
        }
      }
      // Add active client count
      if (!clientId) {
        const activeClients = (await this.ctx.storage.get<string[]>(`active:${date}`)) ?? [];
        if (activeClients.length > 0) {
          daily[date]!['active_clients'] = activeClients.length;
        }
      }
    }

    // Compute conversion rate: oauth_completed / oauth_started
    const oauthStarted = totals['oauth_started'] ?? 0;
    const oauthCompleted = totals['oauth_completed'] ?? 0;
    const conversionRate = oauthStarted > 0
      ? Math.round((oauthCompleted / oauthStarted) * 1000) / 10
      : 0;

    return new Response(
      JSON.stringify({
        totals,
        daily,
        computed: {
          oauth_conversion_pct: conversionRate,
          total_revenue_cents: (totals['token_exchanged'] ?? 0) * 10,
        },
        ...(clientId ? { client_id: clientId } : {}),
        period_days: days,
        generated_at: new Date().toISOString(),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Lightweight fire-and-forget helper for route handlers
export function trackEvent(
  analyticsStub: DurableObjectStub,
  event: EventName,
  clientId?: string,
  meta?: Record<string, string | number>,
): void {
  // Fire and forget — don't await, don't block the response
  analyticsStub.fetch(new Request('https://analytics/track', {
    method: 'POST',
    body: JSON.stringify({ event, clientId, meta }),
  })).catch(() => {
    // Analytics should never break the main flow
  });
}

// Get the singleton analytics DO stub
export function getAnalytics(env: Env): DurableObjectStub {
  const id = env.ANALYTICS.idFromName('singleton');
  return env.ANALYTICS.get(id);
}
