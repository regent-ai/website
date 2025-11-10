"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AtomicSwapWidgetProps {
  className?: string;
}

interface TokenOption {
  symbol: "USDC" | "REGENT" | "ETH";
  name: string;
  decimals: number;
}

const TOKENS: TokenOption[] = [
  { symbol: "USDC", name: "USD Coin", decimals: 6 },
  { symbol: "REGENT", name: "REGENT", decimals: 18 },
  { symbol: "ETH", name: "Ether", decimals: 18 },
];

const PRICE_USD: Record<TokenOption["symbol"], number> = {
  USDC: 1,
  REGENT: 1,
  ETH: 3500,
};

export function AtomicSwapWidget({ className }: AtomicSwapWidgetProps) {
  const [fromSymbol, setFromSymbol] = useState<TokenOption["symbol"]>("USDC");
  const [toSymbol, setToSymbol] = useState<TokenOption["symbol"]>("REGENT");
  const [fromAmount, setFromAmount] = useState<string>("");

  const fromToken = TOKENS.find((t) => t.symbol === fromSymbol)!;
  const toToken = TOKENS.find((t) => t.symbol === toSymbol)!;

  const rate = useMemo(() => {
    if (fromSymbol === toSymbol) return 1;
    return PRICE_USD[fromSymbol] / PRICE_USD[toSymbol];
  }, [fromSymbol, toSymbol]);

  const toAmount = useMemo(() => {
    const parsed = Number(fromAmount || "0");
    if (!isFinite(parsed)) return "";
    const out = parsed * rate;
    if (!isFinite(out)) return "";
    return out.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  }, [fromAmount, rate]);

  function handleFlip() {
    setFromSymbol(toSymbol);
    setToSymbol(fromSymbol);
    // Recompute amounts implicitly via useMemo
  }

  function onChangeFromSymbol(next: TokenOption["symbol"]) {
    setFromSymbol(next);
    if (next === toSymbol) {
      // Auto-select a different toSymbol
      const alternative =
        TOKENS.find((t) => t.symbol !== next)?.symbol ?? toSymbol;
      setToSymbol(alternative);
    }
  }

  function onChangeToSymbol(next: TokenOption["symbol"]) {
    setToSymbol(next);
    if (next === fromSymbol) {
      const alternative =
        TOKENS.find((t) => t.symbol !== next)?.symbol ?? fromSymbol;
      setFromSymbol(alternative);
    }
  }

  const slippageBps = 50; // 0.50% displayed only (UI)

  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md shadow-2xl",
        "w-[min(92vw,560px)]",
        className,
      )}
    >
      <div className="p-5 md:p-7">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-white text-xl md:text-2xl">Atomic Swap</div>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            Base
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-white/70 text-xs">From</label>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Input
                inputMode="decimal"
                placeholder="0.00"
                value={fromAmount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.,]/g, "");
                  setFromAmount(v.replace(/,/g, "."));
                }}
                className="h-12 text-lg"
              />
              <Select
                value={fromSymbol}
                onValueChange={(v) => onChangeFromSymbol(v as TokenOption["symbol"])}
              >
                <SelectTrigger className="h-12 min-w-28">
                  <SelectValue placeholder="Token" />
                </SelectTrigger>
                <SelectContent>
                  {TOKENS.map((t) => (
                    <SelectItem key={t.symbol} value={t.symbol}>
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-white/60">{t.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleFlip}
              className="rounded-full px-3 py-1.5"
              aria-label="Flip tokens"
              title="Flip tokens"
            >
              ⇅
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-white/70 text-xs">To (estimated)</label>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="h-12 rounded-md border border-input bg-transparent px-3 py-1 text-lg text-white/90 shadow-xs flex items-center">
                {toAmount || "0.00"}
              </div>
              <Select
                value={toSymbol}
                onValueChange={(v) => onChangeToSymbol(v as TokenOption["symbol"])}
              >
                <SelectTrigger className="h-12 min-w-28">
                  <SelectValue placeholder="Token" />
                </SelectTrigger>
                <SelectContent>
                  {TOKENS.map((t) => (
                    <SelectItem key={t.symbol} value={t.symbol}>
                      <span className="font-medium">{t.symbol}</span>
                      <span className="text-white/60">{t.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-white/60">
            <div>
              Rate: 1 {fromToken.symbol} ≈ {(rate || 0).toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}{" "}
              {toToken.symbol}
            </div>
            <div>Slippage: {(slippageBps / 100).toFixed(2)}%</div>
          </div>

          <Button className="w-full h-11 text-base mt-2">Swap</Button>

          <div className="text-[11px] text-white/50 leading-relaxed">
            Preview only. This is a UI placeholder for an atomic swap flow. Final
            amounts and settlement will be shown before confirmation.
          </div>
        </div>
      </div>
    </div>
  );
}



