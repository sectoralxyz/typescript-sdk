import { Transport } from "./transport.js";
import { SectoralError } from "./errors.js";
import { Accounts } from "./resources/accounts.js";
import { Agents } from "./resources/agents.js";
import { Transfers } from "./resources/transfers.js";
import { Webhooks } from "./resources/webhooks.js";

const DEFAULT_BASE_URL = "https://api.sectoral.xyz";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
// Reported in the User-Agent. Keep this in step with the version field in
// package.json; they are read by different tools and drift silently.
const SDK_VERSION = "0.2.0";

/** Which network a key operates against, worked out from its prefix. */
export type Environment = "live" | "test";

export interface SectoralOptions {
  /**
   * Your API key. `hc_live_` keys act on mainnet and `hc_test_` keys on the
   * Robinhood Chain testnet. Read it from the environment rather than typing
   * it into source, since a key alone is enough to move funds.
   */
  apiKey: string;
  /** Point the client at a different base URL. Defaults to `https://api.sectoral.xyz`. */
  baseUrl?: string;
  /** How long any single request may take, in milliseconds. Defaults to `30000`. */
  timeoutMs?: number;
  /**
   * How many further attempts a transient failure earns before the error is
   * handed back: a dropped connection, a `408`, a `429`, or any `5xx`. Waits
   * grow exponentially and defer to `Retry-After` when the server sends one.
   * Only requests that are safe to repeat qualify. Defaults to `2`; `0` turns
   * retrying off.
   */
  maxRetries?: number;
  /**
   * Supply your own `fetch`. Without one the client takes the runtime's
   * global, which Node 18+, browsers, and edge runtimes all provide.
   */
  fetch?: typeof fetch;
}

/**
 * The API client.
 *
 * ```ts
 * import { Sectoral } from "@sectoral/sdk";
 *
 * const sectoral = new Sectoral({ apiKey: process.env.SECTORAL_API_KEY! });
 * const transfer = await sectoral.transfers.create({ to: "@vendor", amount: "125.00" });
 * ```
 */
export class Sectoral {
  /** Account details, balances, and the agents beneath this account. */
  readonly accounts: Accounts;
  /** Sending money and looking up what was sent. */
  readonly transfers: Transfers;
  /** Standing up agent accounts and governing what they may spend. */
  readonly agents: Agents;
  /** Webhook subscriptions, and checking that a delivery is genuine. */
  readonly webhooks: Webhooks;

  /** Whether this key acts on `"live"` or on `"test"`. */
  readonly environment: Environment;

  constructor(options: SectoralOptions) {
    if (!options?.apiKey) {
      throw new SectoralError(
        "Missing API key. Pass one when creating the client: `new Sectoral({ apiKey })`.",
      );
    }

    this.environment = options.apiKey.startsWith("hc_test_") ? "test" : "live";

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new SectoralError(
        "No global `fetch` is available in this runtime. Upgrade to Node 18 or newer, or supply a `fetch` implementation.",
      );
    }

    const transport = new Transport({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES),
      fetch: fetchImpl,
      userAgent: `sectoral-sdk/${SDK_VERSION}`,
    });

    this.accounts = new Accounts(transport);
    this.transfers = new Transfers(transport);
    this.agents = new Agents(transport);
    this.webhooks = new Webhooks(transport);
  }
}
