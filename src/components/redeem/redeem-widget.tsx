'use client';

import React from "react";
import { Button } from "@/components/ui/button";
import { base } from "viem/chains";
import {
	createWalletClient,
	custom,
	createPublicClient,
	http,
	type WalletClient,
	type Hex,
	formatUnits,
} from "viem";
import {
	ANIMATA1,
	ANIMATA2,
	USDC,
	REGENT,
	COLLECTION3,
	USDC_PRICE,
	erc721Abi,
	erc20Abi,
	redeemerAbi,
	REGENT_PAYOUT,
} from "@/lib/redeem-constants";
import {
	PermitTransferFromTypes,
	permit2Domain,
	type PermitTransferFrom,
} from "@/lib/permit2";
import { env } from "@/lib/env";
import { setWalletState, useWalletStore } from "@/lib/wallet-store";

interface RedeemWidgetProps {
	variant?: "full" | "simple";
}

type SourceKey = "ANIMATA1" | "ANIMATA2";

interface HoldingList {
	animata1: number[];
	animata2: number[];
}

function getSourceAddress(key: SourceKey): `0x${string}` {
	return key === "ANIMATA1" ? ANIMATA1 : ANIMATA2;
}

function getSourceSlug(key: SourceKey): "animata" | "regent-animata-ii" {
	return key === "ANIMATA1" ? "animata" : "regent-animata-ii";
}

function makeNonce(): bigint {
	// random 256-bit-ish via crypto + time
	const rand = Math.floor(Math.random() * 1e9);
	const now = Date.now();
	const mixed = (BigInt(rand) << BigInt(64)) | BigInt(now);
	return mixed;
}

function getReadableError(e: unknown): string {
	try {
		const anyErr = e as any;
		const msg =
			anyErr?.shortMessage ??
			anyErr?.cause?.shortMessage ??
			anyErr?.message ??
			anyErr?.cause?.message;
		if (msg) return String(msg);
		return typeof e === "string" ? e : JSON.stringify(e);
	} catch {
		return String(e);
	}
}

function formatRegentRounded2(amount: bigint): string {
	const denom = 10n ** 18n;
	const scaled = amount * 100n; // two decimals
	const cents = (scaled + denom / 2n) / denom; // round to nearest
	const whole = cents / 100n;
	const frac = cents % 100n;
	function addCommas(n: string): string {
		let s = n;
		let sign = "";
		if (s.startsWith("-")) {
			sign = "-";
			s = s.slice(1);
		}
		const parts: string[] = [];
		for (let i = s.length; i > 0; i -= 3) {
			const start = Math.max(0, i - 3);
			parts.unshift(s.slice(start, i));
		}
		return sign + parts.join(",");
	}
	return `${addCommas(whole.toString())}.${frac.toString().padStart(2, "0")}`;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function RedeemWidget({ variant = "full" }: RedeemWidgetProps) {
	const [wallet, setWallet] = React.useState<WalletClient | null>(null);
	const [account, setAccount] = React.useState<`0x${string}` | null>(null);
	const [chainId, setChainId] = React.useState<number | null>(null);
	const [source, setSource] = React.useState<SourceKey>("ANIMATA1");
	const [tokenId, setTokenId] = React.useState<string>("");
	const [status, setStatus] = React.useState<"idle" | "connecting" | "approving" | "redeeming" | "fetching" | "claiming">("idle");
	const [error, setError] = React.useState<string | null>(null);
	const [holdings, setHoldings] = React.useState<HoldingList | null>(null);
	const [claimable, setClaimable] = React.useState<bigint | null>(null);
	const [fetched, setFetched] = React.useState<{ ANIMATA1: boolean; ANIMATA2: boolean }>({
		ANIMATA1: false,
		ANIMATA2: false,
	});
	// Pre-checks / approvals state
	const [nftApproved, setNftApproved] = React.useState<boolean>(false);
	const [usdcAllowanceOk, setUsdcAllowanceOk] = React.useState<boolean>(false);
	const [usdcBalanceOk, setUsdcBalanceOk] = React.useState<boolean>(false);
	const [c3Available, setC3Available] = React.useState<boolean>(false);
	const [regentFunded, setRegentFunded] = React.useState<boolean>(false);
	const [ownsSelectedToken, setOwnsSelectedToken] = React.useState<boolean | null>(null);
	const [showSuccess, setShowSuccess] = React.useState<boolean>(false);
	const [successTotal, setSuccessTotal] = React.useState<bigint | null>(null);

	const publicClient = React.useMemo(
		() =>
			createPublicClient({
				chain: base,
				transport: http(env.NEXT_PUBLIC_BASE_RPC_URL ?? env.NEXT_PUBLIC_RPC_URL),
			}),
		[],
	);

	const redeemerAddress = React.useMemo(() => {
		const addr = env.NEXT_PUBLIC_REDEEMER_ADDRESS;
		return (addr?.toLowerCase() as `0x${string}` | undefined) ?? undefined;
	}, []);

	// Sync local wallet state with global store
	const sharedWallet = useWalletStore();
	React.useEffect(() => {
		if (sharedWallet.wallet && wallet !== sharedWallet.wallet) setWallet(sharedWallet.wallet);
		if (sharedWallet.account && account !== sharedWallet.account) setAccount(sharedWallet.account);
		if (sharedWallet.chainId && chainId !== sharedWallet.chainId) setChainId(sharedWallet.chainId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sharedWallet.wallet, sharedWallet.account, sharedWallet.chainId]);

	// When a wallet connects (via top-right connector), prefetch claimable
	React.useEffect(() => {
		const acc = account ?? sharedWallet.account;
		if (!redeemerAddress || !acc) return;
		void (async () => {
			try {
				const c = (await publicClient.readContract({
					address: redeemerAddress,
					abi: redeemerAbi,
					functionName: "claimable",
					args: [acc],
				})) as bigint;
				setClaimable(c);
				if (c > BigInt(0)) {
					console.log("[RedeemWidget] Claimable REGENT for", acc, `${formatUnits(c, 18)} REGENT`);
				}
			} catch {
				// ignore
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [redeemerAddress, account, sharedWallet.account]);

	async function ensureWallet() {
		// Already connected via global store or local?
		const existingWallet = wallet ?? sharedWallet.wallet;
		const existingAccount = account ?? sharedWallet.account;
		const existingChainId = chainId ?? sharedWallet.chainId;
		if (existingWallet && existingAccount && existingChainId === base.id) return;
		if (typeof window === "undefined" || !(window as any).ethereum) {
			throw new Error("No injected wallet found (e.g., MetaMask).");
		}
		setStatus("connecting");
		try {
			const wc = createWalletClient({
				chain: base,
				transport: custom((window as any).ethereum),
			});
			const [addr] = (await (window as any).ethereum.request({
				method: "eth_requestAccounts",
			})) as string[];
			setWallet(wc);
			setAccount(addr as `0x${string}`);
			const currentChainId = await wc.getChainId();
			if (currentChainId !== base.id) {
				await wc.switchChain({ id: base.id });
				setChainId(base.id);
			} else {
				setChainId(currentChainId);
			}
			setWalletState({ account: addr as `0x${string}`, wallet: wc, chainId: base.id });
			// Prefetch claimable after connect
			if (redeemerAddress) {
				try {
					const c = (await publicClient.readContract({
						address: redeemerAddress,
						abi: redeemerAbi,
						functionName: "claimable",
						args: [addr as `0x${string}`],
					})) as bigint;
					setClaimable(c);
				} catch {
					// ignore if contract not supporting (during dev)
				}
			}
		} finally {
			setStatus("idle");
		}
	}

	async function ensureNftApproval() {
		if (!wallet || !account) throw new Error("Connect wallet first.");
		const collection = getSourceAddress(source);
		const approved = (await publicClient.readContract({
			address: collection,
			abi: erc721Abi,
			functionName: "isApprovedForAll",
			args: [account, redeemerAddress!],
		})) as boolean;
		setNftApproved(approved);
		if (approved) return;
		setStatus("approving");
		try {
			const hash = await wallet.writeContract({
				address: collection,
				abi: erc721Abi,
				functionName: "setApprovalForAll",
				args: [redeemerAddress!, true],
				account,
				chain: base,
			});
			await publicClient.waitForTransactionReceipt({ hash });
			setNftApproved(true);
		} finally {
			setStatus("idle");
		}
	}

	async function approveUSDC() {
		setError(null);
		if (!wallet || !account) throw new Error("Connect wallet first.");
		setStatus("approving");
		try {
			const hash = await wallet.writeContract({
				address: USDC,
				abi: erc20Abi,
				functionName: "approve",
				// Classic path: approve Redeemer to pull exactly 80 USDC
				args: [redeemerAddress!, USDC_PRICE],
				account,
				chain: base,
			});
			await publicClient.waitForTransactionReceipt({ hash });
			setUsdcAllowanceOk(true);
		} catch (e) {
			setError(getReadableError(e));
		} finally {
			setStatus("idle");
		}
	}

	async function redeemClassic() {
		setError(null);
		try {
			await ensureWallet();
			if (!wallet || !account) throw new Error("Wallet not ready.");
			// Snapshot before-state outstanding vest
			let beforeOutstanding: bigint | null = null;
			try {
				const [poolB, releasedB, claimedB] = (await publicClient.readContract({
					address: redeemerAddress!,
					abi: redeemerAbi,
					functionName: "getVest",
					args: [account],
					blockTag: "latest",
				})) as readonly [bigint, bigint, bigint, bigint];
				beforeOutstanding = poolB + releasedB - claimedB;
			} catch {
				// ignore snapshot failures
			}
			const tid = BigInt(tokenId);
			if (tid < BigInt(1) || tid > BigInt(999)) throw new Error("Token ID must be 1–999.");
			await ensureNftApproval();
			// ensure allowance
			const allowance = (await publicClient.readContract({
				address: USDC,
				abi: erc20Abi,
				functionName: "allowance",
				args: [account, redeemerAddress!],
			})) as bigint;
			if (allowance < USDC_PRICE) throw new Error("Approve USDC for 80 first.");
			console.log("[RedeemWidget] redeemClassic start", {
				account,
				source,
				tokenId: tid.toString(),
				nftApproved,
				usdcAllowanceOk,
				usdcBalanceOk,
				c3Available,
				regentFunded,
			});
			// Dry-run first to capture exact revert reasons
			try {
				await publicClient.simulateContract({
					address: redeemerAddress!,
					abi: redeemerAbi,
					functionName: "redeem",
					args: [getSourceAddress(source), tid],
					account,
					chain: base,
				});
			} catch (simErr) {
				console.error("[RedeemWidget] redeemClassic simulate error", simErr);
				throw new Error(getReadableError(simErr));
			}
			setStatus("redeeming");
			const hash = await wallet.writeContract({
				address: redeemerAddress!,
				abi: redeemerAbi,
				functionName: "redeem",
				args: [getSourceAddress(source), tid],
				account,
				chain: base,
			});
			console.log("[RedeemWidget] redeemClassic tx submitted", hash);
			await publicClient.waitForTransactionReceipt({ hash });
			setStatus("idle");
			await refreshClaimable();
			// Read vest totals and show success modal
			try {
				let attempts = 0;
				let outstanding = 0n;
				while (attempts < 8) {
					const [pool, released, claimed] = (await publicClient.readContract({
						address: redeemerAddress!,
						abi: redeemerAbi,
						functionName: "getVest",
						args: [account],
						blockTag: "latest",
					})) as readonly [bigint, bigint, bigint, bigint];
					outstanding = pool + released - claimed;
					if (beforeOutstanding === null || outstanding >= beforeOutstanding + REGENT_PAYOUT) break;
					attempts += 1;
					await sleep(1000);
				}
				setSuccessTotal(outstanding < 0n ? 0n : outstanding);
				setShowSuccess(true);
			} catch (e) {
				console.error("[RedeemWidget] getVest read failed", e);
			}
		} catch (e) {
			setStatus("idle");
			console.error("[RedeemWidget] redeemClassic error", e);
			setError(getReadableError(e));
		}
	}

	async function runPrechecks() {
		if (!redeemerAddress || !account) return;
		try {
			const tid = /^\d+$/.test(tokenId) ? BigInt(tokenId) : BigInt(0);
			const newId = source === "ANIMATA1" ? tid : tid + BigInt(999);
			const [ownerC3, regentBal, usdcBal, allowance, approved] = await Promise.all([
				tid >= BigInt(1) && tid <= BigInt(999)
					? publicClient
							.readContract({
								address: COLLECTION3,
								abi: [
									{
										type: "function",
										name: "ownerOf",
										stateMutability: "view",
										inputs: [{ name: "tokenId", type: "uint256" }],
										outputs: [{ name: "", type: "address" }],
									},
								] as const,
								functionName: "ownerOf",
								args: [newId],
							})
							.catch(() => null)
					: Promise.resolve(null),
				publicClient.readContract({
					address: REGENT,
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [redeemerAddress],
				}),
				publicClient.readContract({
					address: USDC,
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [account],
				}),
				publicClient.readContract({
					address: USDC,
					abi: erc20Abi,
					functionName: "allowance",
					// Classic path: Redeemer is spender
					args: [account, redeemerAddress],
				}),
				publicClient.readContract({
					address: getSourceAddress(source),
					abi: erc721Abi,
					functionName: "isApprovedForAll",
					args: [account, redeemerAddress],
				}),
			]);
			setC3Available(ownerC3?.toString().toLowerCase() === redeemerAddress.toLowerCase());
			setRegentFunded((regentBal as bigint) >= REGENT_PAYOUT);
			setUsdcBalanceOk((usdcBal as bigint) >= USDC_PRICE);
			setUsdcAllowanceOk((allowance as bigint) >= USDC_PRICE);
			setNftApproved(approved as boolean);
		} catch {
			// ignore
		}
	}

	async function refreshClaimable() {
		const acc = account ?? sharedWallet.account;
		if (!redeemerAddress || !acc) return;
		try {
			const c = (await publicClient.readContract({
				address: redeemerAddress,
				abi: redeemerAbi,
				functionName: "claimable",
				args: [acc],
			})) as bigint;
			setClaimable(c);
			if (c > BigInt(0)) {
				console.log("[RedeemWidget] Claimable REGENT for", acc, `${formatUnits(c, 18)} REGENT`);
			}
		} catch (e) {
			// ignore
		}
	}

	async function claimRegent() {
		setError(null);
		if (!redeemerAddress) return;
		try {
			await ensureWallet();
			if (!wallet || !account) throw new Error("Wallet not ready.");
			setStatus("claiming");
			const hash = await wallet.writeContract({
				address: redeemerAddress,
				abi: redeemerAbi,
				functionName: "claim",
				args: [],
				account,
				chain: base,
			});
			await publicClient.waitForTransactionReceipt({ hash });
			await refreshClaimable();
		} catch (e: unknown) {
			setError(getReadableError(e));
		} finally {
			setStatus("idle");
		}
	}

	async function redeemWithPermit() {
		setError(null);
		if (!redeemerAddress) {
			setError("Missing NEXT_PUBLIC_REDEEMER_ADDRESS env.");
			return;
		}
		try {
			await ensureWallet();
			if (!wallet || !account) throw new Error("Wallet not ready.");
			const tid = BigInt(tokenId);
			if (tid < BigInt(1) || tid > BigInt(999)) throw new Error("Token ID must be 1–999.");

			// 0) Pre-check Collection 3 availability (avoid wasting signature/tx if not deposited)
			try {
				const newId = source === "ANIMATA1" ? tid : tid + BigInt(999);
				const owner = (await publicClient.readContract({
					address: COLLECTION3,
					abi: [
						{
							type: "function",
							name: "ownerOf",
							stateMutability: "view",
							inputs: [{ name: "tokenId", type: "uint256" }],
							outputs: [{ name: "", type: "address" }],
						},
					] as const,
					functionName: "ownerOf",
					args: [newId],
				})) as `0x${string}`;
				if (owner.toLowerCase() !== redeemerAddress.toLowerCase()) {
					throw new Error(`Collection 3 token #${newId} not available (held by ${owner}).`);
				}
			} catch (pre) {
				throw new Error(getReadableError(pre));
			}

			// 1) NFT approval
			await ensureNftApproval();

			// 2) Build Permit2 typed data
			const p: PermitTransferFrom = {
				permitted: { token: USDC, amount: USDC_PRICE },
				spender: redeemerAddress!,
				nonce: makeNonce(),
				deadline: BigInt(Math.floor(Date.now() / 1000) + 10 * 60),
			};

			const signature = await wallet.signTypedData({
				account,
				domain: permit2Domain(base.id),
				types: PermitTransferFromTypes,
				primaryType: "PermitTransferFrom",
				message: p as unknown as Record<string, unknown>,
			});

			// 3) Simulate to surface precise revert reasons before sending
			try {
				await publicClient.simulateContract({
					address: redeemerAddress,
					abi: redeemerAbi,
					functionName: "redeemWithPermit",
					args: [
						getSourceAddress(source),
						tid,
						{
							permitted: { token: USDC, amount: USDC_PRICE },
							nonce: p.nonce,
							deadline: p.deadline,
						},
						signature as Hex,
					],
					account,
					chain: base,
				});
			} catch (simErr) {
				throw new Error(getReadableError(simErr));
			}

			// 4) Call redeemWithPermit
			setStatus("redeeming");
			const hash = await wallet.writeContract({
				address: redeemerAddress,
				abi: redeemerAbi,
				functionName: "redeemWithPermit",
				args: [
					getSourceAddress(source),
					tid,
					{
						permitted: { token: USDC, amount: USDC_PRICE },
						nonce: p.nonce,
						deadline: p.deadline,
					},
					signature as Hex,
				],
				account,
				chain: base,
			});
			await publicClient.waitForTransactionReceipt({ hash });
			setStatus("idle");
			// After redeem, claimable may still be 0 if vesting—refresh anyway
			await refreshClaimable();
		} catch (e: unknown) {
			setStatus("idle");
			setError(getReadableError(e));
		}
	}

	async function fetchHoldings() {
		if (!account) {
			setError("Connect wallet first.");
			return;
		}
		setStatus("fetching");
		setError(null);
		try {
			const slug = getSourceSlug(source);
			const res = await fetch(`/api/opensea?address=${account}&collection=${slug}`, { cache: "no-store" });
			if (!res.ok) {
				const text = await res.text();
				throw new Error(`OpenSea proxy failed: ${text}`);
			}
			const data = (await res.json()) as { animata1: number[]; animata2: number[] };
			// Merge into cache so switching collections uses previously fetched data
			setHoldings((prev) => {
				const prev1 = prev?.animata1 ?? [];
				const prev2 = prev?.animata2 ?? [];
				return {
					animata1: slug === "animata" ? (Array.isArray(data.animata1) ? data.animata1 : []) : prev1,
					animata2: slug === "regent-animata-ii" ? (Array.isArray(data.animata2) ? data.animata2 : []) : prev2,
				};
			});
			setFetched((old) => ({ ...old, [source]: true }));
		} catch (e: unknown) {
			setError((e as Error)?.message ?? String(e));
		} finally {
			setStatus("idle");
		}
	}

	// Auto-fetch on source change if not cached; also after connect
	React.useEffect(() => {
		if (!account) return;
		if (source === "ANIMATA1" && !fetched.ANIMATA1) {
			void fetchHoldings();
		} else if (source === "ANIMATA2" && !fetched.ANIMATA2) {
			void fetchHoldings();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [account, source]);

	// Run prechecks (allowance, balances, approvals, C3 availability) when connected or source/id changes
	React.useEffect(() => {
		if (!account && !sharedWallet.account) return;
		void runPrechecks();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [account, sharedWallet.account, source, tokenId]);

	// Check ownership of the selected token in the chosen source collection
	React.useEffect(() => {
		const acc = account ?? sharedWallet.account;
		if (!acc) return;
		if (!/^\d+$/.test(tokenId)) { setOwnsSelectedToken(null); return; }
		const tid = BigInt(tokenId);
		if (tid < 1n || tid > 999n) { setOwnsSelectedToken(null); return; }
		void (async () => {
			try {
				const owner = (await publicClient.readContract({
					address: getSourceAddress(source),
					abi: [
						{
							type: "function",
							name: "ownerOf",
							stateMutability: "view",
							inputs: [{ name: "tokenId", type: "uint256" }],
							outputs: [{ name: "", type: "address" }],
						},
						{
							type: "function",
							name: "getApproved",
							stateMutability: "view",
							inputs: [{ name: "tokenId", type: "uint256" }],
							outputs: [{ name: "", type: "address" }],
						},
					] as const,
					functionName: "ownerOf",
					args: [tid],
				})) as `0x${string}`;
				const ok = owner.toLowerCase() === acc.toLowerCase();
				setOwnsSelectedToken(ok);
				let approvedForToken: `0x${string}` | null = null;
				try {
					approvedForToken = (await publicClient.readContract({
						address: getSourceAddress(source),
						abi: [
							{
								type: "function",
								name: "getApproved",
								stateMutability: "view",
								inputs: [{ name: "tokenId", type: "uint256" }],
								outputs: [{ name: "", type: "address" }],
							},
						] as const,
						functionName: "getApproved",
						args: [tid],
					})) as `0x${string}`;
				} catch {}
				console.log("[RedeemWidget] ownership check", {
					source,
					tokenId: tokenId,
					owner,
					account: acc,
					owns: ok,
					getApproved: approvedForToken,
				});
			} catch {
				setOwnsSelectedToken(false);
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [account, sharedWallet.account, source, tokenId]);

	// Log which NFT collections are approved for the connected account (Animata 1/2)
	const lastApprovalLogRef = React.useRef<string | null>(null);
	React.useEffect(() => {
		const acc = account ?? sharedWallet.account;
		if (!acc || !redeemerAddress) return;
		void (async () => {
			try {
				const [a1, a2] = await Promise.all([
					publicClient.readContract({
						address: ANIMATA1,
						abi: erc721Abi,
						functionName: "isApprovedForAll",
						args: [acc, redeemerAddress],
					}) as Promise<boolean>,
					publicClient.readContract({
						address: ANIMATA2,
						abi: erc721Abi,
						functionName: "isApprovedForAll",
						args: [acc, redeemerAddress],
					}) as Promise<boolean>,
				]);
				const signature = `${acc}-${redeemerAddress}-${a1 ? 1 : 0}-${a2 ? 1 : 0}`;
				if (lastApprovalLogRef.current !== signature) {
					lastApprovalLogRef.current = signature;
					console.log("[RedeemWidget] NFT approvals:", {
						account: acc,
						forRedeemer: redeemerAddress,
						Animata1: a1,
						Animata2: a2,
					});
				}
				// keep single-source state in sync
				setNftApproved(source === "ANIMATA1" ? a1 : a2);
			} catch {
				// ignore
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [redeemerAddress, account, sharedWallet.account, source]);

	if (variant === "simple") {
		const connectedAccount = account ?? sharedWallet.account;
		const tokenIdValid = /^\d+$/.test(tokenId) && Number(tokenId) >= 1 && Number(tokenId) <= 999;
		const actionBtnShade = tokenIdValid ? "bg-green-500 hover:bg-green-400" : "bg-green-700";
		return (
			<div className="mx-auto my-8 w-full max-w-2xl rounded-xl border border-white/15 bg-white/10 p-6 backdrop-blur">
				<div className="mb-6">
					<h3 className="text-2xl md:text-3xl font-bold text-white">
						Use Animata Pass to Purchase 5 million $REGENT for 80 USDC
					</h3>
				</div>
				<div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
					<div className="col-span-1">
						<label className="mb-3 block text-sm md:text-xl text-white/80">Source Collection</label>
						<select
							className="w-full rounded-md border border-white/10 bg-black/20 p-4 text-xl md:text-3xl"
							value={source}
							onChange={(e) => setSource(e.target.value as SourceKey)}
						>
							<option value="ANIMATA1">Animata I</option>
							<option value="ANIMATA2">Animata II</option>
						</select>
					</div>
					<div className="col-span-1">
						<label className="mb-3 block text-sm md:text-xl text-white/80">Token ID (1 to 999)</label>
						<input
							inputMode="numeric"
							aria-invalid={tokenId.length > 0 && !tokenIdValid}
							disabled={!connectedAccount}
							title={connectedAccount ? undefined : "Connect wallet to enter a token ID"}
							className={`w-full rounded-md bg-black/20 p-4 text-xl md:text-3xl ${tokenId.length > 0 && !tokenIdValid ? "border-red-500 border" : "border border-white/10"} ${!connectedAccount ? "opacity-50 cursor-not-allowed" : ""}`}
							placeholder="e.g. 123"
							value={tokenId}
							onChange={(e) => setTokenId(e.target.value.trim())}
						/>
						{tokenId.length > 0 && !tokenIdValid ? (
							<p className="mt-2 text-sm md:text-base text-red-400">Enter a whole number from 1 to 999.</p>
						) : !connectedAccount ? (
							<p className="mt-2 text-sm md:text-base text-white/60">Connect your wallet to enter a token ID.</p>
						) : ownsSelectedToken === false ? (
							<p className="mt-2 text-sm md:text-base text-red-400">You don’t own this token in {source === "ANIMATA1" ? "Animata 1" : "Animata 2"}.</p>
						) : null}
					</div>
					<div className="col-span-1 flex flex-col items-stretch gap-2 justify-end">
						{connectedAccount && nftApproved === false && (
							<Button
								variant="ghost"
								className="border border-white/20"
								onClick={ensureNftApproval}
								disabled={status === "approving"}
								title="Grant Redeemer permission to transfer your Animata NFT"
							>
								{status === "approving" ? "Approving NFT…" : "Approve NFT"}
							</Button>
						)}
						{connectedAccount && !usdcAllowanceOk && (
							<Button
								variant="ghost"
								className="border border-white/20"
								onClick={approveUSDC}
								disabled={status === "approving"}
								title="Approve Redeemer to spend 80 USDC for this redemption"
							>
								{status === "approving" ? "Approving USDC…" : "Approve 80 USDC"}
							</Button>
						)}
						<Button
							variant="secondary"
							size="lg"
							className={`w-full h-14 text-xl md:text-3xl ${actionBtnShade} text-black font-semibold`}
							onClick={redeemClassic}
							disabled={!connectedAccount || !tokenIdValid || ownsSelectedToken === false || !usdcAllowanceOk || status === "redeeming"}
							title={connectedAccount ?? "Connect"}
						>
							{status === "redeeming" ? "Processing…" : "Use Pass for $REGENT"}
						</Button>
					</div>
				</div>
				{connectedAccount && (
					<div className="mt-4 flex items-center justify-between">
						<p className="text-lg md:text-xl text-white/80">
							Claimable REGENT:{" "}
							<span className="font-semibold">
								{claimable !== null ? `${formatRegentRounded2(claimable)} REGENT` : "—"}
							</span>
						</p>
						<div className="flex items-center gap-2">
							<Button variant="ghost" className="border border-white/20" onClick={refreshClaimable} disabled={status !== "idle"}>
								Refresh
							</Button>
							<Button
								variant="ghost"
								className="border border-green-500 text-green-400 hover:bg-green-500/10"
								onClick={claimRegent}
								disabled={status === "claiming" || !claimable || claimable === BigInt(0)}
							>
								{status === "claiming" ? "Claiming…" : "Claim REGENT"}
							</Button>
						</div>
					</div>
				)}
				{error && <p className="mt-4 text-base md:text-lg text-red-400">{error}</p>}
				<p className="mt-6 text-xl md:text-2xl text-white/70">$REGENT vests over 7 days</p>

				{/* Success Modal */}
				{showSuccess && (
					<div className="fixed inset-0 z-[1000] flex items-center justify-center">
						<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSuccess(false)} />
						<div className="relative z-[1001] max-w-xl w-[92%] rounded-xl border border-white/15 bg-black/90 p-6 text-white shadow-2xl">
							<h4 className="mb-2 text-2xl font-bold">Success!</h4>
							<p className="text-lg leading-relaxed">
								You now have{" "}
								<span className="font-semibold">{successTotal !== null ? `${formatRegentRounded2(successTotal)} REGENT` : "—"}</span>{" "}
								being streamed to you over 7 days. You can receive any portion of it using the Claim button.
							</p>
							<div className="mt-4 flex justify-end gap-2">
								<Button variant="ghost" className="border border-white/20" onClick={() => setShowSuccess(false)}>
									Close
								</Button>
								<Button
									variant="ghost"
									className="border border-green-500 text-green-400 hover:bg-green-500/10"
									onClick={() => {
										void refreshClaimable();
										setShowSuccess(false);
									}}
								>
									Check Claimable
								</Button>
							</div>
						</div>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="mx-auto my-8 w-full max-w-3xl rounded-lg border border-white/10 p-6">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="text-xl font-bold">Animata Redemption (Permit2)</h3>
				<div className="flex items-center gap-2">
					<Button
						variant="secondary"
						onClick={ensureWallet}
						disabled={status === "connecting"}
						title={account ?? "Connect"}
					>
						{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : status === "connecting" ? "Connecting…" : "Connect Wallet"}
					</Button>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div className="col-span-1">
					<label className="mb-1 block text-[0.58rem] text-white/70">Source Collection</label>
					<select
						className="w-full rounded-md border border-white/10 bg-transparent p-2"
						value={source}
						onChange={(e) => setSource(e.target.value as SourceKey)}
					>
						<option className="text-2xl" value="ANIMATA1">Animata 1</option>
						<option className="text-2xl" value="ANIMATA2">Animata 2</option>
					</select>
				</div>
				<div className="col-span-1">
					<label className="mb-1 block text-[0.58rem] text-white/70">Token ID (1 to 999)</label>
					<input
						inputMode="numeric"
						className="w-full rounded-md border border-white/10 bg-transparent p-2"
						placeholder="e.g. 123"
						value={tokenId}
						onChange={(e) => setTokenId(e.target.value.trim())}
					/>
				</div>
				<div className="col-span-1 flex items-end gap-2">
					<Button onClick={ensureNftApproval} disabled={!account || status === "approving"}>
						{status === "approving" ? "Approving NFT…" : "Approve NFT"}
					</Button>
					<Button onClick={approveUSDC} disabled={!account || status === "approving"}>
						{status === "approving" ? "Approving USDC…" : "Approve USDC (80)"}
					</Button>
					<Button onClick={redeemWithPermit} disabled={!account || !tokenId || status === "redeeming"}>
						{status === "redeeming" ? "Redeeming…" : "Redeem (80 USDC via Permit2)"}
					</Button>
					<Button onClick={redeemClassic} disabled={!account || !tokenId || status === "redeeming"}>
						{status === "redeeming" ? "Redeeming…" : "Redeem (Classic)"}
					</Button>
				</div>
			</div>

			<div className="mt-6">
				<div className="mb-2 flex items-center justify-between">
					<p className="text-sm text-white/70">
						Price: 80 USDC — You’ll receive the mapped Collection 3 NFT immediately.
						REGENT becomes claimable linearly over 7 days.
					</p>
					<Button variant="ghost" onClick={fetchHoldings} disabled={!account || status === "fetching"}>
						{status === "fetching" ? "Loading…" : "Fetch My NFTs"}
					</Button>
				</div>
				{(account ?? sharedWallet.account) && (
					<div className="mb-3 flex items-center justify-between">
						<p className="text-sm text-white/80">
							Claimable REGENT:{" "}
							<span className="font-semibold">
								{claimable !== null ? `${formatRegentRounded2(claimable)} REGENT` : "—"}
							</span>
						</p>
						<div className="flex items-center gap-2">
							<Button variant="ghost" className="border border-white/20" onClick={refreshClaimable} disabled={status !== "idle"}>
								Refresh
							</Button>
							<Button
								variant="ghost"
								className="border border-green-500 text-green-400 hover:bg-green-500/10"
								onClick={claimRegent}
								disabled={status === "claiming" || !claimable || claimable === BigInt(0)}
							>
								{status === "claiming" ? "Claiming…" : "Claim REGENT"}
							</Button>
						</div>
					</div>
				)}
				{holdings && (
					<div className="grid grid-cols-1 gap-2">
						<div>
							<p className="mb-1 text-sm font-semibold">
								{source === "ANIMATA1" ? "Animata 1" : "Animata 2"} — Your Tokens
							</p>
							<div className="flex flex-wrap gap-2">
								{(source === "ANIMATA1" ? holdings.animata1 : holdings.animata2).length === 0 ? (
									<span className="text-white/60">None</span>
								) : (
									(source === "ANIMATA1" ? holdings.animata1 : holdings.animata2).map((id) => (
										<button
											key={`${source}-${id}`}
											className="rounded-md border border-white/10 px-2 py-1 text-sm hover:bg-white/5"
											onClick={() => {
												setTokenId(String(id));
											}}
										>
											#{id}
										</button>
									))
								)}
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Pre-checks */}
			{account && (
				<div className="mx-auto mt-6 w-full rounded-lg border border-white/10 p-4">
					<div className="mb-2 flex items-center justify-between">
						<h4 className="text-sm font-semibold">Pre-checks</h4>
						<Button variant="ghost" onClick={runPrechecks} disabled={status !== "idle"}>
							Refresh
						</Button>
					</div>
					<ul className="grid grid-cols-1 gap-1 text-sm text-white/80 sm:grid-cols-2">
						<li>
							<span className={c3Available ? "text-green-400" : "text-white/70"}>C3 mapped ID available</span>
						</li>
						<li>
							<span className={regentFunded ? "text-green-400" : "text-white/70"}>Redeemer REGENT funded</span>
						</li>
						<li>
							<span className={usdcBalanceOk ? "text-green-400" : "text-white/70"}>Your USDC ≥ 80</span>
						</li>
						<li>
							<span className={usdcAllowanceOk ? "text-green-400" : "text-white/70"}>USDC allowance ≥ 80</span>
						</li>
						<li>
							<span className={nftApproved ? "text-green-400" : "text-white/70"}>NFT approval granted</span>
						</li>
					</ul>
				</div>
			)}

			{/* Conditional Claim card (only when user has claimable > 0) */}
			{account && claimable !== null && claimable > 0n && (
				<div className="mx-auto mt-6 w-full rounded-lg border border-white/10 p-6">
					<div className="mb-2 flex items-center justify-between">
						<h4 className="text-lg font-semibold">Claim REGENT</h4>
						<Button variant="ghost" onClick={refreshClaimable} disabled={status !== "idle"}>
							Refresh
						</Button>
					</div>
					<p className="text-sm text-white/80">
						You can claim{" "}
						<span className="font-semibold">{formatUnits(claimable, 18)} REGENT</span>{" "}
						now.
					</p>
					<div className="mt-3">
						<Button onClick={claimRegent} disabled={status === "claiming"}>
							{status === "claiming" ? "Claiming…" : "Claim Now"}
						</Button>
					</div>
				</div>
			)}

			{error && <p className="mt-4 text-sm text-red-400">{error}</p>}
			{redeemerAddress ? (
				<p className="mt-2 text-xs text-white/50">Redeemer: {redeemerAddress}</p>
			) : (
				<p className="mt-2 text-xs text-yellow-400">Set NEXT_PUBLIC_REDEEMER_ADDRESS to enable redemption.</p>
			)}
		</div>
	);
}


