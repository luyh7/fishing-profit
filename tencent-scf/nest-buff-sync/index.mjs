import http from "node:http";
import https from "node:https";

const DEFAULT_SOURCE_URL = "http://223.109.140.105:4158/";
const DEFAULT_KV_KEY = "nest-buff.json";

function getConfig() {
  return {
    sourceUrl: process.env.SOURCE_URL || DEFAULT_SOURCE_URL,
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareKvNamespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    kvKey: process.env.CLOUDFLARE_KV_KEY || DEFAULT_KV_KEY,
    timeoutMs: Number(process.env.FETCH_TIMEOUT_MS || 15000),
    forceIpv4: process.env.FORCE_IPV4 !== "false",
  };
}

function assertNestBuffPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Unexpected payload shape: expected an object");
  }

  if (!Array.isArray(payload.locations)) {
    throw new Error("Unexpected payload shape: expected locations array");
  }
}

function request(url, options = {}, body = null) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  const timeoutMs = options.timeoutMs || 15000;

  return new Promise((resolve, reject) => {
    const req = client.request(
      target,
      {
        method: options.method || "GET",
        headers: options.headers || {},
        timeout: timeoutMs,
        family: options.forceIpv4 === false ? undefined : 4,
      },
      (res) => {
        const chunks = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks)
            .toString("utf8")
            .replace(/^\uFEFF/, "");
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            text,
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
    });
    req.on("error", reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

function formatError(error) {
  if (!error) {
    return "Unknown error";
  }

  const details = {
    name: error.name,
    message: error.message,
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    address: error.address,
    port: error.port,
  };

  if (Array.isArray(error.errors)) {
    details.errors = error.errors.map((innerError) => ({
      name: innerError.name,
      message: innerError.message,
      code: innerError.code,
      errno: innerError.errno,
      syscall: innerError.syscall,
      address: innerError.address,
      port: innerError.port,
    }));
  }

  return JSON.stringify(details);
}

async function requestWithRetries(
  url,
  options = {},
  body = null,
  attempts = 3,
) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request(url, options, body);
    } catch (error) {
      lastError = error;
      console.error(`Request failed, attempt ${attempt}/${attempts}`, {
        url,
        error: formatError(error),
      });
    }
  }

  throw new Error(
    `Request failed after ${attempts} attempts: ${url}: ${formatError(
      lastError,
    )}`,
  );
}

async function fetchSourcePayload(config) {
  const response = await requestWithRetries(config.sourceUrl, {
    timeoutMs: config.timeoutMs,
    forceIpv4: config.forceIpv4,
    headers: {
      accept: "application/json,text/plain,*/*",
      "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache",
      referer: config.sourceUrl,
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `Source returned HTTP ${response.statusCode}: ${response.text.slice(0, 300)}`,
    );
  }

  const payload = JSON.parse(response.text);
  assertNestBuffPayload(payload);
  return payload;
}

function normalizePayload(config, payload) {
  const now = new Date().toISOString();
  return {
    ...payload,
    updated_at: payload.updated_at || payload.update_at || now,
    synced_at: now,
    source_url: config.sourceUrl,
  };
}

async function pushToCloudflareKv(config, payload) {
  if (
    !config.cloudflareAccountId ||
    !config.cloudflareKvNamespaceId ||
    !config.cloudflareApiToken
  ) {
    throw new Error(
      "Missing Cloudflare KV environment variables: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID, CLOUDFLARE_API_TOKEN",
    );
  }

  const normalizedPayload = normalizePayload(config, payload);
  const body = JSON.stringify(normalizedPayload, null, 2);
  const key = encodeURIComponent(config.kvKey);
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/storage/kv/namespaces/${config.cloudflareKvNamespaceId}/values/${key}`;

  const response = await requestWithRetries(
    url,
    {
      method: "PUT",
      timeoutMs: config.timeoutMs,
      forceIpv4: config.forceIpv4,
      headers: {
        authorization: `Bearer ${config.cloudflareApiToken}`,
        "content-type": "application/json; charset=utf-8",
        "content-length": Buffer.byteLength(body),
      },
    },
    body,
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `Cloudflare KV API returned HTTP ${response.statusCode}: ${response.text.slice(0, 500)}`,
    );
  }

  const result = JSON.parse(response.text);
  if (!result.success) {
    throw new Error(`Cloudflare KV API failed: ${response.text.slice(0, 500)}`);
  }

  return {
    ok: true,
    locations: normalizedPayload.locations.length,
    updated_at: normalizedPayload.updated_at,
    synced_at: normalizedPayload.synced_at,
    target: "cloudflare-kv-api",
  };
}

async function runSync(event, context) {
  const config = getConfig();
  const startedAt = new Date().toISOString();

  console.log("Starting nest buff sync", {
    started_at: startedAt,
    source_url: config.sourceUrl,
    target: "cloudflare-kv-api",
    request_id: context && context.request_id,
    event,
  });

  const payload = await fetchSourcePayload(config);
  const result = await pushToCloudflareKv(config, payload);

  const summary = {
    ok: true,
    target: result.target,
    locations: result.locations,
    updated_at: result.updated_at,
    synced_at: result.synced_at,
  };

  console.log("Nest buff sync completed", summary);
  return summary;
}

export async function main_handler(event, context) {
  try {
    return await runSync(event, context);
  } catch (error) {
    const result = {
      ok: false,
      error: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : undefined,
    };

    console.error("Nest buff sync failed", result);
    return result;
  }
}
