/**
 * The `code` values the API returns on a failure. Each resource's reference
 * page lists the ones that endpoint can produce. The trailing `string & {}`
 * keeps autocomplete useful while still accepting a code added server-side
 * after this version shipped.
 */
export type SectoralErrorCode =
  | "unauthorized"
  | "kyc_required"
  | "decryption_proof_invalid"
  | "invalid_request"
  | "insufficient_balance"
  | "recipient_not_found"
  | "recipient_not_confidential_ready"
  | "invalid_policy"
  | "not_agent_owner"
  | "transaction_not_found"
  | "transaction_expired"
  | (string & {});

/**
 * Every error this SDK throws descends from here, so a single `catch` can
 * cover the lot when you do not care which kind of failure it was.
 */
export class SectoralError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SectoralError";
  }
}

/**
 * The API answered, and the answer was a failure. Carries the HTTP status, the
 * code you can branch on, and the untouched response body for anything the
 * typed fields do not cover.
 */
export class SectoralAPIError extends SectoralError {
  /** The HTTP status, `402` for instance. */
  readonly status: number;
  /** The code worth branching on, `insufficient_balance` for instance. */
  readonly code: SectoralErrorCode;
  /** Whatever the response body parsed to, if it carried one. */
  readonly body: unknown;
  /** The `x-request-id` header. Quote it when you open a support ticket. */
  readonly requestId: string | undefined;

  constructor(params: {
    status: number;
    code: SectoralErrorCode;
    message: string;
    body: unknown;
    requestId?: string;
  }) {
    super(params.message);
    this.name = "SectoralAPIError";
    this.status = params.status;
    this.code = params.code;
    this.body = params.body;
    this.requestId = params.requestId;
  }
}

/**
 * Raised by `webhooks.constructEvent` when a delivery cannot be trusted: the
 * HMAC did not match, or what arrived was not JSON. Either way, discard it.
 */
export class SectoralWebhookVerificationError extends SectoralError {
  constructor(message: string) {
    super(message);
    this.name = "SectoralWebhookVerificationError";
  }
}

/** Raised when the request never got an answer at all: the network dropped it, it timed out, or it was cancelled. */
export class SectoralConnectionError extends SectoralError {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "SectoralConnectionError";
    this.cause = cause;
  }
}
