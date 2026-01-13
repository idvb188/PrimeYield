# MVP for DeFi Lending + Yield Splitter (PT / YT) + RWA Vault

This repository contains a DeFi lending protocol MVP that combines a classic lending market, ayield splitter that separates principal and yield into PT / YT tokens, and a compliance-gated RWA Vault using an on-chain whitelist.

The project is built as an MVP demonstrating how DeFi primitives can be extended toward Real-World Assets with compliance-aware access control.

 **Live demo:**  
https://prime-yield-1g8u.vercel.app/
---

## What it has

### 1. DeFi Lending
- Supply / borrow mechanics with health factor (HF).
- Utilization-based interest rates.
- Collateralized borrowing with liquidation safety checks.
- Live position metrics (collateral, debt, HF, APY).

### 2. Yield Splitter (PT / YT)
- Split deposits into: PT (principal token), fixed principal redeemable at maturity and YT (yield token), variable yield from lending utilization.
- Claim yield continuously from YT.
- Early PT redemption.
- Maturity-aware UX.

Inspired by protocols like Pendle, but implemented as a minimal and transparent MVP.

### 3. RWA Vault
- Separate vault for RWA-style deposits.
- Access controlled by an on-chain whitelist policy.
- UI clearly shows the verification status and why access is restricted.
- Admin/demo flow to whitelist wallets.
- Designed to be replaced by off-chain attestations on mainnet.

---

## Architecture

### Smart contracts
- `LendingPool.sol` - core lending logic.
- `YieldSplitter.sol - PT/YT minting, yield accounting, maturity.
- `PTToken.sol` / `YTToken.sol` - ERC20 tokens.
- `RWAVault.sol` - compliance-gated vault.
- `WhitelistPolicy.sol` - on-chain access control (MVP stub).

---

## Compliance Model (MVP)

This MVP uses a simple on-chain whitelist to simulate compliance. If a wallet is not whitelisted, RWA Vault deposits are disabled. If whitelisted, deposits are enabled.

---

## Frontend

- Built with Next.js.
- Wallet connection.
- Real-time contract reads.
- Modals for sensitive actions (split, redeem, repay, RWA deposit).
- Clear UX around risk, maturity, and compliance.

---

##  Deployment

- Smart contracts deployed on an EVM test network.
- Frontend deployed on a public hosting provider.



---


