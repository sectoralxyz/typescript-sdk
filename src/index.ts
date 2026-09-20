export { Sectoral } from "./client.js";
export type { SectoralOptions, Environment } from "./client.js";
export type { RequestConfig } from "./transport.js";

export {
  SectoralError,
  SectoralAPIError,
  SectoralConnectionError,
  SectoralWebhookVerificationError,
} from "./errors.js";
export type { SectoralErrorCode } from "./errors.js";

export { verifyWebhookSignature } from "./signature.js";

export { Accounts } from "./resources/accounts.js";
export { Transfers } from "./resources/transfers.js";
export type { CreateTransferOptions } from "./resources/transfers.js";
export { Agents } from "./resources/agents.js";
export { Webhooks } from "./resources/webhooks.js";

export type * from "./types.js";
