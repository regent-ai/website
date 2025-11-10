## Atomic Swap Widget — Notes for Agents

- File: `src/components/swap/atomic-swap-widget.tsx`
- Purpose: Presentational UI for an atomic swap flow (no on-chain logic yet).
- Placement: Centered overlay on the home page above `GridHero` (the “+” edges remain visible).

Usage

```tsx
import { AtomicSwapWidget } from "@/components/swap/atomic-swap-widget";

// Render inside a centered overlay/container
<AtomicSwapWidget />
```

Design choices

- Stateless beyond local UI state (amount, tokens). No wallet/chain effects here.
- Uses shadcn-style primitives from `src/components/ui` for consistency.
- Keeps footprint compact: glassy panel, Title + From/To + Flip + CTA.

Props

- `className?: string` — optional container className for layout overrides.

Notes

- Rates are mock (derived from simple USD prices) for UI preview only.
- High `z-index` applied by the page overlay ensures precedence over other hero elements.



