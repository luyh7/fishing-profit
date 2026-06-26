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

function parseNestBuffPayload(text) {
  const quoteIntegerTokens = (value) => {
    let result = "";
    let index = 0;
    let inString = false;
    let escaped = false;

    while (index < value.length) {
      const char = value[index];
      if (inString) {
        result += char;
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        index += 1;
        continue;
      }

      if (char === '"') {
        inString = true;
        result += char;
        index += 1;
        continue;
      }

      if (char === "-" || (char >= "0" && char <= "9")) {
        const start = index;
        index += 1;
        while (/[0-9.eE+-]/.test(value[index] || "")) {
          index += 1;
        }
        const token = value.slice(start, index);
        result += /^-?(?:0|[1-9]\d*)$/.test(token)
          ? `"${token}"`
          : token;
        continue;
      }

      result += char;
      index += 1;
    }

    return result;
  };

  const normalizedText = String(text).replace(
    /("collections"\s*:\s*)\[([^\]]*)\]/g,
    (_match, prefix, body) => `${prefix}[${quoteIntegerTokens(body)}]`,
  );

  return JSON.parse(normalizedText);
}

async function readCachedNestBuff(env) {
  const cached = await env.NEST_BUFF_KV.get(CACHE_KEY);
  if (!cached) {
    return null;
  }

  return parseNestBuffPayload(cached.replace(/^\uFEFF/, ""));
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
