import { fromWire, toWire } from "./wire-format.js";
import {
  SectoralAPIError,
  SectoralConnectionError,
  type SectoralErrorCode,
} from "./errors.js";

export interface TransportOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof fetch;
  userAgent: string;
}

/** The trailing argument every resource method takes. */
export interface RequestConfig {
  /**
   * Cancel the call, and any retry still queued behind it, from your side.
   * Hand over the `signal` belonging to an `AbortController` you control.
   */
  signal?: AbortSignal;
  /** Use a different timeout for this one call than the client was built with. */
  timeoutMs?: number;
}

export interface RequestOptions extends RequestConfig {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** Body in camelCase; it goes out as snake_case JSON. */
  body?: unknown;
  /** Query parameters in camelCase; they go out as snake_case. */
  query?: Record<string, string | number | boolean | undefined>;
  /** Anything extra to put on the wire, `Idempotency-Key` for instance. */
  headers?: Record<string, string>;
  /**
   * Declares that repeating this non-GET call is harmless. Set it when the
   * request carries an idempotency key, which is what stops a replay from
   * taking effect twice.
   */
  idempotent?: boolean;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  error?: string;
}

/** The statuses where trying again is reasonable: timed out, throttled, or the server faltered. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export class Transport {
  private readonly options: TransportOptions;

  constructor(options: TransportOptions) {
    this.options = options;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    // Repeat only what is safe to repeat. GET and DELETE can be replayed as
    // often as you like; a POST is replayed solely when an idempotency key
    // makes the second attempt a no-op, since guessing wrong here would mean
    // sending someone's money twice.
    const retryable =
      options.method === "GET" ||
      options.method === "DELETE" ||
      options.idempotent === true;
    const maxAttempts = retryable ? this.options.maxRetries + 1 : 1;

    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await this.dispatch(options);
      } catch (cause) {
        // A call the caller cancelled is not a call worth retrying.
        if (attempt < maxAttempts && !options.signal?.aborted) {
          await sleep(backoffMs(attempt));
          continue;
        }
        throw cause;
      }

      if (
        !response.ok &&
        RETRYABLE_STATUSES.has(response.status) &&
        attempt < maxAttempts &&
        !options.signal?.aborted
      ) {
        // Empty the body first so the connection can be reused, then respect
        // whatever delay the server asked for.
        await response.text().catch(() => undefined);
        await sleep(retryAfterMs(response) ?? backoffMs(attempt));
        continue;
      }

      return this.handleResponse<T>(response);
    }
  }

  private async dispatch(options: RequestOptions): Promise<Response> {
    const url = this.buildUrl(options.path, options.query);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.options.userAgent,
      ...options.headers,
    };

    let payload: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(toWire(options.body));
    }

    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Wire the caller's signal to ours so a cancellation from either side
    // stops the fetch. AbortSignal.any expresses this in one line but wants
    // Node 20, and this package supports 18.
    const abortFromCaller = () => controller.abort();
    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    let response: Response;
    try {
      response = await this.options.fetch(url, {
        method: options.method,
        headers,
        body: payload,
        signal: controller.signal,
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        throw new SectoralConnectionError(
          timedOut
            ? `${options.path} timed out after ${timeoutMs}ms`
            : `${options.path} was aborted before completing`,
          cause,
        );
      }
      throw new SectoralConnectionError(
        `Request to ${options.path} failed: ${(cause as Error)?.message ?? "no details available"}`,
        cause,
      );
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }

    return response;
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const raw = await response.text();

    let parsed: unknown = undefined;
    if (raw.length > 0) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }

    if (!response.ok) {
      const errBody = (parsed ?? {}) as ApiErrorBody;
      throw new SectoralAPIError({
        status: response.status,
        code: (errBody.code as SectoralErrorCode) ?? "unknown_error",
        message:
          errBody.message ??
          errBody.error ??
          `Request failed with HTTP status ${response.status}`,
        body: parsed,
        requestId,
      });
    }

    return fromWire<T>(parsed);
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
  ): string {
    const url = new URL(path.replace(/^\//, ""), ensureTrailingSlash(this.options.baseUrl));
    if (query) {
      const wire = toWire<Record<string, unknown>>(query);
      for (const [key, value] of Object.entries(wire)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Doubling delay with jitter, roughly 500ms then 1s then 2s, never past 8s. */
function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** (attempt - 1), 8_000);
  return base * (0.75 + Math.random() * 0.5);
}

/** Read `Retry-After`, which may arrive as a count of seconds or as an HTTP date. */
function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }

  return undefined;
}
