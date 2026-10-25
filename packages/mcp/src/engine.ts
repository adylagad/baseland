// A thin client for the Baseland engine's HTTP API. The engine owns every
// rule (Leash, Ghost, approval); this only carries requests and errors.

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "EngineError";
  }
}

export interface Engine {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

export function engineClient(opts: {
  baseUrl: string;
  /** A bearer token for each request: a harness token or a Supabase JWT. */
  token: () => Promise<string>;
  fetch?: typeof fetch;
}): Engine {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { authorization: `Bearer ${await opts.token()}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    let res: Response;
    try {
      res = await doFetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        // The free Render instance can take about a minute to wake.
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      throw new EngineError(`Couldn't reach the Baseland engine at ${base} (${(err as Error).message}).`, 0);
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const err = (json ?? {}) as { error?: string; details?: unknown };
      const message =
        res.status === 401
          ? "Not signed in: the Baseland token was revoked, replaced or mistyped. Make a new one in the app (Rig → Account → Claude Code) and run pnpm connect-claude again."
          : (err.error ?? (res.status >= 500 ? "The engine is waking up or failed; try again shortly." : `HTTP ${res.status}`));
      throw new EngineError(message, res.status, err.details);
    }
    return json as T;
  }

  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
  };
}
