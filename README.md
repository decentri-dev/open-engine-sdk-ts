# open-engine-sdk

A robust SDK for interacting with the open-engine API. This SDK makes it easy to construct, sign, and broadcast EIP-8141 frames and standard transactions through open-engine relayers.

## Installation

Install using your preferred package manager:

```bash
npm install open-engine-sdk
# or
pnpm add open-engine-sdk
# or
yarn add open-engine-sdk
```

## Features

- **EngineClient**: An HTTP client built to reliably submit transactions and poll for job states.
- **Viem Adapter**: Helpers to easily wrap standard `viem` transaction requests into EIP-8141 open-engine `FrameTransaction`s.
- **Typed Errors**: Specific error classes like `SponsorRefusedError` and `NodeUnreachableError` for resilient error handling.

## Usage

### 1. Preparing a Transaction (Viem Adapter)

If you have a standard transaction request (like one you would send via `viem`), you can convert it into an engine-compatible `FrameTransaction` using the `prepareFrameTransaction` helper:

```typescript
import { prepareFrameTransaction } from "open-engine-sdk";

const frameTx = prepareFrameTransaction(
  {
    to: "0xTargetAddress",
    data: "0xCallData",
    value: 1000000000000000000n, // 1 ETH
    maxFeePerGas: 30000000000n,
    maxPriorityFeePerGas: 2000000000n,
    gas: 21000n,
  },
  {
    chainId: 1,
    sender: "0xYourAddress",
    nonceKeys: ["0xNonceKey"],
    nonceSeq: 1,
    payer: "sponsor", // or 'self' / 'external'
  }
);
```

### 2. Broadcasting Transactions

Initialize the `EngineClient` with the URL of your target open-engine node and broadcast the prepared transaction:

```typescript
import { EngineClient } from "open-engine-sdk";

const client = new EngineClient("https://engine.example.com");

async function broadcast() {
  try {
    // This will submit the transaction and poll until it is broadcasted
    const txHash = await client.broadcastFrameTransaction(frameTx, {
      onStateChange: (state) => {
        console.log(`Job state changed: ${state?.status}`);
      },
    });

    console.log(`Transaction successfully broadcasted! Hash: ${txHash}`);
  } catch (error) {
    console.error("Failed to broadcast transaction", error);
  }
}

broadcast();
```

### 3. Advanced Job Polling

If you prefer to submit the transaction and poll for the state manually, you can use the lower-level API methods:

```typescript
// 1. Submit the transaction and get a tracking ID
const jobId = await client.submitTransaction(frameTx);
console.log(`Transaction queued with Job ID: ${jobId}`);

// 2. Poll for the state yourself later
const state = await client.getTransactionState(jobId);
console.log(`Current status: ${state?.status}`);
```

## Error Handling

The SDK exposes several typed errors you can use to gracefully recover from failures:

- `SponsorRefusedError`: The sponsor authority rejected the transaction.
- `NodeUnreachableError`: The engine failed to reach the blockchain node.
- `TransactionRejectedError`: The engine rejected the transaction.
- `EngineTimeoutError`: The transaction didn't broadcast within the polling deadline.

```typescript
import { SponsorRefusedError } from "open-engine-sdk";

try {
  await client.broadcastFrameTransaction(frameTx);
} catch (error) {
  if (error instanceof SponsorRefusedError) {
    console.log("The transaction sponsor refused to cover fees.");
  }
}
```

## License

MIT
