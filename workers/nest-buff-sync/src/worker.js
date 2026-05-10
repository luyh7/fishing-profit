const CACHE_KEY = "nest-buff.json";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-allow-headers": "content-type",
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body, null, 2) + "\n", {
    ...init,
    headers: {
      ...jsonHeaders,
      "cache-control": "no-store",
      ...(init.headers || {}),
    },
  });
}

function errorResponse(message, status = 500) {
  return jsonResponse({ error: message }, { status });
}

async function readCachedNestBuff(env) {
  const cached = await env.NEST_BUFF_KV.get(CACHE_KEY);
  if (!cached) {
    return null;
  }

  return JSON.parse(cached.replace(/^\uFEFF/, ""));
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: jsonHeaders });
  }

  const url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "/health") {
    return jsonResponse({ ok: true, service: "fishing-profit-nest-buff" });
  }

  if (url.pathname === "/nest-buff.json" && ["GET", "HEAD"].includes(request.method)) {
    const payload = await readCachedNestBuff(env);
    if (!payload) {
      return errorResponse("Nest buff cache is empty", 503);
    }

    const body = request.method === "HEAD" ? null : JSON.stringify(payload, null, 2) + "\n";
    return new Response(body, {
      headers: {
        ...jsonHeaders,
        "cache-control": "public, max-age=60",
      },
    });
  }

  return errorResponse("Not found", 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error(error);
      return errorResponse(error.message || "Unexpected error");
    }
  },
};
