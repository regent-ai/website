'use client';

import * as React from "react";
import type { WalletClient } from "viem";

interface WalletState {
	account: `0x${string}` | null;
	wallet: WalletClient | null;
	chainId: number | null;
}

let state: WalletState = {
	account: null,
	wallet: null,
	chainId: null,
};

const listeners = new Set<() => void>();

export function setWalletState(next: Partial<WalletState>) {
	state = {
		...state,
		...next,
	};
	listeners.forEach((l) => l());
}

export function clearWalletState() {
	state = {
		account: null,
		wallet: null,
		chainId: null,
	};
	listeners.forEach((l) => l());
}

export function useWalletStore(): WalletState {
	return React.useSyncExternalStore(
		(cb) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		() => state,
		() => state,
	);
}


