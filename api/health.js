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

  const status = hasToken && hasChatId ? 'healthy' : 'misconfigured';

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    config: {
      TELEGRAM_BOT_TOKEN: hasToken ? '✅ set' : '❌ missing',
      TELEGRAM_CHAT_ID: hasChatId ? '✅ set' : '❌ missing',
      CRON_SECRET: hasCronSecret ? '✅ set' : '⚠ missing (cron unprotected)',
    },
    cron: {
      schedule: '2:45 UTC (8:15 IST) daily',
      endpoint: '/api/auto-send',
    },
  });
}
