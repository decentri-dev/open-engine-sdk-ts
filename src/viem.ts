import type { Address, TransactionRequest } from "viem";
import type { Frame, FrameTransaction, Hex, Signature } from "./types";

export type ViemAdapterOptions = {
	chainId: number;
	sender: Address;
	nonceKeys: Hex[];
	nonceSeq: number;
	payer?: "self" | "sponsor" | "external";
	signatures?: Signature[];
};

/**
 * Converts a standard viem TransactionRequest into an open-engine FrameTransaction.
 * This effectively wraps a traditional transaction call into an EIP-8141 Default frame.
 */
export function prepareFrameTransaction(
	request: TransactionRequest,
	options: ViemAdapterOptions,
): FrameTransaction {
	if (!request.to)
		throw new Error("Transaction request must have a 'to' address.");

	const frame: Frame = {
		mode: "Default",
		flags: 0,
		target: request.to as Hex,
		gas_limit: request.gas ? Number(request.gas) : 0,
		value: request.value ? request.value.toString() : "0",
		data: (request.data as Hex) || "0x",
	};

	return {
		chain_id: options.chainId,
		nonce_keys: options.nonceKeys,
		nonce_seq: options.nonceSeq,
		sender: options.sender as Hex,
		payer: options.payer ?? "self",
		max_priority_fee_per_gas: request.maxPriorityFeePerGas
			? Number(request.maxPriorityFeePerGas)
			: 0,
		max_fee_per_gas: request.maxFeePerGas ? Number(request.maxFeePerGas) : 0,
		max_fee_per_blob_gas: request.maxFeePerBlobGas
			? `0x${request.maxFeePerBlobGas.toString(16)}`
			: "0x",
		blob_versioned_hashes: (request.blobVersionedHashes as Hex[]) || [],
		frames: [frame],
		signatures: options.signatures || [],
	};
}
