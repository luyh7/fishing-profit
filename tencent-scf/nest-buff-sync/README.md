# Tencent SCF Nest Buff Sync

This Tencent Cloud Function fetches the latest nest buff JSON from:

```text
http://223.109.140.105:4158/
```

Then it writes the payload directly to Cloudflare Workers KV through the
Cloudflare API. The Worker continues to serve the cached value from:

```text
https://fishing-profit-nest-buff.470103427.workers.dev/nest-buff.json
```

Use this when Cloudflare Worker egress is blocked by the upstream source.

## Runtime

- Runtime: Node.js
- Handler: `index.main_handler`
- Memory: 128 MB is enough
- Timeout: 30 seconds

## Environment Variables

Configure these in Tencent Cloud Function:

```text
SOURCE_URL=http://223.109.140.105:4158/
FETCH_TIMEOUT_MS=15000
FORCE_IPV4=true
CLOUDFLARE_ACCOUNT_ID=<your Cloudflare account id>
CLOUDFLARE_KV_NAMESPACE_ID=232c1bd1fca14ba29b4da0d98509d327
CLOUDFLARE_API_TOKEN=<Cloudflare API token with Workers KV Storage Edit>
```

`CLOUDFLARE_API_TOKEN` is required for the KV API path. Do not
commit real tokens to git.

## Timer Trigger

Create a timer trigger for the function. Tencent Cloud SCF timer triggers use a
seven-field Cron expression: second, minute, hour, day, month, weekday, year.
A 10-minute interval is a good default:

```text
0 */10 * * * * *
```

## Deploy From Console

1. Open Tencent Cloud Serverless Cloud Function.
2. Create a function from scratch.
3. Select Node.js runtime.
4. Paste `index.mjs` into the console file.
5. Set the handler to `index.main_handler`.
6. Add the environment variables above.
7. Add the timer trigger.
8. Run a manual test and check the logs.

After a successful run, the Worker endpoint should return fresh data:

```text
https://fishing-profit-nest-buff.470103427.workers.dev/nest-buff.json
```
