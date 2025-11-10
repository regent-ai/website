/**
 * Batch-transfer Collection 3 NFTs (ids 1..1998) into the Redeemer via depositCollection3.
 *
 * Prereqs:
 * - The Redeemer contract is deployed and you are its OWNER.
 * - You currently hold the Collection 3 NFTs to transfer.
 *
 * Env:
 *   PRIVATE_KEY=0x...              // EOA that owns the NFTs and is the Redeemer OWNER
 *   REDEEMER_ADDRESS=0x...         // AnimataRedeemer address
 *   COLLECTION3_ADDRESS=0x2208aadbdecd47d3b4430b5b75a175f6d885d487 (default)
 *   RPC_URL=https://mainnet.base.org (default)
 *   START_ID=1 (default)
 *   END_ID=1998 (default)
 *   CHUNK_SIZE=75 (default; tune 50–125 depending on gas limits)
 *
 * Run:
 *   bun run scripts/transfer-collection3.ts
 */

import {
	createPublicClient,
	createWalletClient,
	http,
	type Hex,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { erc721Abi } from "../src/lib/redeem-constants";

const redeemerAbi = [
	{
		type: "function",
		name: "OWNER",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		name: "depositor",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		name: "depositCollection3",
		stateMutability: "nonpayable",
		inputs: [{ name: "ids", type: "uint256[]" }],
		outputs: [],
	},
] as const;

const erc721TransferAbi = [
	{
		type: "function",
		name: "safeTransferFrom",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
		],
		outputs: [],
	},
	{
		type: "function",
		name: "transferFrom",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "from", type: "address" },
			{ name: "to", type: "address" },
			{ name: "tokenId", type: "uint256" },
		],
		outputs: [],
	},
] as const;

function getEnv(name: string, fallback?: string): string {
	const v = process.env[name] ?? fallback;
	if (v === undefined) {
		throw new Error(`Missing env ${name}`);
	}
	return v;
}

function toAddress(val: string): `0x${string}` {
	if (!val.startsWith("0x") || val.length !== 42) {
		throw new Error(`Invalid address: ${val}`);
	}
	return val as `0x${string}`;
}

function toHexKey(val: string): `0x${string}` {
	if (!val.startsWith("0x")) throw new Error("PRIVATE_KEY must start with 0x");
	return val as `0x${string}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
}

async function main() {
	const PRIVATE_KEY = toHexKey(getEnv("PRIVATE_KEY"));
	const REDEEMER = toAddress(getEnv("REDEEMER_ADDRESS"));
	const COLLECTION3 = toAddress(getEnv("COLLECTION3_ADDRESS", "0x2208aadbdecd47d3b4430b5b75a175f6d885d487"));
	const RPC_URL = getEnv("RPC_URL", "https://mainnet.base.org");
	const START_ID = Number(getEnv("START_ID", "1"));
	const END_ID = Number(getEnv("END_ID", "1998"));
	const CHUNK_SIZE = Number(getEnv("CHUNK_SIZE", "75"));

	if (!Number.isFinite(START_ID) || !Number.isFinite(END_ID) || START_ID < 1 || END_ID < START_ID) {
		throw new Error("Invalid START_ID/END_ID range");
	}
	if (!Number.isFinite(CHUNK_SIZE) || CHUNK_SIZE < 1) {
		throw new Error("Invalid CHUNK_SIZE");
	}

	const account = privateKeyToAccount(PRIVATE_KEY);
	const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });
	const walletClient = createWalletClient({ chain: base, transport: http(RPC_URL), account });

	console.log(`Using account: ${account.address}`);
	console.log(`Redeemer: ${REDEEMER}`);
	console.log(`Collection3: ${COLLECTION3}`);
	console.log(`Range: ${START_ID}..${END_ID} (size=${END_ID - START_ID + 1}), chunk=${CHUNK_SIZE}`);

	// Sanity: allow script signer to be OWNER or DEPOSITOR
	const owner = (await publicClient.readContract({
		address: REDEEMER,
		abi: redeemerAbi,
		functionName: "OWNER",
	})) as string;
	const depositor = (await publicClient.readContract({
		address: REDEEMER,
		abi: redeemerAbi,
		functionName: "depositor",
	})) as string;
	if (
		owner.toLowerCase() !== account.address.toLowerCase() &&
		depositor.toLowerCase() !== account.address.toLowerCase()
	) {
		throw new Error(
			`Signer is not allowed. owner=${owner} depositor=${depositor} signer=${account.address}`,
		);
	}

	// Ensure setApprovalForAll(Collection3, Redeemer) so the contract can pull from your wallet during deposit
	const approved = (await publicClient.readContract({
		address: COLLECTION3,
		abi: erc721Abi,
		functionName: "isApprovedForAll",
		args: [account.address, REDEEMER],
	})) as boolean;
	if (!approved) {
		console.log("Granting setApprovalForAll(Collection3 -> Redeemer)...");
		const approveHash = await walletClient.writeContract({
			address: COLLECTION3,
			abi: erc721Abi,
			functionName: "setApprovalForAll",
			args: [REDEEMER, true],
		});
		await publicClient.waitForTransactionReceipt({ hash: approveHash as Hex });
		console.log(`Approved. tx=${approveHash}`);
	} else {
		console.log("Already approved.");
	}

	// Create id list and prefilter to those owned by the signer via multicall (fast)
	const allIds: bigint[] = [];
	for (let id = START_ID; id <= END_ID; id++) allIds.push(BigInt(id));

	console.log(`Prefiltering ownership for ${allIds.length} ids via multicall...`);
	const ownerOfAbi = [
		{
			type: "function",
			name: "ownerOf",
			stateMutability: "view",
			inputs: [{ name: "tokenId", type: "uint256" }],
			outputs: [{ name: "", type: "address" }],
		},
	] as const;

	async function multicallOwners(ids: bigint[]): Promise<Map<bigint, string>> {
		const out = new Map<bigint, string>();
		const MULTICALL_CHUNK = 200; // keep payloads reasonable
		for (let i = 0; i < ids.length; i += MULTICALL_CHUNK) {
			const slice = ids.slice(i, i + MULTICALL_CHUNK);
			const contracts = slice.map((id) => ({
				address: COLLECTION3,
				abi: ownerOfAbi,
				functionName: "ownerOf" as const,
				args: [id],
			}));
			const res = await publicClient.multicall({ contracts, allowFailure: true });
			for (let j = 0; j < slice.length; j++) {
				const id = slice[j];
				const r = res[j];
				if (r.status === "success") {
					out.set(id, (r.result as string).toLowerCase());
				}
			}
			console.log(`  checked ${Math.min(i + MULTICALL_CHUNK, ids.length)}/${ids.length}`);
		}
		return out;
	}

	const ownersMap = await multicallOwners(allIds);
	const lowerSigner = account.address.toLowerCase();
	const ownedIds = allIds.filter((id) => ownersMap.get(id) === lowerSigner);

	if (ownedIds.length === 0) {
		console.log("No owned tokens in the requested range; nothing to deposit.");
		return;
	}

	const batches = chunk(ownedIds, CHUNK_SIZE);

	console.log(`Transferring ${ownedIds.length} ids in ${batches.length} batches...`);
	for (let i = 0; i < batches.length; i++) {
		const part = batches[i];
		console.log(`Batch ${i + 1}/${batches.length}: ids [${part[0]}..${part[part.length - 1]}] (${part.length})`);
		// Fast path: try single batched deposit via Redeemer
		try {
			const hash = await walletClient.writeContract({
				address: REDEEMER,
				abi: redeemerAbi,
				functionName: "depositCollection3",
				args: [part],
			});
			const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
			console.log(`  ✓ batch deposit ok (gasUsed=${receipt.gasUsed})`);
			continue;
		} catch (e) {
			const msg = (e as Error)?.message ?? String(e);
			console.log(`  ! batch deposit failed, falling back to per-token transfers (${msg.slice(0, 160)})`);
		}
		// Fallback: transfer each token directly from EOA → Redeemer
		for (const id of part) {
			try {
				const hash = await walletClient.writeContract({
					address: COLLECTION3,
					abi: erc721TransferAbi,
					functionName: "safeTransferFrom",
					args: [account.address, REDEEMER, id],
				});
				await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
			} catch {
				const hash2 = await walletClient.writeContract({
					address: COLLECTION3,
					abi: erc721TransferAbi,
					functionName: "transferFrom",
					args: [account.address, REDEEMER, id],
				});
				await publicClient.waitForTransactionReceipt({ hash: hash2 as Hex });
			}
		}
		console.log(`  ✓ batch ${i + 1} fallback done`);
	}

	console.log("All batches completed.");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});



