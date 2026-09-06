export class FrameBroadcastError extends Error {
  constructor(
    message: string,
    public readonly reason: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FrameBroadcastError";
  }
}

export class SponsorRefusedError extends FrameBroadcastError {
  constructor(message: string, reason: string) {
    super(message, reason, false);
    this.name = "SponsorRefusedError";
  }
}

export class NodeUnreachableError extends FrameBroadcastError {
  constructor(message: string, reason: string) {
    super(message, reason, true);
    this.name = "NodeUnreachableError";
  }
}

export class TransactionRejectedError extends FrameBroadcastError {
  constructor(message: string, reason: string) {
    super(message, reason, false);
    this.name = "TransactionRejectedError";
  }
}

export class EngineTimeoutError extends FrameBroadcastError {
  constructor(message: string, reason: string) {
    super(message, reason, true);
    this.name = "EngineTimeoutError";
  }
}
