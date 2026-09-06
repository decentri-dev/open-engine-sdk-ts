import {
  EngineTimeoutError,
  FrameBroadcastError,
  NodeUnreachableError,
  SponsorRefusedError,
  TransactionRejectedError,
} from "./errors";
import type { BroadcastOptions, FrameTransaction, Hex, JobState, SubmitResponse } from "./types";

export type OpenEngineClientConfig = {
  url: string;
  pollDeadlineMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
};

export class OpenEngineClient {
  private readonly baseUrl: string;
  private readonly pollDeadlineMs: number;
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;

  constructor(config: OpenEngineClientConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.pollDeadlineMs = config.pollDeadlineMs ?? 150_000;
    this.pollIntervalMs = config.pollIntervalMs ?? 250;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
  }

  private resolveUrl(path: string): string {
    return `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private unreachable(path: string, cause: unknown): FrameBroadcastError {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new NodeUnreachableError(
      `Could not reach the transaction engine (${path}): ${detail}`,
      detail,
    );
  }

  private async errorBody(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");

    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;

      const parts = [];
      if (typeof parsed.error === "string") parts.push(parsed.error);
      if (typeof parsed.revertReason === "string") parts.push(`Reason: ${parsed.revertReason}`);
      if (typeof parsed.details === "string") parts.push(`Details: ${parsed.details}`);
      if (typeof parsed.cause === "string") parts.push(`Cause: ${parsed.cause}`);

      if (parts.length > 0) return parts.join(" | ");

      // If it's a JSON but has no recognizable error string, return the whole thing
      return JSON.stringify(parsed);
    } catch {
      // Not JSON — a proxy or a crash. The raw text is the best detail there is.
    }

    return text || `HTTP ${response.status}`;
  }

  /**
   * Checks the health of the engine. Returns "OK" if healthy.
   */
  async health(): Promise<string> {
    try {
      const res = await fetch(this.resolveUrl("/health"), {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      throw this.unreachable("/health", e);
    }
  }

  /**
   * Retrieves Prometheus metrics from the engine.
   */
  async metrics(): Promise<string> {
    try {
      const res = await fetch(this.resolveUrl("/metrics"), {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      throw this.unreachable("/metrics", e);
    }
  }

  /**
   * Submits a transaction to the open-engine and returns the jobId.
   */
  async submitTransaction(payload: FrameTransaction): Promise<string> {
    let response: Response;
    try {
      response = await fetch(this.resolveUrl("/transaction"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      throw this.unreachable("POST /transaction", cause);
    }

    if (response.status === 503) {
      const reason = await this.errorBody(response);
      throw new NodeUnreachableError(
        `The engine could not reach the node or sponsor authority: ${reason}`,
        reason,
      );
    }

    if (response.status >= 400 && response.status < 500 && response.status !== 409) {
      const reason = await this.errorBody(response);
      if (reason.toLowerCase().includes("sponsor")) {
        throw new SponsorRefusedError(`The sponsor rejected the transaction: ${reason}`, reason);
      }
      throw new TransactionRejectedError(`The engine rejected the transaction: ${reason}`, reason);
    }

    if (response.status >= 500) {
      const reason = await this.errorBody(response);
      throw new NodeUnreachableError(
        `The engine failed to queue the transaction: ${reason}`,
        reason,
      );
    }

    const body = (await response.json().catch(() => ({}))) as SubmitResponse;

    if (!body.jobId) {
      throw new FrameBroadcastError(
        `The engine accepted the transaction but named no job to follow (status ${body.status ?? response.status}).`,
        body.message ?? "no jobId in response",
        true,
      );
    }

    return body.jobId;
  }

  /**
   * Fetches the state of a specific transaction job.
   */
  async getTransactionState(jobId: string): Promise<JobState | null> {
    let response: Response;
    try {
      response = await fetch(this.resolveUrl(`/transaction/${encodeURIComponent(jobId)}`), {
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (cause) {
      throw this.unreachable(`GET /transaction/${jobId}`, cause);
    }

    if (response.status === 404) return null;

    if (!response.ok) {
      const reason = await this.errorBody(response);
      throw new NodeUnreachableError(`Could not read job ${jobId}: ${reason}`, reason);
    }

    return (await response.json()) as JobState;
  }

  /**
   * Broadcasts a signed frame transaction through open-engine and returns its hash.
   */
  async broadcastFrameTransaction(
    payload: FrameTransaction,
    options?: BroadcastOptions,
  ): Promise<Hex> {
    const jobId = await this.submitTransaction(payload);
    const deadline = Date.now() + this.pollDeadlineMs;

    while (Date.now() < deadline) {
      const state = await this.getTransactionState(jobId);

      if (options?.onStateChange) {
        options.onStateChange(state);
      }

      if (state?.status === "broadcast") {
        if (!state.txHash) {
          throw new FrameBroadcastError(
            `The engine reported job ${jobId} as broadcast but returned no transaction hash.`,
            state.reason ?? "broadcast without txHash",
            false,
          );
        }
        return state.txHash as Hex;
      }

      if (state?.status === "failed" || state?.status === "superseded") {
        const reason = state.reason ?? `job ${state.status}`;
        throw new TransactionRejectedError(`The transaction was not broadcast: ${reason}`, reason);
      }

      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
    }

    throw new EngineTimeoutError(
      `The engine did not settle job ${jobId} within ${this.pollDeadlineMs / 1000}s. It may still broadcast — submit again to pick up where this left off.`,
      "engine timeout",
    );
  }
}
