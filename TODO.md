# TODO

## Current
- [ ] Set `NEXT_PUBLIC_REDEEMER_ADDRESS` to deployed Redeemer contract  
  - Files: `src/lib/env.ts` (env wiring), `.env.local`
- [ ] Add `OPENSEA_API_KEY` to `.env.local` to enable holdings lookup  
  - Files: `src/lib/env.ts`, `src/app/api/opensea/route.ts`
- [ ] Verify on Base mainnet with a small test redemption  
  - Components: `src/components/redeem/redeem-widget.tsx`

## Completed
- [x] Add dedicated `/redeem` route with centered widget + wallet connector  
  - Files: `src/app/redeem/page.tsx`
- [x] Remove widget overlay from home page  
  - Files: `src/app/page.tsx`
- [x] Hide top 4 rows of grid cells to clear space for widget  
  - Files: `src/components/grid-hero.tsx`
- [x] Remove middle overlay text from hero  
  - Files: `src/components/grid-hero.tsx`
- [x] Undo no-cursor effect on hero grid  
  - Files: `src/app/globals.css` (remove `.grid { cursor: none; }`)
- [x] Raise Redeem widget overlay z-index and ensure pointer events  
  - Files: `src/app/page.tsx` (fixed overlay, z-index 99999; pointerEvents tuned)
- [x] Center Redeem widget over hero and keep “+” edge effect  
  - Files: `src/app/page.tsx`
- [x] Re-enable wallet connector in top-right  
  - Files: `src/components/wallet/wallet-connector.tsx`, `src/app/page.tsx`
- [x] Add Atomic Swap widget UI and center it on the home page  
  - Files: `src/components/swap/atomic-swap-widget.tsx`, `src/app/page.tsx`
- [x] Preserve GridHero “+” edge effect behind centered widget  
  - Files: `src/app/page.tsx`, `src/components/grid-hero.tsx` (no changes needed)
- [x] Deprioritize/Remove RedeemWidget on the home page  
  - Files: `src/app/page.tsx`
- [x] Add Permit2 helper and typed data  
  - Files: `src/lib/permit2.ts`
- [x] Implement Redeem widget with viem + Permit2 and setApprovalForAll  
  - Files: `src/components/redeem/redeem-widget.tsx`, `src/lib/redeem-constants.ts`
- [x] Wire Redeem widget on home page  
  - Files: `src/app/page.tsx`
- [x] Add OpenSea holdings proxy API route  
  - Files: `src/app/api/opensea/route.ts`
- [x] Extend env for `NEXT_PUBLIC_REDEEMER_ADDRESS` and `OPENSEA_API_KEY`  
  - Files: `src/lib/env.ts`, `.env.local`


