import type { Transport, RequestConfig } from "../transport.js";
import type { Account, AgentAccount, BalancesResponse } from "../types.js";

/**
 * Everything about the account behind the key: who it is, what it holds, and
 * which agents answer to it.
 */
export class Accounts {
  constructor(private readonly http: Transport) {}

  /** Fetch the account this key belongs to. */
  async me(config: RequestConfig = {}): Promise<Account> {
    return this.http.request<Account>({
      method: "GET",
      path: "/v1/accounts/me",
      ...config,
    });
  }

  /**
   * Fetch decrypted balances.
   *
   * The servers hold ciphertext and no key to open it, so a figure can only be
   * returned when you supply a decryption proof built on your side. Leave the
   * proof out and the answer says which assets are non-zero without saying by
   * how much.
   */
  async balances(
    params?: { decryptionProof?: string },
    config: RequestConfig = {},
  ): Promise<BalancesResponse> {
    return this.http.request<BalancesResponse>({
      method: "GET",
      path: "/v1/accounts/me/balances",
      query: { decryptionProof: params?.decryptionProof },
      ...config,
    });
  }

  /** Every agent account sitting beneath this one. */
  async listAgents(config: RequestConfig = {}): Promise<{ agents: AgentAccount[] }> {
    return this.http.request<{ agents: AgentAccount[] }>({
      method: "GET",
      path: "/v1/accounts/me/agents",
      ...config,
    });
  }
}
