// ═══════════════════════════════════════════════════════════════
//  Health Check Endpoint
//
//  GET /api/health → returns OK + config status
//  Use with UptimeRobot or similar to monitor the app.
// ═══════════════════════════════════════════════════════════════

export default function handler(req, res) {
  const hasToken = !!process.env.TELEGRAM_BOT_TOKEN;
  const hasChatId = !!process.env.TELEGRAM_CHAT_ID;
  const hasCronSecret = !!process.env.CRON_SECRET;
  const hasKvUrl = !!process.env.KV_REST_API_URL;
  const hasKvToken = !!process.env.KV_REST_API_TOKEN;
  const hasUpstashUrl = !!process.env.UPSTASH_REDIS_REST_URL;
  const hasUpstashToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
  const dedupEnabled = (hasKvUrl && hasKvToken) || (hasUpstashUrl && hasUpstashToken);

  const status = hasToken && hasChatId ? 'healthy' : 'misconfigured';

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    config: {
      TELEGRAM_BOT_TOKEN: hasToken ? '✅ set' : '❌ missing',
      TELEGRAM_CHAT_ID: hasChatId ? '✅ set' : '❌ missing',
      CRON_SECRET: hasCronSecret ? '✅ set' : '⚠ missing (cron unprotected)',
      KV_REST_API_URL: hasKvUrl ? '✅ set' : '⚠ missing (KV dedup disabled)',
      KV_REST_API_TOKEN: hasKvToken ? '✅ set' : '⚠ missing (KV dedup disabled)',
      UPSTASH_REDIS_REST_URL: hasUpstashUrl ? '✅ set' : '⚠ missing (Upstash dedup disabled)',
      UPSTASH_REDIS_REST_TOKEN: hasUpstashToken ? '✅ set' : '⚠ missing (Upstash dedup disabled)',
      DEDUP_STORE: dedupEnabled ? '✅ enabled' : '⚠ disabled',
    },
    cron: {
      schedule: '2:45 UTC (8:15 IST) daily',
      endpoint: '/api/auto-send',
    },
  });
}
