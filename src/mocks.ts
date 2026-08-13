import type {
  CreateMessageRequestParams,
  CreateMessageResult,
  ElicitRequestParams,
  ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  ClientRequest,
  ClientNotification,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * The request/notification types a client may send/receive when acting as a
 * mocked MCP client. Used to type the `extra` argument passed to responders.
 */
export type MockRequestExtra = RequestHandlerExtra<ClientRequest, ClientNotification>;

/**
 * A function that produces a sampling response for a `sampling/createMessage`
 * request. It receives the request params and the SDK request handler extra.
 */
export type SamplingResponder = (
  params: CreateMessageRequestParams,
  extra: MockRequestExtra,
) => CreateMessageResult | Promise<CreateMessageResult>;

/**
 * A function that produces an elicitation response for an `elicitation/create`
 * request. It receives the request params and the SDK request handler extra.
 */
export type ElicitationResponder = (
  params: ElicitRequestParams,
  extra: MockRequestExtra,
) => ElicitResult | Promise<ElicitResult>;

/**
 * Mock controller for the client-side `sampling/createMessage` capability.
 *
 * Access via `kit.sampling`. By default it returns an empty assistant text
 * message; override with {@link setResponder} or {@link respondWith} to script
 * responses for tests.
 */
export class SamplingMock {
  /** Every sampling request received by the client, in order. */
  readonly requests: CreateMessageRequestParams[] = [];

  private responder: SamplingResponder;

  constructor() {
    this.responder = () => ({
      role: "assistant",
      model: "mcp-testkit-mock",
      content: { type: "text", text: "" },
      stopReason: "endTurn",
    });
  }

  /**
   * Set a function used to respond to every subsequent sampling request.
   * Returning the same instance allows chaining.
   */
  setResponder(responder: SamplingResponder): this {
    this.responder = responder;
    return this;
  }

  /**
   * Shortcut for responding to all sampling requests with a fixed result.
   *
   * @example
   * ```ts
   * kit.sampling.respondWith({
   *   role: "assistant",
   *   model: "test",
   *   content: { type: "text", text: "mocked" },
   * });
   * ```
   */
  respondWith(result: CreateMessageResult): this {
    this.responder = () => result;
    return this;
  }

  /** Clear the recorded request history. */
  clear(): this {
    this.requests.length = 0;
    return this;
  }

  /** @internal Called by the harness when a sampling request arrives. */
  async _handle(
    params: CreateMessageRequestParams,
    extra: MockRequestExtra,
  ): Promise<CreateMessageResult> {
    this.requests.push(params);
    return this.responder(params, extra);
  }
}

/**
 * Mock controller for the client-side `elicitation/create` capability.
 *
 * Access via `kit.elicitation`. By default it declines every request;
 * override with {@link setResponder} or {@link respondWith}.
 */
export class ElicitationMock {
  /** Every elicitation request received by the client, in order. */
  readonly requests: ElicitRequestParams[] = [];

  private responder: ElicitationResponder;

  constructor() {
    this.responder = () => ({ action: "decline" });
  }

  setResponder(responder: ElicitationResponder): this {
    this.responder = responder;
    return this;
  }

  /**
   * Shortcut for accepting with fixed content.
   *
   * @example
   * ```ts
   * kit.elicitation.acceptWith({ name: "Ada" });
   * ```
   */
  acceptWith(content: Record<string, string | number | boolean | string[]>): this {
    this.responder = () => ({ action: "accept", content });
    return this;
  }

  respondWith(result: ElicitResult): this {
    this.responder = () => result;
    return this;
  }

  /** Convenience: decline every elicitation request (the default). */
  decline(): this {
    this.responder = () => ({ action: "decline" });
    return this;
  }

  /** Convenience: cancel every elicitation request. */
  cancel(): this {
    this.responder = () => ({ action: "cancel" });
    return this;
  }

  clear(): this {
    this.requests.length = 0;
    return this;
  }

  /** @internal Called by the harness when an elicitation request arrives. */
  async _handle(
    params: ElicitRequestParams,
    extra: MockRequestExtra,
  ): Promise<ElicitResult> {
    this.requests.push(params);
    return this.responder(params, extra);
  }
}
