export type Hex = `0x${string}`;

/** One frame, in the engine's JSON shape. */
export type Frame = {
	mode: string;
	flags: number;
	target: Hex;
	gas_limit: number;
	value: string;
	data: Hex;
};

/** One signature entry, in the engine's JSON shape. */
export type Signature = {
	scheme: number;
	signer: Hex;
	msg: Hex;
	signature: Hex;
};

/**
 * The body a relaying engine's submit endpoint accepts: the same transaction as
 * a sealed `rawTransaction`, structured rather than sealed.
 *
 * An engine needs the fields, not the bytes: it identifies the queue slot from
 * the sender and nonce, re-checks the frame structure, and re-encodes at
 * broadcast time — possibly minutes later — none of which it can do to an
 * opaque blob.
 *
 * Field names and value encodings are the engine's:
 * - `nonce_keys` entries are hex strings. A lane key is 32 bytes and a JSON
 *   number could not carry it without losing precision.
 * - `value` is a decimal string, parsed engine-side as a `u256`.
 * - fees and `gas_limit` are numbers, typed engine-side as `u128`/`u64`. Every
 *   value a caller produces is far below `Number.MAX_SAFE_INTEGER`.
 */
export type FrameTransaction = {
	chain_id: number;
	nonce_keys: Hex[];
	nonce_seq: number;
	sender: Hex;
	payer: "self" | "sponsor" | "external";
	max_priority_fee_per_gas: number;
	max_fee_per_gas: number;
	max_fee_per_blob_gas: Hex;
	blob_versioned_hashes: Hex[];
	frames: Frame[];
	signatures: Signature[];
};

export type JobStatus =
	| "pending"
	| "waitingForNonce"
	| "retrying"
	| "broadcasting"
	| "broadcast"
	| "superseded"
	| "failed";

export type JobState = {
	jobId: string;
	status: JobStatus;
	txHash?: string;
	reason?: string;
};

export type SubmitResponse = {
	status: string;
	message: string;
	jobId?: string;
};

export type BroadcastOptions = {
	/**
	 * Callback fired whenever the job state is polled and returned by the engine.
	 */
	onStateChange?: (state: JobState | null) => void;
};
