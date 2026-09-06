import type { Transport, RequestConfig } from "../transport.js";
import type {
  CreateTransferParams,
  ListTransfersParams,
  Transfer,
  TransferList,
} from "../types.js";

export interface CreateTransferOptions extends RequestConfig {
  /**
   * Something that uniquely names this attempt. However many times a call
   * carrying the same key arrives, at most one transfer results, so a retry
   * cannot pay someone twice. One is generated for you if you say nothing;
   * pass your own, such as an order or job id, and the guarantee survives a
   * process restart too.
   */
  idempotencyKey?: string;
}

/**
 * Sending money, and reading back what was sent. Confidentiality is the
 * default and it holds on the way back: no response carries a plaintext
 * figure, not even the response to the call that named one.
 */
export class Transfers {
  constructor(private readonly http: Transport) {}

  /** Send a transfer. Retrying is safe, because every attempt is keyed. */
  async create(
    params: CreateTransferParams,
    options: CreateTransferOptions = {},
  ): Promise<Transfer> {
    const { idempotencyKey, ...config } = options;
    return this.http.request<Transfer>({
      method: "POST",
      path: "/v1/transfers",
      body: params,
      headers: {
        "Idempotency-Key": idempotencyKey ?? generateIdempotencyKey(),
      },
      idempotent: true,
      ...config,
    });
  }

  /** Look up one transfer by id. */
  async get(transferId: string, config: RequestConfig = {}): Promise<Transfer> {
    return this.http.request<Transfer>({
      method: "GET",
      path: `/v1/transfers/${encodeURIComponent(transferId)}`,
      ...config,
    });
  }

  /** Page through transfers, newest first. */
  async list(
    params: ListTransfersParams = {},
    config: RequestConfig = {},
  ): Promise<TransferList> {
    return this.http.request<TransferList>({
      method: "GET",
      path: "/v1/transfers",
      query: {
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        from: params.from,
        to: params.to,
      },
      ...config,
    });
  }
}

function generateIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  // For runtimes without Web Crypto. Note which way this fails: a collision
  // would drop a genuine transfer as a duplicate, and could never cause the
  // same money to go out twice.
  return `mf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
