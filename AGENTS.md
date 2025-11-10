# Regent Web – Agents Guide (AGENTS.md)

This repository is a Next.js 15 app router project that showcases accountless payments with x402, Coinbase CDP wallets, the AI SDK, and an MCP server. These notes guide automated and human contributors to work consistently and safely across the codebase.

## Stack & Layout

- Framework: `next@15` (App Router) with Turbopack
- Runtime: Node.js functions (middleware `runtime: "nodejs"`)
- Package manager: `bun` (see `package.json:packageManager`)
- TypeScript: strict (`tsconfig.json`) – use types everywhere
- Styling: Tailwind CSS v4 via PostCSS (see `src/app/globals.css`, `postcss.config.mjs`)
- UI: Radix UI + shadcn-style components under `src/components/ui`
- AI: `ai` and `@ai-sdk/react` for streaming chat, tools, reasoning
- Payments: `x402-next`, `x402-mcp`, `x402-fetch`, Coinbase CDP
- MCP server: `src/app/mcp/route.ts`

Project layout (key areas):
- `src/app` – App Router pages, layouts, and API route handlers
- `src/components` – UI and AI presentation components
- `src/lib` – environment, wallet accounts, utilities
- `src/middleware.ts` – x402 paywall/matcher logic

## Quickstart

- Install: `bun install`
- Dev: `bun run dev` (http://localhost:3000)
- Build: `bun run build`
- Start: `bun run start`
- Type check: `bun run typecheck`

Environment variables (server-only) – see `.env.example`:
- `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` (required)
- `NETWORK` = `base-sepolia` (testnet, default) or `base`
- `URL` – inferred in production from Vercel; defaults to `http://localhost:3000` locally via `src/lib/env.ts`

Store secrets in `.env`/`.env.local` and never log them.

## Conventions

- Imports
  - Use path alias `@/*` (see `tsconfig.json`)
  - ES modules only; avoid `require` (Next config conditionally requires env in non-CI only)
- TypeScript
  - Keep types strict; avoid `any`. Validate inputs with `zod` (see API routes)
  - Run `bun run typecheck` for CI-like validation (build ignores TS errors; don’t rely on that)
- Styling
  - Prefer Tailwind utility classes; merge with `cn` from `src/lib/utils.ts`
  - Keep component APIs typed and minimal; colocate small component styles
- Files & naming
  - Use kebab-case file names; colocate feature code within `src` folders
  - App Router conventions: `page.tsx`, `layout.tsx`, `route.ts` for APIs
- Responses & streaming
  - Use `NextResponse.json(...)` for JSON APIs
  - For streaming (SSE), follow pattern in `src/app/api/bot/route.ts` and use `waitUntil`

## Payments & x402

- Middleware paywalls live in `src/middleware.ts` via `paymentMiddleware(...)` from `x402-next`.
  - Guard pages and API routes by path; keep `config.matcher` exclusions for `_next/` assets and metadata.
  - For `x402-next`, set `price` as a string in USD (e.g., `"$0.005"`).
- Wallet accounts
  - Use `getOrCreateSellerAccount()` for recipients and `getOrCreatePurchaserAccount()` for client-side payments.
  - Testnet auto-faucet logic is in `src/lib/accounts.ts` (only on `base-sepolia`).
- Paid fetch
  - Wrap requests with `wrapFetchWithPayment` when needed (example in `api/bot`).

## MCP Server & Tools

- MCP server handler: `src/app/mcp/route.ts`
  - Define paid tools with `server.paidTool(name, description, { price }, schema, meta, handler)`
    - For `x402-mcp` paid tools, `price` is a number (e.g., `0.001`).
  - Define free tools with `server.tool(...)`.
  - Use `env.NETWORK` and recipient from `getOrCreateSellerAccount()`.
- AI chat client: `src/app/api/chat/route.ts`
  - Creates an MCP client pointed at `/mcp` using `env.URL`.
  - Always call `mcpClient.close()` in `onFinish` to avoid leaks.
  - Include a system prompt that requests user confirmation before authorizing payments.

## API Patterns & Validation

- Validate all inputs with `zod` (see `api/add` and MCP tool schemas).
- Keep route handlers small, typed, and side-effect aware.
- Set `export const maxDuration` where long operations are expected (e.g., chat route).

## UI & Components

- Reuse primitives from `src/components/ui` and AI elements from `src/components/ai-elements`.
- Keep presentational components stateless; compute data in route handlers or server actions.
- Don’t introduce global CSS outside `src/app/globals.css` without strong reason.

### Redemption (UI) and Wallet Connector

- Key files:
  - `src/components/redeem/redeem-widget.tsx` — UI + viem wallet flow (Permit2).
  - `src/components/wallet/wallet-connector.tsx` — Top-right connect button (Base), global convenience.
  - `src/app/redeem/page.tsx` — dedicated redemption route; shows the widget and a top-right wallet connector.
  - `src/app/page.tsx` — home hero only with top-right wallet connector; no redemption UI here.
- Notes:
  - The Redeem widget takes precedence on the home page; `GridHero` remains the animated background.
  - The wallet connector is lightweight and independent; the Redeem widget still manages its own wallet flow.
  - Cursor is visible (removed `.grid { cursor: none; }`); widget overlay uses high z-index for clarity.
  - The previous middle-of-screen teaser text was removed to reduce visual noise.
  - The top 4 grid rows are intentionally empty and the grid is shifted down, leaving a clear top band; the Redeem widget is top-centered in that band with the wallet button at top-right.

## Safety & Guardrails

- Secrets: never log `CDP_*` values or expose server-only env to the client.
- Payments: default to explicit user confirmation in agents. Keep prices minimal on testnet.
- Middleware: don’t widen the matcher to include static/asset routes; keep the current exclusion list.
- Network: respect `env.NETWORK` and avoid hardcoded chain IDs.
- Errors: return typed errors; for SSE, send final `type: "result" | "error"` events.

## Adding Features (recipes)

- Add a paywalled API route
  1) Implement `src/app/api/<name>/route.ts` and validate with `zod`
  2) Add the path and price to `src/middleware.ts` `paymentMiddleware` config

- Add an MCP paid tool
  1) In `src/app/mcp/route.ts`, add `server.paidTool(...)` with a numeric `price`
  2) Optionally expose a free variant with `server.tool(...)`

- Add a chat tool invocation
  1) In `api/chat`, extend `tools: { ... }` or rely on remote MCP tools
  2) Keep streaming (`streamText`) and close the MCP client on finish

## Package Management

- Use `bun` only. Do not commit `npm` or `yarn` lockfiles.
- `bun.lock` is the source of truth. Avoid committing other lockfiles.

## Deployment

- Target: Vercel
- Set env vars in project settings. Switch to mainnet by setting `NETWORK=base`.
- Ensure the Seller account is funded before enabling real payments.

## Notes for Agents

- Keep changes minimal and surgical; match existing patterns and file structure.
- Prefer TypeScript-first, zod validation, and Tailwind utility-first styling.
- Before large edits, scan for similar patterns and reuse utilities.
- When in doubt, run `bun run typecheck` and test locally with `bun run dev`.

## NFT Redemption (Animata → Collection 3)

This app includes a client-side redemption flow that lets a user:
- Approve ERC‑721 `setApprovalForAll` on Animata 1 or 2
- Sign a Uniswap Permit2 typed-data to spend exactly 80 USDC on Base
- Call the `redeemWithPermit` function on the on-chain Redeemer contract

Key files:
- `src/components/redeem/redeem-widget.tsx` — UI + viem wallet flow (Permit2)
- `src/app/api/opensea/route.ts` — server proxy for OpenSea holdings (Base)
- `src/lib/permit2.ts` — Permit2 EIP-712 domain/types
- `src/lib/redeem-constants.ts` — addresses, price, minimal ABIs
- `src/app/page.tsx` — previously wired this under the hero; now the Atomic Swap widget is centered

Configuration:
- `NEXT_PUBLIC_REDEEMER_ADDRESS` — the deployed Redeemer contract (client-visible)
- `OPENSEA_API_KEY` — server key used to fetch user holdings from OpenSea

Notes:
- Chain is Base mainnet (`viem/chains` `base`); wallet auto-switches if needed.
- USDC amount is fixed to `80 * 1e6`.
- Holdings view is optional; user can directly input a token ID 1–999.

On-chain (Base mainnet 8453):
- Animata 1: `0x78402119ec6349a0d41f12b54938de7bf783c923`
- Animata 2: `0x903c4c1e8b8532fbd3575482d942d493eb9266e2`
- Collection 3: `0x2208aadbdecd47d3b4430b5b75a175f6d885d487`
- USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)
- REGENT: `0x6f89bcA4eA5931EdFCB09786267b251DeE752b07` (18 decimals)
- Redeemer: set `NEXT_PUBLIC_REDEEMER_ADDRESS` once deployed

### Batch-transfer Collection 3 to Redeemer

Use the provided Bun/viem script to move all `1..1998` Collection 3 NFTs to the Redeemer in batches via `depositCollection3`:

Env:
```
PRIVATE_KEY=0x...                  # OWNER who holds Collection 3
REDEEMER_ADDRESS=0x...             # deployed AnimataRedeemer
COLLECTION3_ADDRESS=0x2208aadbdecd47d3b4430b5b75a175f6d885d487
RPC_URL=https://mainnet.base.org
START_ID=1
END_ID=1998
CHUNK_SIZE=75                      # tune 50–125 depending on gas
```

Run:
```
bun run scripts/transfer-collection3.ts
# or
bun run transfer:c3
```

Notes:
- The script first calls `setApprovalForAll(Collection3, Redeemer)` if needed.
- Then it sends multiple `depositCollection3(uint256[] ids)` txs, chunked by `CHUNK_SIZE`.
- Only the Redeemer `OWNER` can call `depositCollection3`; use the OWNER’s key.

## TODO large plan 
TL;DR (the thesis)

x402 gives you accountless micropayments over HTTP so agents can pay other agents/APIs programmatically. The Vercel starter already ships a Next.js + AI SDK app that demonstrates “agents that can pay for tools,” paywalled APIs/pages, remote MCP tools, and CDP server wallets out of the box. 
GitHub
+2
X402
+2

ERC‑8004 gives you agent identity + reputation + validation registries onchain. The erc-8004-js SDK exposes a TypeScript client for registering agents, submitting/reading feedback, and requesting validations; the Agent Explorer + Indexer render those trust signals. 
GitHub
+2
GitHub
+2

ez402 lets 3rd‑party devs “bring an API” and auto‑wrap it as an x402 endpoint (and even auto‑expose it as MCP tools), so your marketplace of paid tools grows on its own. 
GitHub

simple‑ai supplies shadcn/UI + React Flow blocks for a great operator UI and a visual agent workflow builder that plays nicely with the Vercel AI SDK. 
GitHub
+1

Observability: the “Claude Code hooks multi‑agent observability” server ingests hook‑style events over POST /events and streams them via WebSocket; with a tiny adapter you can emit AI SDK tool/step telemetry into it, alongside OpenTelemetry traces the AI SDK already supports. 
AI SDK
+3
GitHub
+3
GitHub
+3

Taken together: x402 (revenue) × ERC‑8004 (reputation) makes agent treasuries +EV for good performers; your agent coin represents rights to a revshare generated by on‑chain x402 income on Base (chain id 8453 mainnet / 84532 Base Sepolia). 
Base Documentation

How it fits together (reference architecture)
           ┌─────────────────────────────────────────────────────────────────────┐
           │                               Web Operators                         │
           │  Next.js app (x402 starter) + simple-ai UI + React Flow             │
           │  • Agent chat & “Paid tools” playground                             │
           │  • Visual workflow builder (simple-ai)                              │
           │  • Developer portal to “bring your API” -> ez402                    │
           └─────────────────────────────────────────────────────────────────────┘
                                │
                                │ Registers/Wraps HTTP APIs as paid x402 endpoints
                                ▼
                   ┌─────────────────────────┐
                   │ ez402 wrapper service   │  <-- spins up x402 endpoints & MCP tools
                   │ (Next.js + Workers)     │      for third-party APIs
                   └─────────────────────────┘          :contentReference[oaicite:6]{index=6}
                                │
                                │ 402 challenge/response, verify + settle via facilitator
                                ▼
           ┌──────────────────────────┐     verify/settle      ┌───────────────────────────┐
           │ Paid API (any provider) │  <--------------------> │ x402 Facilitator (CDP)    │
           │ returns resource on pay │                          │ fee‑free USDC on Base     │
           └──────────────────────────┘                          └───────────────────────────┘
                   ▲                                                    :contentReference[oaicite:7]{index=7}
                   │ USDC
                   │
           ┌─────────────────────────────────────────────────────────────────────┐
           │                   Agent Treasury (on Base L2)                        │
           │  • Receives x402 revenue (USDC)                                      │
           │  • Splits/streams to stakeholders & “AgentCoin” holders              │
           │  • Maps onchain to ERC‑8004 agentId                                   │
           └─────────────────────────────────────────────────────────────────────┘
                   ▲                                 ▲
        register/reputation                          │
                   │                                 │ index/query
                   │                                 │
           ┌─────────────────────────┐        ┌───────────────────────────┐
           │ erc-8004-js (TS SDK)    │  --->  │ Agent Explorer + Indexer  │
           │ identity/reputation/val │        │ (subgraph + web explorer) │
           └─────────────────────────┘        └───────────────────────────┘
                         :contentReference[oaicite:8]{index=8}
                   ▲
                   │ emit run/tool events + trace ids
                   │
           ┌─────────────────────────────────────────────────────────────────────┐
           │ Observability Plane                                                 │
           │ • AI SDK telemetry via OpenTelemetry to chosen backend              │
           │ • PLUS “Claude hook” server (Bun+SQLite+WS) for real-time ops UI    │
           │   - we POST normalized events from tools/steps to /events           │
           └─────────────────────────────────────────────────────────────────────┘
                      :contentReference[oaicite:9]{index=9}


Why this is compelling

Monetization is native: pay‑per‑request over HTTP with instant settlement; the starter template already shows agents that can pay for tools, paywalled APIs, and Base mainnet promotion via NETWORK=base. 
GitHub

Trust is native: agents are registered and accrue reputation in ERC‑8004 registries; Explorer + Indexer provide transparent discovery and trust graphs. 
GitHub
+1

Growth is native: ez402 lets 3rd‑party devs mint paid tools into your marketplace and MCP catalog with almost no code. 
GitHub

UX is native: simple‑ai’s components + workflows make a polished operator console quickly, built on shadcn/UI and Vercel AI SDK. 
GitHub

Ops is native: you get real‑time run introspection (the hook server) and standard OpenTelemetry traces from the AI SDK to your preferred observability provider. 
GitHub
+1

Development stack (opinionated)

Runtime & tools

Next.js 15 app (App Router) using Vercel AI SDK + AI Elements / AI Gateway (optional) — from the x402 starter. 
GitHub

simple‑ai components + React Flow for workflow builder & agent UIs. 
GitHub

ez402 service to turn partner APIs into x402 endpoints & auto‑MCP tools; deploy as Next.js routes and/or Workers. 
GitHub

erc-8004-js (TypeScript) for identity/reputation/validation interactions on Base (8453) / Base Sepolia (84532). 
GitHub
+1

Agent Explorer + Agent Indexer to browse agents & trust graphs (indexer runs a subgraph). 
GitHub
+1

Observability

Real‑time ops dashboard: disler/claude-code-hooks-multi-agent-observability (Bun server + Vue client + SQLite + WS). 
GitHub

Standard traces: AI SDK Telemetry (OpenTelemetry) + your backend (Langfuse, Traceloop, SigNoz, etc.). 
AI SDK
+1

Monorepo layout (workspaces/turbo)

apps/
  web/                 # Next.js (x402 starter as foundation) + simple-ai UI
  ez402/               # “bring your API” → x402 endpoint & MCP server
  observability/       # disler server (Bun) + Vue client
  explorer/            # Agent Explorer web app (depends on indexer)
  identity-service/    # (from agent-explorer, optional IPFS/OAuth helpers)
packages/
  agent-sdk/           # wrapper around erc-8004-js + x402 helpers
  ui/                  # shared shadcn/ui components
  workflows/           # React Flow blocks (simple-ai powered)
infra/
  indexer/             # agent-indexer (subgraph & docker-compose)
  contracts/           # AgentTreasury + AgentCoin (ERC-20) + revenue split

Key integration points
1) Payments & app skeleton — start from the x402 starter

The x402 Next.js + AI Starter already includes: AI chat, “agent that can pay for tools,” paywalled APIs/pages, remote MCP tools, server‑managed wallets, Base Sepolia defaults, and a one‑switch move to Base mainnet (NETWORK=base). Use it as your apps/web foundation. 
GitHub

2) Let anyone “bring an API” — wire in ez402

Mount apps/ez402 as your developer portal where providers register an HTTP endpoint; ez402 wraps it with the x402 protocol (HTTP 402 handshake), sets price per request in USDC on Base, and (v2) auto‑exposes those endpoints as MCP tools (deployable to Workers). Your web app can list these tools in the marketplace. 
GitHub

3) Trust layer — ERC‑8004 identities & reputation

Use erc-8004-js to: (a) register the agent identity (URI/IPFS), (b) submit or aggregate reputation feedback (e.g., after successful paid calls), and (c) optionally request validation by third parties. The SDK supports ethers/viem and includes helper utilities (e.g., IPFS URI helpers). 
GitHub

Then run Agent Indexer (subgraph) and Agent Explorer so operators/investors can browse trust graphs, scores, and identities tied to your agents. 
GitHub
+1

4) Observability — can the hook server work with Vercel AI SDK?

Yes—with a slim adapter. The hook server exposes POST /events and streams via WebSocket; it was built for Claude Code events, but the transport is plain HTTP with a simple JSON payload. Emit normalized events (UserPromptSubmit, PreToolUse, PostToolUse, Stop, etc.) from your AI SDK tool wrappers and request handlers. Keep AI SDK OpenTelemetry enabled to any backend you like, but use the hook server for a real‑time dashboard UX. 
GitHub
+2
GitHub
+2

Bonus: The AI SDK exposes tool calling & multi‑step steps data that you can map 1:1 into those event types (e.g., each tool call → PreToolUse/PostToolUse). 
AI SDK
+1

5) Agent Treasury & Coin (on Base)

Point the x402 merchant address for a paid endpoint to your Agent Treasury contract on Base so USDC flows directly to treasury. The treasury can split to team + revshare to AgentCoin holders (e.g., via pull‑based claims or a splitter). Publish the treasury and token addresses in the agent’s ERC‑8004 identity metadata for discoverability and tie them to the Explorer. (General legal note: revshare tokens may be regulated—get counsel.)

Base mainnet chain id 8453; Base Sepolia 84532 (the starter already defaults to Base Sepolia for testing). 
Base Documentation
+1

Minimal code glue (sketches)

A) Emit observability events from AI SDK tools → hook server

// apps/web/lib/obs.ts
type ObsEvent = {
  sourceApp: 'web';
  sessionId: string;
  eventType: 'UserPromptSubmit' | 'PreToolUse' | 'PostToolUse' | 'Stop';
  payload: Record<string, unknown>;
};

export async function emitObs(event: ObsEvent) {
  // disler server default: http://localhost:3001 (Bun)
  await fetch(process.env.OBS_URL + '/events', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(event),
  });
}

// Example tool wrapper (Vercel AI SDK)
import { tool } from 'ai';
import { emitObs } from '@/lib/obs';

export const callPaidService = tool({
  description: 'Call a paid x402 endpoint',
  // ... zod schema omitted
  execute: async (input, { toolName, messages, runId }) => {
    await emitObs({
      sourceApp: 'web',
      sessionId: runId,
      eventType: 'PreToolUse',
      payload: { toolName, input },
    });

    const out = await fetchPaidX402(input); // see starter for flow

    await emitObs({
      sourceApp: 'web',
      sessionId: runId,
      eventType: 'PostToolUse',
      payload: { toolName, ok: true, summary: summarize(out) },
    });

    return out;
  },
});


The disler README lists the event types and the POST /events endpoint used by its Bun server; we’re simply sending the same shapes from our AI SDK code. 
GitHub

B) Register identity & record reputation via erc-8004-js

import { ERC8004Client, EthersAdapter } from 'erc-8004-js';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.RPC_BASE);
const signer = new ethers.Wallet(process.env.OPERATOR_KEY!, provider);

const adapter = new EthersAdapter(provider, signer);
export const e4 = new ERC8004Client({
  adapter,
  addresses: {
    identityRegistry: process.env.E4_ID,
    reputationRegistry: process.env.E4_REP,
    validationRegistry: process.env.E4_VAL,
    chainId: 8453, // Base
  },
});

// Register agent identity with a hosted agent.json (or ipfs://)
const { agentId } = await e4.identity.registerWithURI(process.env.AGENT_URI!);

// When a paid call completes successfully, add feedback:
await e4.reputation.giveFeedback({
  agentId,
  score: 95,
  tag1: 'paid-call',
  tag2: 'low-latency',
  fileuri: 'ipfs://Qm...optionalEvidence',
  feedbackAuth: await e4.reputation.signFeedbackAuth(/* ... */),
});


The SDK shows Identity registration, Reputation feedback, and Validation calls; adapt with Base chain IDs. 
GitHub

Concrete setup steps (local dev)

Clone the starter as apps/web and wire .env for CDP (API key/secret + wallet secret). The README documents running on Base Sepolia by default and switching to Base with NETWORK=base. 
GitHub

Add apps/ez402 and expose a route under /portal to let providers register an API → ez402 wraps it into an x402 endpoint and auto‑MCP server. 
GitHub

Add packages/agent-sdk and install erc-8004-js. Configure Base RPC + registry addresses; expose helper functions for registerIdentity/submitFeedback. 
GitHub

Run the Indexer & Explorer

apps/explorer (Agent Explorer)

infra/indexer (Agent Indexer subgraph) — follow its quick start then bun run dev:web for explorer. 
GitHub

Observability

Start the disler hook server ./scripts/start-system.sh and set OBS_URL in apps/web. 
GitHub

Enable AI SDK Telemetry + pick a provider from the AI SDK’s observability integrations page. 
AI SDK

Contracts

Deploy AgentTreasury and AgentCoin to Base Sepolia (84532) for test; then to Base mainnet (8453); publish addresses in the ERC‑8004 identity metadata. 
Base Documentation

Risks & notes

Regulatory: “AgentCoin” revshare may be regulated (jurisdiction‑dependent). Consider counsel before distribution/marketing.

Payments: x402 uses a facilitator (e.g., CDP on Base mainnet) to verify/settle signed payloads; servers don’t have to run nodes. Fee‑free USDC settlement on Base is available via CDP’s facilitator. 
GitBook

Performance: Build an async settlement path (accept after /verify, return resource; complete /settle out‑of‑band) where latency budgets are tight—x402 supports this model. 
GitBook

Why this stack is a good idea (point‑by‑point)

Programmatic commerce for agents: x402 activates HTTP 402 so any API can price requests; no accounts/OAuth; instant settlement; blockchain‑agnostic design (we pick Base for economics + tooling). 
X402

Trust that scales with usage: ERC‑8004 provides discoverable identities + reputations; Explorer/Indexer make it visible and queryable for routing, pricing, and investor diligence. 
GitHub
+1

Bottom‑up supply: ez402 drastically lowers onboarding friction for third‑party APIs → more paid tools, more x402 flows, more treasury income. 
GitHub

Developer velocity: simple‑ai + the x402 starter let you ship a polished operator console fast and build non‑trivial agent workflows visually. 
GitHub

Production‑grade operations: combine live run room (hook server) with standards‑based OpenTelemetry from the AI SDK to debug latency, costs, and failure modes across both LLM and onchain paths. 
GitHub
+1

Drop‑in README you can start with

README.md

# Agent Coins on Base — x402 × ERC‑8004

Turn great agents into onchain businesses. This monorepo combines:

- **x402 payments** for accountless, per‑request micropayments over HTTP.
- **ERC‑8004** identities/reputation for trust and discovery.
- **Agent Treasury + AgentCoin** to rev‑share x402 income on Base.
- **ez402** so any dev can bring an API and become a paid x402 tool.
- **simple‑ai** for a polished operator UI + visual agent workflows.
- **Observability** via AI SDK OpenTelemetry + a real‑time hook dashboard.

## What’s inside

- `apps/web` — Next.js app (based on Vercel’s x402 starter). AI chat; “paid tools”; paywalled APIs/pages; remote MCP tools; CDP server wallets.  
- `apps/ez402` — Developer portal to wrap arbitrary HTTP endpoints as x402 endpoints and auto‑expose MCP tools.  
- `infra/indexer` + `apps/explorer` — ERC‑8004 Agent Indexer (subgraph) + web Explorer for identity & reputation.  
- `apps/observability` — real‑time run dashboard (Bun server + Vue client).  
- `packages/agent-sdk` — thin wrapper around `erc-8004-js` and x402 helpers.  
- `infra/contracts` — `AgentTreasury` + `AgentCoin` (revshare).

## Why this architecture

- **Revenue-native**: Agents pay agents using x402 (HTTP 402) with instant USDC settlement on Base via a facilitator (CDP).  
- **Trust-native**: Agents register once (ERC‑8004), then accrue reputation automatically as they successfully serve paid calls.  
- **Growth-native**: Any developer can bring an API → becomes a paid x402 tool (and MCP tool) in minutes.  
- **Ops-native**: We track every tool call and step in real-time and via OpenTelemetry for deep post‑hoc analysis.

## Environments

- **Base Sepolia** (test): `chainId = 84532`.  
- **Base Mainnet** (prod): `chainId = 8453`.  
Set `NETWORK=base` in `apps/web` to switch to mainnet.

## Quickstart

```bash
bun install

# 1) Web app (x402 starter)
cp apps/web/.env.example apps/web/.env.local
# Fill CDP keys and AI provider keys, then:
cd apps/web && bun run dev

# 2) ez402 portal
cd apps/ez402 && bun run dev

# 3) Observability (Bun server + Vue client)
(cd apps/observability && ./scripts/start-system.sh)

# 4) ERC-8004 indexer + explorer
bun run dev:indexer
cd apps/explorer && bun run dev

Wiring

Paid tool calls: The AI SDK tools call x402 endpoints. On 402 Payment Required, we create a payment payload and verify/settle via a facilitator, then retry.

Identity & reputation: On successful response, we submit feedback to ERC‑8004 via erc-8004-js.

Treasury: Merchant addresses for paid endpoints point to AgentTreasury on Base; USDC revenue is split to team + AgentCoin holders.

Observability: We emit normalized events (UserPromptSubmit, PreToolUse, PostToolUse, Stop) to /events for live ops and keep OpenTelemetry on for traces.
