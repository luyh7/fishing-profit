# Nest Buff Cloudflare Worker

This Worker serves the latest nest buff JSON from Workers KV at:

```text
https://<your-worker-host>/nest-buff.json
```

The Worker is read-only at runtime. It only serves cached JSON and a health
check; the sync job writes directly to Cloudflare KV with the API token.

## Worker Setup

1. Install dependencies:

```bash
npm install
```

2. Log in to Cloudflare:

```bash
npx wrangler login
```

3. Create KV namespaces:

```bash
npx wrangler kv namespace create NEST_BUFF_KV
npx wrangler kv namespace create NEST_BUFF_KV --preview
```

4. Copy the returned `id` and `preview_id` into `wrangler.jsonc`.

5. Deploy:

```bash
npm run deploy
```

6. Point the app at the deployed Worker:

```js
nestBuffSourceUrl: "https://<your-worker-host>/nest-buff.json",
```

## Sync Source

The upstream JSON at `http://223.109.140.105:4158/` is fetched by the Tencent
Cloud Function in `../../tencent-scf/nest-buff-sync` and written directly to
Cloudflare KV using the Cloudflare API token.

## Endpoints

- `GET /nest-buff.json`: returns the cached JSON for the web app.
- `HEAD /nest-buff.json`: checks that the cache exists without returning the body.
- `GET /health`: returns a basic health response.
