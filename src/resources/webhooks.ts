import { fromWire } from "../wire-format.js";
import { SectoralWebhookVerificationError } from "../errors.js";
import type { Transport, RequestConfig } from "../transport.js";
import type {
  CreateWebhookParams,
  WebhookDeliveryList,
  WebhookEventPayload,
  WebhookList,
  WebhookWithSecret,
} from "../types.js";
import { verifyWebhookSignature } from "../signature.js";

/**
 * Subscriptions, and the means to tell a real delivery from a forged one.
 */
export class Webhooks {
  constructor(private readonly http: Transport) {}

  /**
   * Open a subscription. The `secret` comes back exactly once and never
   * again, so put it somewhere durable before you do anything else; without
   * it you cannot check the `X-Sectoral-Signature` on anything that arrives.
   */
  async create(
    params: CreateWebhookParams,
    config: RequestConfig = {},
  ): Promise<WebhookWithSecret> {
    return this.http.request<WebhookWithSecret>({
      method: "POST",
      path: "/v1/webhooks",
      body: params,
      ...config,
    });
  }

  /** Every subscription on this account. */
  async list(config: RequestConfig = {}): Promise<WebhookList> {
    return this.http.request<WebhookList>({
      method: "GET",
      path: "/v1/webhooks",
      ...config,
    });
  }

  /** Close a subscription. Deliveries stop straight away. */
  async delete(webhookId: string, config: RequestConfig = {}): Promise<void> {
    await this.http.request<void>({
      method: "DELETE",
      path: `/v1/webhooks/${encodeURIComponent(webhookId)}`,
      ...config,
    });
  }

  /** Send one past event to the endpoint again. */
  async replay(
    webhookId: string,
    eventId: string,
    config: RequestConfig = {},
  ): Promise<void> {
    await this.http.request<void>({
      method: "POST",
      path: `/v1/webhooks/${encodeURIComponent(webhookId)}/replay/${encodeURIComponent(eventId)}`,
      ...config,
    });
  }

  /** What this subscription has attempted lately, and how it went. */
  async deliveries(
    webhookId: string,
    config: RequestConfig = {},
  ): Promise<WebhookDeliveryList> {
    return this.http.request<WebhookDeliveryList>({
      method: "GET",
      path: `/v1/webhooks/${encodeURIComponent(webhookId)}/deliveries`,
      ...config,
    });
  }

  /**
   * Test an incoming `X-Sectoral-Signature` and answer true or false.
   *
   * Give it the body exactly as it arrived, byte for byte. Anything that has
   * been parsed and re-serialized will hash differently and fail, even when
   * the delivery was perfectly genuine.
   */
  verifySignature(params: {
    payload: string | Uint8Array;
    signature: string;
    secret: string;
  }): Promise<boolean> {
    return verifyWebhookSignature(params);
  }

  /**
   * Check the signature and hand back the typed, camelCased event in one go.
   * A bad signature or a body that is not JSON raises
   * `SectoralWebhookVerificationError`, which is the point: your handler is
   * never reached by something that failed to prove where it came from.
   *
   * As above, pass the raw body rather than a re-serialized object.
   */
  async constructEvent(params: {
    payload: string | Uint8Array;
    signature: string;
    secret: string;
  }): Promise<WebhookEventPayload> {
    const valid = await verifyWebhookSignature(params);
    if (!valid) {
      throw new SectoralWebhookVerificationError(
        "Webhook signature verification failed. The delivery may be forged, the " +
          "secret may belong to a different subscription, or the body may have " +
          "been parsed and re-serialized before verification.",
      );
    }

    const raw =
      typeof params.payload === "string"
        ? params.payload
        : new TextDecoder().decode(params.payload);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SectoralWebhookVerificationError(
        "Webhook payload could not be parsed as JSON.",
      );
    }

    return fromWire<WebhookEventPayload>(parsed);
  }
}
