import { createHmac, timingSafeEqual } from "node:crypto";

export const routes = [
  "/v1/messages",
  "/v1/messages/count_tokens",
  "/v1/responses",
  "/v1/chat/completions",
] as const;

export function gatewayURL(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.pathname !== "/"
  ) {
    throw new Error("The gateway URL must be an HTTP(S) origin without credentials, a path, or a query.");
  }
  return url;
}

export function machineToken(secret: string, hostId: string): string {
  return `${hostId}.${createHmac("sha256", secret).update(hostId).digest("hex")}`;
}

export function tokenHost(secret: string, token: string): string | null {
  const match = /^(host_[a-zA-Z0-9_-]+)\.([a-f0-9]{64})$/.exec(token);
  if (!match) return null;
  const expected = Buffer.from(machineToken(secret, match[1]));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? match[1] : null;
}

interface GatewaySettings {
  gatewayUrl: string;
  gatewayKey: string;
  proxySecret: string;
}

const requestHeaders = [
  "accept",
  "content-type",
  "content-encoding",
  "anthropic-version",
  "anthropic-beta",
  "openai-beta",
  "session_id",
  "conversation_id",
  "x-session-id",
  "x-magpie-session",
  "x-session-affinity",
  "x-client-request-id",
];
const responseHeaders = ["content-type", "cache-control", "retry-after", "x-request-id"];

export function gatewayFailure(error: unknown): Response {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    const code = "code" in cause ? cause.code : undefined;
    if (cause.name === "TimeoutError" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "UND_ERR_BODY_TIMEOUT") {
      return Response.json({ error: { message: "Timed out waiting for the Magpie gateway response." } }, { status: 504 });
    }
  }
  return Response.json({ error: { message: "Cannot reach the Magpie gateway. Run bb magpie check." } }, { status: 502 });
}

/** Read a JSON body of at most `limit` bytes. The caller validates its shape. */
export async function readJson(
  response: Response,
  limit: number,
  label: string,
  Failure: new (message: string, options?: ErrorOptions) => Error = Error,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Failure(`${label} returned an empty response.`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Failure(`${label} response exceeds ${limit / 1024 / 1024} MiB.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (cause) {
    throw new Failure(`${label} returned invalid JSON.`, { cause });
  }
}

const stopping = () => Response.json({ error: { message: "Magpie connector is stopping." } }, { status: 503 });

export function createProxy(options: {
  settings: () => Promise<GatewaySettings>;
  enrolled: (hostId: string) => Promise<boolean>;
  onError: (error: unknown) => void;
}) {
  // Aborting the lifetime cancels every request, including one still waiting for settings or enrollment.
  const lifetime = new AbortController();
  return {
    dispose() {
      lifetime.abort();
    },
    async handle(
      request: Request,
      path: typeof routes[number],
      agent: "pi" | "codex" | "claude" = "pi",
    ): Promise<Response> {
      if (lifetime.signal.aborted) return stopping();
      const signal = AbortSignal.any([lifetime.signal, request.signal]);
      try {
        const settings = await options.settings();
        if (!settings.proxySecret) {
          return Response.json({ error: { message: "Reload the Magpie connector to create its signing key." } }, {
            status: 503,
          });
        }
        // Codex keeps its own Authorization header. BB sends the proxy token separately.
        const token = request.headers.get("x-bb-account-pool-token")
          ?? request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? request.headers.get("x-api-key") ?? "";
        const hostId = tokenHost(settings.proxySecret, token);
        if (!hostId || !await options.enrolled(hostId)) {
          return Response.json({ error: { message: "Invalid Magpie connector token." } }, { status: 401 });
        }
        const headers = new Headers();
        for (const name of requestHeaders) {
          const value = request.headers.get(name);
          if (value) headers.set(name, value);
        }
        headers.set("accept-encoding", "identity");
        const key = settings.gatewayKey || `magpie-${agent}`;
        headers.set("authorization", `Bearer ${key}`);
        headers.set("x-api-key", key);
        headers.set("user-agent", `${agent}/bb-magpie`);
        const upstreamURL = new URL(path, gatewayURL(settings.gatewayUrl));
        if (new URL(request.url).searchParams.get("beta") === "true") upstreamURL.searchParams.set("beta", "true");
        // Node fetch needs a repeatable body to return HTTP 401 without a transport error.
        const body = await request.arrayBuffer();
        // Compaction can take over a minute before headers arrive, so keep the HTTP client's timeouts.
        // The signal also ends the streamed body; a caller that cancels the body cancels the upstream read.
        const upstream = await fetch(upstreamURL, { method: "POST", headers, body, redirect: "manual", signal });
        const outgoing = new Headers();
        for (const name of responseHeaders) {
          const value = upstream.headers.get(name);
          if (value) outgoing.set(name, value);
        }
        return new Response(upstream.body, { status: upstream.status, headers: outgoing });
      } catch (error) {
        if (request.signal.aborted) return new Response(null, { status: 499 });
        if (lifetime.signal.aborted) return stopping();
        options.onError(error);
        return gatewayFailure(error);
      }
    },
  };
}
