"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { base } from "viem/chains";
import { createWalletClient, custom } from "viem";
import { setWalletState, useWalletStore } from "@/lib/wallet-store";
import { env } from "@/lib/env";

export function WalletConnector() {
  const { account } = useWalletStore();
  const [connecting, setConnecting] = React.useState(false);

  async function connect() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      return;
    }
    setConnecting(true);
    try {
      const wc = createWalletClient({
        chain: base,
        transport: custom((window as any).ethereum),
      });
      const [addr] = (await (window as any).ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      try {
        // Ensure Base chain configured with the desired RPC from env
        const rpcUrl =
          env.NEXT_PUBLIC_BASE_RPC_URL ?? env.NEXT_PUBLIC_RPC_URL ?? undefined;
        if (rpcUrl) {
          try {
            await (window as any).ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: "0x2105", // 8453
                  chainName: "Base",
                  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: [rpcUrl],
                  blockExplorerUrls: ["https://basescan.org"],
                },
              ],
            });
          } catch {
            // ignore add errors (already added or wallet doesn't support)
          }
        }
        const currentChainId = await wc.getChainId();
        if (currentChainId !== base.id) {
          await wc.switchChain({ id: base.id });
        }
      } catch {
        // ignore switch errors; user may reject
      }
      setWalletState({
        account: addr as `0x${string}`,
        wallet: wc,
        chainId: base.id,
      });
    } finally {
      setConnecting(false);
    }
  }

  const label = account
    ? `${account.slice(0, 6)}…${account.slice(-4)}`
    : connecting
      ? "Connecting…"
      : "Connect Wallet";

  return (
    <Button
      variant="outline"
      size="lg"
      className="text-base md:text-lg"
      onClick={connect}
      title={account ?? "Connect"}
    >
      {label}
    </Button>
  );
}


