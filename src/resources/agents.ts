import type { Transport, RequestConfig } from "../transport.js";
import type {
  AgentAccount,
  CreateAgentParams,
  PendingTransaction,
  PendingTransactionList,
  SpendPolicy,
  SpendPolicyRecord,
} from "../types.js";

/**
 * Create agents, set the limits the chain holds them to, and rule on the
 * payments they have parked for a person to decide.
 */
export class Agents {
  constructor(private readonly http: Transport) {}

  /** Stand up a new agent beneath this account. */
  async create(params: CreateAgentParams, config: RequestConfig = {}): Promise<AgentAccount> {
    return this.http.request<AgentAccount>({
      method: "POST",
      path: "/v1/accounts/me/agents",
      body: params,
      ...config,
    });
  }

  /** Read back the policy an agent is presently bound by. */
  async getSpendPolicy(
    accountId: string,
    config: RequestConfig = {},
  ): Promise<SpendPolicyRecord> {
    return this.http.request<SpendPolicyRecord>({
      method: "GET",
      path: `/v1/agents/${encodeURIComponent(accountId)}/spend-policy`,
      ...config,
    });
  }

  /**
   * Amend a policy. Send only the fields you mean to change; the rest stay as
   * they were. The new limits bind from the agent's next signature onward.
   */
  async updateSpendPolicy(
    accountId: string,
    patch: Partial<SpendPolicy>,
    config: RequestConfig = {},
  ): Promise<SpendPolicyRecord> {
    return this.http.request<SpendPolicyRecord>({
      method: "PATCH",
      path: `/v1/agents/${encodeURIComponent(accountId)}/spend-policy`,
      body: patch,
      ...config,
    });
  }

  /** Everything across every agent that is waiting on a human. */
  async listPendingTransactions(
    config: RequestConfig = {},
  ): Promise<PendingTransactionList> {
    return this.http.request<PendingTransactionList>({
      method: "GET",
      path: "/v1/agents/transactions/pending",
      ...config,
    });
  }

  /** Let a parked payment through. It is signed and sent at once. */
  async approveTransaction(
    transactionId: string,
    config: RequestConfig = {},
  ): Promise<PendingTransaction> {
    return this.http.request<PendingTransaction>({
      method: "POST",
      path: `/v1/agents/transactions/${encodeURIComponent(transactionId)}/approve`,
      ...config,
    });
  }

  /** Turn a parked payment down. It is dropped and nothing moves. */
  async rejectTransaction(
    transactionId: string,
    config: RequestConfig = {},
  ): Promise<PendingTransaction> {
    return this.http.request<PendingTransaction>({
      method: "POST",
      path: `/v1/agents/transactions/${encodeURIComponent(transactionId)}/reject`,
      ...config,
    });
  }
}
