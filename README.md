# Instagram Story Builder

Automated Instagram-style story rendering and Telegram publishing with two pipelines:

1. Browser manual send (rendered PNG + MP4 + poll)
2. Vercel cron automation (rendered GIF/PNG + poll)

## Core guarantees

1. Automation dedup uses exact story fingerprint (content type + headline + summary + poll + image URL).
2. Manual "Send to Telegram" always force-sends and is not blocked by local "already sent" checks.
3. Automation uses KV lock to prevent duplicate sends from overlapping runs.

## Environment variables

Required:

1. TELEGRAM_BOT_TOKEN
2. TELEGRAM_CHAT_ID
3. CRON_SECRET

Required for strict automation dedup:

1. KV_REST_API_URL + KV_REST_API_TOKEN
2. or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
3. or UPSTASH_REDIS_REST_REDIS_URL + UPSTASH_REDIS_REST_REDIS_TOKEN
4. or STORAGE_URL + STORAGE_TOKEN

If dedup storage is missing, automation returns `dedup_unavailable` and does not send.

## Local development

1. Install deps:

```bash
npm install
```

2. Run app:

```bash
npm run dev
```

3. Quality checks:

```bash
npm run lint
npm run build
```

## Automation endpoints

Protected by `CRON_SECRET`.

1. Normal run:

```text
/api/auto-send?secret=YOUR_CRON_SECRET
```

2. Dry-run (no Telegram send):

```text
/api/auto-send?secret=YOUR_CRON_SECRET&dryRun=1
```

3. Force run (manual only, bypass dedup):

```text
/api/auto-send?secret=YOUR_CRON_SECRET&force=1
```

## Health check

```text
/api/health
```

Use it to verify env status, dedup mode, and cron schedule metadata.

## Troubleshooting

1. Same story repeats in Telegram:
- Check `/api/health` -> `DEDUP_STORE` must be enabled.
- Use dry-run to inspect fingerprint and dedup behavior.

2. Manual send says already sent:
- Current behavior should never block manual sends. If seen, clear browser cache and redeploy latest build.

3. Animation missing in cron message:
- Cron tries GIF first, then static rendered PNG fallback.
- Check logs for GIF timeout/fallback messages.

4. Poll missing:
- Ensure at least two options separated by `|` in Google Sheets.

## Deployment notes

1. Vercel cron path: `/api/auto-send`
2. Current schedule target: 2:15 UTC (7:45 IST)
3. `api/auto-send.js` maxDuration should remain 60s on Hobby.
