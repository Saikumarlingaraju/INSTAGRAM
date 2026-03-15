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
  const hasUpstashRedisUrl = !!process.env.UPSTASH_REDIS_REST_REDIS_URL;
  const hasUpstashRedisToken = !!process.env.UPSTASH_REDIS_REST_REDIS_TOKEN;
  const hasStorageUrl = !!process.env.STORAGE_URL || !!process.env.STORAGE_REDIS_URL;
  const hasStorageToken = !!process.env.STORAGE_TOKEN || !!process.env.STORAGE_REDIS_TOKEN;
  const dedupEnabled = (hasKvUrl && hasKvToken) || (hasUpstashUrl && hasUpstashToken);
  const dedupEnabledAny = dedupEnabled || (hasUpstashRedisUrl && hasUpstashRedisToken) || (hasStorageUrl && hasStorageToken);

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
      UPSTASH_REDIS_REST_REDIS_URL: hasUpstashRedisUrl ? '✅ set' : '⚠ missing',
      UPSTASH_REDIS_REST_REDIS_TOKEN: hasUpstashRedisToken ? '✅ set' : '⚠ missing',
      STORAGE_URL: hasStorageUrl ? '✅ set' : '⚠ missing',
      STORAGE_TOKEN: hasStorageToken ? '✅ set' : '⚠ missing',
      DEDUP_STORE: dedupEnabledAny ? '✅ enabled' : '⚠ disabled',
      DEDUP_MODE: 'exact_story_fingerprint_v2',
    },
    cron: {
      schedule: '2:15 UTC (7:45 IST) daily',
      endpoint: '/api/auto-send',
    },
    controls: {
      dryRun: '/api/auto-send?secret=CRON_SECRET&dryRun=1',
      forceSend: '/api/auto-send?secret=CRON_SECRET&force=1',
      notes: 'forceSend works only for authenticated manual requests',
    },
  });
}
