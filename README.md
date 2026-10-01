<p align="center">
  <img src="https://sectoral.xyz/images/logo-bg.png" alt="Sectoral" width="88" height="88">
</p>

<h1 align="center">@sectoralxyz/typescript-sdk</h1>

<p align="center">
  <a href="https://sectoral.xyz">sectoral.xyz</a> &nbsp;·&nbsp;
  <a href="https://docs.sectoral.xyz">Docs</a> &nbsp;·&nbsp;
  <a href="https://x.com/sectoralxyz">@sectoralxyz</a>
</p>

The official TypeScript client for [Sectoral](https://sectoral.xyz). On Sectoral, people and the software acting for them keep accounts next to each other, and every amount that passes between them remains encrypted.

This package is a thin, fully typed wrapper around the REST API. Use it to read accounts, send confidential payments, give an agent a wallet whose limits the chain enforces, and receive webhook deliveries you can verify really came from Sectoral.

> In beta. The API shape is stable but may still change. Lock to a specific version and check the changelog before upgrading.

## Installation

```bash
npm install @sectoralxyz/typescript-sdk
```

Requires Node 18 or later, the first release with global `fetch` and Web Crypto. It also runs in browsers and edge runtimes, but never ship a live key to a browser.

## Your first transfer

```ts
import { Sectoral } from "@sectoralxyz/typescript-sdk";

const sectoral = new Sectoral({ apiKey: process.env.SECTORAL_API_KEY! });

// The amount is stored encrypted on-chain. The response confirms settlement
// and deliberately leaves out the amount you sent.
const transfer = await sectoral.transfers.create({
  to: "@vendor",
  amount: "125.00",
  asset: "USDG",
  memo: "Invoice #4471",
});

console.log(transfer.status, transfer.txHash);
```

Every `create` call includes an `Idempotency-Key`, and the SDK generates one if you leave it out. Passing your own keeps retries safe even after a process restart, because any number of calls with the same key result in at most one transfer:

```ts
await sectoral.transfers.create(
  { to: "@vendor", amount: "125.00" },
  { idempotencyKey: `invoice-4471` },
);
```

## API keys

Each request carries a single bearer key, created under **Dashboard → Developer → API Keys**. The key's prefix determines its network, and the client detects it automatically, so there is no environment flag to get wrong:

| Prefix | Network | Scope |
|---|---|---|
| `hc_live_` | Mainnet, chain 4663 | Moves real USDG |
| `hc_test_` | Testnet, chain 46630 | No real funds |

```ts
const sectoral = new Sectoral({ apiKey: "hc_test_..." });
sectoral.environment; // "test"
```

Anyone holding a key can move funds with it. Store keys in environment variables or a secrets manager, keep them out of version control, and rotate a key as soon as you think it may have leaked.

## How confidentiality affects the SDK

Sectoral's servers store only ciphertext and never hold the key needed to decrypt it. That has two direct effects on how the SDK works:

- Responses never include a plaintext amount, not even the response to the request where you supplied it. To see a figure you must decrypt it locally.
- `accounts.balances()` returns actual numbers only if you pass a `decryptionProof` generated on your side. Without it, you only find out which assets have a nonzero balance.

```ts
const { balances } = await sectoral.accounts.balances({ decryptionProof });
```

## Agents

Each agent receives a wallet plus a mandate. The mandate is enforced as a smart-account constraint, not a server-side check, so an agent is not merely discouraged from overspending: it is unable to, and a compromised backend cannot override that:

```ts
const agent = await sectoral.agents.create({
  name: "research-bot",
  spendPolicy: {
    dailyLimitUsdg: 500,
    perTransactionLimitUsdg: 50,
    allowedRecipients: ["api.market", "*.anthropic.com"],
    assets: ["USDG"],
    activeHours: "00:00-23:59",
    hitlThresholdUsdg: 25, // amounts at or above this need human approval
  },
});

// Approve everything currently awaiting your review.
const { pending } = await sectoral.agents.listPendingTransactions();
for (const tx of pending) {
  await sectoral.agents.approveTransaction(tx.transactionId);
}
```

## Webhooks

Create a subscription, then verify every delivery came from Sectoral before acting on it. Pass the verifier the raw body exactly as received. A body that has been parsed and re-serialized produces a different hash and fails verification:

```ts
const webhook = await sectoral.webhooks.create({
  url: "https://yourapp.com/hooks/sectoral",
  events: ["transfer.confirmed", "agent.transaction.pending_approval"],
});

// Only returned this one time, so save it now.
const secret = webhook.secret;

// Inside your handler, verify and parse in one call. An invalid signature
// throws SectoralWebhookVerificationError, so unverified data never reaches
// the code below.
const event = await sectoral.webhooks.constructEvent({
  payload: rawBody, // the unmodified string or Uint8Array
  signature: request.headers["x-sectoral-signature"],
  secret,
});

switch (event.event) {
  case "transfer.confirmed":
    console.log(`settled: ${event.txHash}`);
    break;
  case "agent.transaction.pending_approval":
    // notify a human reviewer
    break;
}
```

Prefer a simple yes or no? `sectoral.webhooks.verifySignature({ payload, signature, secret })` returns true or false and never throws.

## Error handling

Every failure is raised as a typed error, so you can branch on its class and fields instead of parsing message text:

```ts
import { SectoralAPIError } from "@sectoralxyz/typescript-sdk";

try {
  await sectoral.transfers.create({ to: "@vendor", amount: "999999.00" });
} catch (err) {
  if (err instanceof SectoralAPIError) {
    console.error(err.status, err.code); // 402 "insufficient_balance"
    if (err.code === "insufficient_balance") {
      // handle the shortfall here
    }
  }
}
```

- `SectoralAPIError`: the API returned a status outside the 2xx range. Exposes `status`, `code`, `body` and `requestId`.
- `SectoralConnectionError`: the request never reached the API because of a network problem, a timeout or a cancellation.
- `SectoralWebhookVerificationError`: `constructEvent` was unable to verify a delivery.
- `SectoralError`: the base class for all of the above. Catching it catches every SDK error.

## Configuration

The defaults work for most integrations, and each one can be overridden:

```ts
const sectoral = new Sectoral({
  apiKey: process.env.SECTORAL_API_KEY!,
  baseUrl: "https://api.sectoral.xyz", // point this at a private gateway if needed
  timeoutMs: 30_000,                  // maximum time for each request
  maxRetries: 2,                      // applies to transient errors; set 0 to turn off
  fetch: customFetch,                 // bring your own fetch implementation
});
```

### Retries

The SDK retries after a dropped connection, a `408`, a `429` or any `5xx`. The delay doubles between attempts, and a `Retry-After` header from the server takes precedence. Retries apply only to calls that can be safely repeated: every `GET`, plus `transfers.create`, since each of its attempts sends an `Idempotency-Key` that makes a duplicate harmless.

### Overriding options per call

Each method accepts a final options argument with an `AbortSignal` and a timeout, letting you tune a single slow call without changing the settings for every other request:

```ts
const controller = new AbortController();

const { transfers } = await sectoral.transfers.list(
  { status: "pending" },
  { signal: controller.signal, timeoutMs: 5_000 },
);

controller.abort(); // cancels the request along with any pending retries
```

## API surface

| Namespace | Methods |
|---|---|
| `sectoral.accounts` | `me`, `balances`, `listAgents` |
| `sectoral.transfers` | `create`, `get`, `list` |
| `sectoral.agents` | `create`, `getSpendPolicy`, `updateSpendPolicy`, `listPendingTransactions`, `approveTransaction`, `rejectTransaction` |
| `sectoral.webhooks` | `create`, `list`, `delete`, `replay`, `deliveries`, `verifySignature`, `constructEvent` |

Full REST documentation is available at [docs.sectoral.xyz](https://docs.sectoral.xyz).

## License

Released under the MIT license.
