/**
 * The shapes this SDK hands you and takes back. Everything here is camelCase;
 * translation to and from the API's snake_case happens in the transport layer,
 * so nothing in your code has to think about the wire format.
 */

export type Asset = "USDG" | "USDC" | "ETH" | (string & {});

export type AccountType = "personal" | "business" | "agent";

export type KycStatus = "unverified" | "pending" | "verified" | "enhanced";

export type TransferStatus = "pending" | "confirmed" | "failed";

export type AgentStatus = "active" | "paused" | "disabled" | (string & {});

/** The account behind the API key. */
export interface Account {
  accountId: string;
  handle: string;
  type: AccountType;
  /** This account's Robinhood Chain address, 0x-prefixed. */
  publicKey: string;
  kycStatus: KycStatus;
  createdAt: string;
}

/** One asset's balance, already decrypted. */
export interface Balance {
  asset: Asset;
  /** A decimal string, `"1245.30"` for instance. */
  amount: string;
}

export interface BalancesResponse {
  balances: Balance[];
}

/** An agent account living beneath the authenticated one. */
export interface AgentAccount {
  accountId: string;
  handle: string;
  publicKey: string;
  status: AgentStatus;
  spendPolicyId: string;
}

/** The limits a smart account applies before an agent is allowed to sign. */
export interface SpendPolicy {
  /** Ceiling across a rolling 24 hours, in USDG. */
  dailyLimitUsdg: number;
  /** Ceiling on any one payment, in USDG. */
  perTransactionLimitUsdg: number;
  /** Who the agent may pay, as domains or handles. Wildcards work, for example `*.anthropic.com`. */
  allowedRecipients: string[];
  /** What the agent may spend. `["USDG"]` unless you widen it; bridged `USDC` and `ETH` are available. */
  assets: Asset[];
  /** The hours it may transact at all, written as `"00:00-23:59"`. */
  activeHours: string;
  /** At or above this figure, in USDG, a person has to approve before anything moves. */
  hitlThresholdUsdg: number;
}

export interface SpendPolicyRecord extends SpendPolicy {
  policyId: string;
  updatedAt: string;
}

export interface CreateAgentParams {
  name: string;
  spendPolicy: SpendPolicy;
}

/** A transfer, whether it has landed or is still in flight. */
export interface Transfer {
  transferId: string;
  status: TransferStatus;
  from?: string;
  to: string;
  confidential: boolean;
  /** Its transaction hash on Robinhood Chain. */
  txHash: string;
  createdAt: string;
  confirmedAt?: string;
}

export interface CreateTransferParams {
  /** Who to pay: a `@handle` or a raw 0x address. */
  to: string;
  /** How much, as a decimal string. */
  amount: string;
  /** `USDG` unless you say otherwise. */
  asset?: Asset;
  /**
   * `true` unless you say otherwise. Only turn it off when the destination
   * wallet has no support for confidential tokens.
   */
  confidential?: boolean;
  /** A memo, encrypted, legible to the two parties and nobody else. */
  memo?: string;
}

export interface ListTransfersParams {
  /** How many per page, up to `100`. `20` by default. */
  limit?: number;
  offset?: number;
  status?: TransferStatus;
  /** An ISO 8601 timestamp; nothing earlier than this. */
  from?: string;
  /** An ISO 8601 timestamp; nothing later than this. */
  to?: string;
}

export interface TransferList {
  transfers: Transfer[];
}

/** A payment an agent has parked, waiting on a person. */
export interface PendingTransaction {
  transactionId: string;
  agent: string;
  to: string;
  requestedAt: string;
  expiresAt: string;
}

export interface PendingTransactionList {
  pending: PendingTransaction[];
}

export type WebhookEvent =
  | "transfer.initiated"
  | "transfer.confirmed"
  | "transfer.failed"
  | "agent.transaction.pending_approval"
  | "agent.transaction.approved"
  | "agent.transaction.rejected"
  | "agent.policy.updated"
  | (string & {});

export type TransferDirection = "sent" | "received";

/**
 * A delivery's body, parsed. There is no amount in here and there never will
 * be: the figure is ciphertext on-chain and the servers hold no key to it.
 * Anything that needs the number decrypts it locally with your own key.
 */
export interface WebhookEventPayload {
  event: WebhookEvent;
  /** Whose event this is, for instance `@yourname/research-bot`. */
  account: string;
  direction?: TransferDirection;
  counterparty?: string;
  asset?: Asset;
  confidential?: boolean;
  txHash?: string;
  timestamp: string;
}

/** A single delivery attempt out of a subscription's recent history. */
export interface WebhookDelivery {
  eventId: string;
  event: WebhookEvent;
  /** What your endpoint answered, or `0` when nothing answered at all. */
  responseStatus: number;
  /** Attempts so far, the first one included. */
  attempts: number;
  lastAttemptAt: string;
}

export interface WebhookDeliveryList {
  deliveries: WebhookDelivery[];
}

export interface Webhook {
  webhookId: string;
  url: string;
  events: WebhookEvent[];
  createdAt: string;
}

/** What `create` returns, and the only time you will see the `secret`. */
export interface WebhookWithSecret extends Webhook {
  secret: string;
}

export interface CreateWebhookParams {
  url: string;
  events: WebhookEvent[];
}

export interface WebhookList {
  webhooks: Webhook[];
}
