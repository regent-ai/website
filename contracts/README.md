# Contracts (Foundry)

Deploy the AnimataRedeemer to Base mainnet with a single command using a local PRIVATE_KEY.

## Setup

```bash
cd contracts
forge install openzeppelin/openzeppelin-contracts
```

Optional: set environment overrides for addresses (defaults are Base mainnet):

```bash
export OWNER=0x0cb27e883E207905AD2A94F9B6eF0C7A99223C37
export USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
export REGENT=0x6f89bcA4eA5931EdFCB09786267b251DeE752b07
export COLL1=0x78402119ec6349a0d41f12b54938de7bf783c923
export COLL2=0x903c4c1e8b8532fbd3575482d942d493eb9266e2
export COLL3=0x2208aadbdecd47d3b4430b5b75a175f6d885d487
```

## Deploy

```bash
export PRIVATE_KEY=0x... # deployer key
forge script script/DeployRedeemer.s.sol:DeployRedeemer \
  --rpc-url https://mainnet.base.org \
  --broadcast
```

To verify on BaseScan (optional):

```bash
export ETHERSCAN_API_KEY=your_basescan_key
forge script script/DeployRedeemer.s.sol:DeployRedeemer \
  --rpc-url https://mainnet.base.org \
  --broadcast \
  --verify \
  --verifier etherscan \
  --verifier-url https://api.basescan.org/api
```



