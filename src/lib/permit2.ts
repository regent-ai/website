import type { TypedDataDomain, TypedDataParameter } from "viem";
import { base } from "viem/chains";

export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export const PermitTransferFromTypes: Record<string, TypedDataParameter[]> = {
	PermitTransferFrom: [
		{ name: "permitted", type: "TokenPermissions" },
		{ name: "spender", type: "address" },
		{ name: "nonce", type: "uint256" },
		{ name: "deadline", type: "uint256" },
	],
	TokenPermissions: [
		{ name: "token", type: "address" },
		{ name: "amount", type: "uint256" },
	],
};

export interface PermitTokenPermissions {
	token: `0x${string}`;
	amount: bigint;
}

export interface PermitTransferFrom {
	permitted: PermitTokenPermissions;
	spender: `0x${string}`;
	nonce: bigint;
	deadline: bigint;
}

export function permit2Domain(chainId: number = base.id): TypedDataDomain {
	return {
		name: "Permit2",
		chainId,
		verifyingContract: PERMIT2_ADDRESS,
	};
}



