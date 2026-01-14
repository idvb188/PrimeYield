"use client";

import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { ERC20_ABI, POOL_ABI, SPLITTER_ABI, WHITELIST_POLICY_ABI, RWA_VAULT_ABI} from "./abi";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID!);
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS!;
const POOL = process.env.NEXT_PUBLIC_POOL_ADDRESS!;
const SPLITTER = process.env.NEXT_PUBLIC_SPLITTER_ADDRESS!;
const PT = process.env.NEXT_PUBLIC_PT_ADDRESS!;
const YT = process.env.NEXT_PUBLIC_YT_ADDRESS!;
const WHITELIST_POLICY = process.env.NEXT_PUBLIC_WHITELIST_POLICY!;
const RWA_VAULT = process.env.NEXT_PUBLIC_RWA_VAULT!;

declare global {
  interface Window {
    ethereum?: any;
  }
}

function shortAddr(a?: string) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Page() {
  const [account, setAccount] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  const [depositInput, setDepositInput] = useState("");
  const [withdrawInput, setWithdrawInput] = useState("");
  const [borrowInput, setBorrowInput] = useState("");
  const [repayInput, setRepayInput] = useState("");

  const [tokenBal, setTokenBal] = useState("—");
  const [poolBal, setPoolBal] = useState("—");

  const [pps, setPps] = useState("—"); 
  const [maxWithdraw, setMaxWithdraw] = useState("—");
  const [maxBorrow, setMaxBorrow] = useState("—");
  const [debt, setDebt] = useState("—");
  const [collateral, setCollateral] = useState("—");
  const [hf, setHf] = useState("—");

  const [tokenBalRaw, setTokenBalRaw] = useState<bigint>(BigInt(0)); 
  const [poolBalRaw, setPoolBalRaw] = useState<bigint>(BigInt(0));
  const [debtRaw, setDebtRaw] = useState<bigint>(BigInt(0));
  const [maxBorrowRaw, setMaxBorrowRaw] = useState<bigint>(BigInt(0));
  const [maxWithdrawRaw, setMaxWithdrawRaw] = useState<bigint>(BigInt(0));
  const [collateralRaw, setCollateralRaw] = useState<bigint>(BigInt(0));
  const [hfRaw, setHfRaw] = useState<bigint>(BigInt(0));

  const [splitInput, setSplitInput] = useState("");
  const [redeemPtInput, setRedeemPtInput] = useState("");

  const [ptBalRaw, setPtBalRaw] = useState<bigint>(BigInt(0));
  const [ytBalRaw, setYtBalRaw] = useState<bigint>(BigInt(0));
  const [claimableRaw, setClaimableRaw] = useState<bigint>(BigInt(0));

  const [prevClaimableRaw, setPrevClaimableRaw] = useState<bigint>(BigInt(0));
  const [prevClaimableTs, setPrevClaimableTs] = useState<number>(0);
  const [ytRatePerDayE18, setYtRatePerDayE18] = useState<bigint>(BigInt(0));

  const [matured, setMatured] = useState(false);
  const [maturitySec, setMaturitySec] = useState(0);
  const [daysLeft, setDaysLeft] = useState(0);
  const [daysLeftLabel, setDaysLeftLabel] = useState<string>("—");

  const [repayAllIntent, setRepayAllIntent] = useState(false);

  const ptBalUi = fmt18(ptBalRaw, 4);
  const ytBalUi = fmt18(ytBalRaw, 4);
  const claimableUi = fmt18(claimableRaw, 6);
  const maxBorrowUi = fmt18(maxBorrowRaw, 4);

  const [supplyApy, setSupplyApy] = useState<string>("—");
  const [borrowApy, setBorrowApy] = useState<string>("—");

  const DUST = BigInt(3e12);
  const MAX_UINT256 = (BigInt(2) ** BigInt(256) - BigInt(1));
  const cleanDebt = debtRaw < DUST ? BigInt(0) : debtRaw;
  const hasSupply = collateralRaw > BigInt(0);
  const hasBorrow = cleanDebt > BigInt(0); 

  const [isWhitelisted, setIsWhitelisted] = useState<boolean>(false);
  const [isPolicyOwner, setIsPolicyOwner] = useState(false);
  const [rwaModalOpen, setRwaModalOpen] = useState(false);
  const [rwaBalRaw, setRwaBalRaw] = useState<bigint>(BigInt(0));

  const [rwaVaultModalOpen, setRwaVaultModalOpen] = useState(false);
  const [rwaVaultMode, setRwaVaultMode] = useState<"deposit" | "withdraw">("deposit");
  const [rwaVaultAmount, setRwaVaultAmount] = useState<string>("");
  const [rwaVaultWarn, setRwaVaultWarn] = useState<string>("");


  const provider = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum) return null;
    return new BrowserProvider(window.ethereum);
  }, []);

  const canUse = !!provider && !!account;

  type ModalKind = "supply" | "withdraw" | "borrow" | "repay";
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState<ModalKind>("borrow");
  const [modalTitle, setModalTitle] = useState("");
  const [modalAmount, setModalAmount] = useState("0");
  const [modalHfBefore, setModalHfBefore] = useState("—");
  const [modalHfAfter, setModalHfAfter] = useState("—");
  const [modalWarn, setModalWarn] = useState<string>("");
  const [modalBusy, setModalBusy] = useState(false);

  type SplitterModalKind = "split" | "redeemPT";
  const [splitterModalOpen, setSplitterModalOpen] = useState(false);
  const [splitterModalKind, setSplitterModalKind] = useState<SplitterModalKind>("split");
  const [splitterModalBusy, setSplitterModalBusy] = useState(false);
  const [splitterModalWarn, setSplitterModalWarn] = useState<string>("");
  const splitterTitle = splitterModalKind === "split" ? "Split (mint PT+YT)" : "Redeem PT (burn PT)";
  const splitterConfirmLabel = splitterModalKind === "split" ? "Split" : "Redeem PT";

  const BPS = BigInt(10_000);
  const ONE_E18 = BigInt(10) ** BigInt(18);

   const modalUi =
      modalKind === "supply"
      ? {
          inputValue: depositInput,
          onInputChange: setDepositInput,
          onMax: () => setDepositInput(formatUnits(tokenBalRaw, 18)),
          maxDisabled: !canUse || tokenBalRaw === BigInt(0),
          confirmLabel: "Supply",
          confirmDisabled: !canUse || modalBusy,
        }
      : modalKind === "withdraw"
      ? {
          inputValue: withdrawInput,
          onInputChange: setWithdrawInput,
          onMax: () => setWithdrawInput(formatUnits(maxWithdrawRaw, 18)),
          maxDisabled: !canUse || maxWithdrawRaw === BigInt(0),
          confirmLabel: "Withdraw",
          confirmDisabled: !canUse || modalBusy,
        }
      : modalKind === "borrow"
      ? {
          inputValue: borrowInput,
          onInputChange: setBorrowInput,
          onMax: () => setBorrowInput(formatUnits(maxBorrowRaw, 18)),
          maxDisabled: !canUse || maxBorrowRaw === BigInt(0),
          confirmLabel: "Borrow",
          confirmDisabled: !canUse || modalBusy,
        }
      : {
          inputValue: repayInput,
          onInputChange: (v: string) => {setRepayAllIntent(false); setRepayInput(v);},
          onMax: () => {setRepayAllIntent(true); 
            const cap = cleanDebt < tokenBalRaw ? cleanDebt : tokenBalRaw;
            setRepayInput(formatUnits(cap, 18));
          },
          maxDisabled: !canUse || cleanDebt === BigInt(0) || tokenBalRaw === BigInt(0),

          confirmLabel: "Repay",
          confirmDisabled: !canUse || modalBusy,
        };

  function fmtHfFromE18(x: bigint): string {
    if (x === MAX_UINT256) return "∞";
    return fmt18(x, 2);
  }

  function inferLtvBps(collat: bigint, debt: bigint, maxBorrowNow: bigint): bigint {
    if (collat === BigInt(0)) return BigInt(0);
    const maxDebtAllowed = debt + maxBorrowNow;       
    return (maxDebtAllowed * BPS) / collat;         
  }

  function hfE18From(collat: bigint, debt: bigint, ltvBps: bigint): bigint {
    if (debt === BigInt(0)) return MAX_UINT256;
    if (collat === BigInt(0)) return BigInt(0);
    const maxDebtAllowed = (collat * ltvBps) / BPS;
    return (maxDebtAllowed * ONE_E18) / debt;
  }

  function openSplitModal() {
    setSplitterModalKind("split");
    setSplitterModalWarn("");
    setSplitterModalOpen(true);
  }

  function openRedeemModal() {
    setSplitterModalKind("redeemPT");
    setSplitterModalWarn("");
    setSplitterModalOpen(true);
  }

  function openActionModal(kind: ModalKind) {
    setModalWarn("");
    setModalKind(kind);

    const amountStr =
      kind === "supply" ? (depositInput || "0") :
      kind === "withdraw" ? (withdrawInput || "0") :
      kind === "borrow" ? (borrowInput || "0") :
      (repayInput || "0");

    setModalAmount(amountStr);
    setModalHfBefore(hf);

    let amountRaw = BigInt(0);
    try {
      amountRaw = parseUnits(amountStr || "0", 18);
    } catch {
      setModalTitle(`${kind.toUpperCase()} mETH`);
      setModalHfAfter("—");
      setModalWarn("Bad amount format");
      setModalOpen(true);
      return;
    }

    const ltvBps = inferLtvBps(collateralRaw, cleanDebt, maxBorrowRaw); 

    let newCollat = collateralRaw;
    let newDebt = cleanDebt;

    if (kind === "supply") {
      newCollat = collateralRaw + amountRaw;
    } else if (kind === "withdraw") {
      if (amountRaw > maxWithdrawRaw) {
        setModalWarn(`Exceeds maxWithdraw (${formatUnits(maxWithdrawRaw, 18)})`);
      }
      newCollat = collateralRaw > amountRaw ? (collateralRaw - amountRaw) : BigInt(0);
    } else if (kind === "borrow") {
      if (amountRaw > maxBorrowRaw) {
        setModalWarn(`Exceeds maxBorrow (${formatUnits(maxBorrowRaw, 18)})`);
      }
      newDebt = cleanDebt + amountRaw; 
    } else if (kind === "repay") {
      newDebt = cleanDebt > amountRaw ? (cleanDebt - amountRaw) : BigInt(0); 
    }

    const hfAfterE18 = hfE18From(newCollat, newDebt, ltvBps);
    setModalHfAfter(fmtHfFromE18(hfAfterE18));

    if (hfAfterE18 !== MAX_UINT256 && hfAfterE18 < ONE_E18) {
      setModalWarn((w) => (w ? `${w} • HF < 1 (will revert / unsafe)` : "HF < 1 (will revert / unsafe)"));
    }

    setModalTitle(
      kind === "supply" ? "Supply mETH" :
      kind === "withdraw" ? "Withdraw mETH" :
      kind === "borrow" ? "Borrow mETH" :
      "Repay mETH"
    );

    setModalOpen(true);
  }

  async function confirmModal() {
    try {
      setModalBusy(true);

      if (modalKind === "supply") await approveAndDeposit();
      if (modalKind === "withdraw") await doWithdraw();
      if (modalKind === "borrow") await doBorrow();
      if (modalKind === "repay") await doRepay();

      setModalOpen(false);
    } finally {
      setModalBusy(false);
    }
  }

  function recomputeModalPreview() {
    if (!modalOpen) return;

    setModalWarn("");

    const amountStr =
      modalKind === "supply" ? (depositInput || "0") :
      modalKind === "withdraw" ? (withdrawInput || "0") :
      modalKind === "borrow" ? (borrowInput || "0") :
      (repayInput || "0");

    setModalAmount(amountStr);

    let amountRaw = BigInt(0);
    try {
      amountRaw = parseUnits(amountStr || "0", 18);
    } catch {
      setModalHfAfter("—");
      setModalWarn("Bad amount format");
      return;
    }

    const ltvBps = inferLtvBps(collateralRaw, debtRaw, maxBorrowRaw);

    let newCollat = collateralRaw;
    let newDebt = debtRaw;

    if (modalKind === "supply") {
      newCollat = collateralRaw + amountRaw;
    } else if (modalKind === "withdraw") {
      if (amountRaw > maxWithdrawRaw) {
        setModalWarn(`Exceeds maxWithdraw (${formatUnits(maxWithdrawRaw, 18)})`);
      }
      newCollat = collateralRaw > amountRaw ? (collateralRaw - amountRaw) : BigInt(0);
    } else if (modalKind === "borrow") {
      if (amountRaw > maxBorrowRaw) {
        setModalWarn(`Exceeds maxBorrow (${formatUnits(maxBorrowRaw, 18)})`);
      }
      newDebt = debtRaw + amountRaw;
    } else if (modalKind === "repay") {
      newDebt = debtRaw > amountRaw ? (debtRaw - amountRaw) : BigInt(0);
    }

    const hfAfterE18 = hfE18From(newCollat, newDebt, ltvBps);
    setModalHfAfter(fmtHfFromE18(hfAfterE18));

    if (hfAfterE18 !== MAX_UINT256 && hfAfterE18 < ONE_E18) {
      setModalWarn((w) => (w ? `${w} • HF < 1 (unsafe)` : "HF < 1 (unsafe)"));
    }
  }

  useEffect(() => {
      recomputeModalPreview();
    }, [
      modalOpen,
      modalKind,
      depositInput,
      withdrawInput,
      borrowInput,
      repayInput,
      collateralRaw,
      debtRaw,
      maxBorrowRaw,
      maxWithdrawRaw,
    ]);

  function toInput(x: string | bigint) {
    try {
      return typeof x === "bigint" ? formatUnits(x, 18) : x;
    } catch {
      return "0";
    }
  }

  async function connect() {
    try {
      if (!window.ethereum) {
        setStatus("Wallet not found.");
        return;
      }
      await window.ethereum.request({ method: "eth_requestAccounts" });

      let p = new BrowserProvider(window.ethereum);
      let net = await p.getNetwork();

      if (Number(net.chainId) !== CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: `0x${CHAIN_ID.toString(16)}`,
                  chainName: "Mantle Sepolia Testnet",
                  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
                  rpcUrls: ["https://rpc.sepolia.mantle.xyz"],
                  blockExplorerUrls: ["https://explorer.sepolia.mantle.xyz"],
                },
              ],
            });
          } else {
            setStatus(`Network switch error: ${switchError.message}`);
            return;
          }
        }
        p = new BrowserProvider(window.ethereum);
        net = await p.getNetwork();
        if (Number(net.chainId) !== CHAIN_ID) {setStatus("Please switch network.");
          return;
        }
      }

      const signer = await p.getSigner();
      const addr = await signer.getAddress();
      setAccount(addr);
      setStatus("Connected");
    } catch (e: any) {
      setStatus(e?.shortMessage ?? e?.message ?? "connect error");
      console.error(e);
    }
  }

  async function safeCall<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
    try {
      return await fn();
    } catch (e: any) {
      console.warn(`${label} reverted`, e?.shortMessage ?? e?.message ?? e);
      return fallback;
    }
  }

  async function refresh() {
    if (!provider || !account) return;

    try {
      const signer = await provider.getSigner();
      const token = new Contract(TOKEN, ERC20_ABI, signer);
      const pool = new Contract(POOL, POOL_ABI, signer);
      const splitter = new Contract(SPLITTER, SPLITTER_ABI, signer);
      const pt = new Contract(PT, ERC20_ABI, signer);
      const yt = new Contract(YT, ERC20_ABI, signer);
      const rwaVault = new Contract(RWA_VAULT, RWA_VAULT_ABI, signer);
      const rwaBal = await safeCall(() => rwaVault.balanceOf(account), BigInt(0), "rwaVault.balanceOf");
      setRwaBalRaw(rwaBal);


      if (WHITELIST_POLICY) {
        const policy = new Contract(WHITELIST_POLICY, WHITELIST_POLICY_ABI, signer);
        safeCall(() => policy.check(account), false, "policy.check").then((ok) => setIsWhitelisted(Boolean(ok)));

        safeCall(() => policy.owner(),
          "0x0000000000000000000000000000000000000000","policy.owner"
        ).then((owner: string) => {setIsPolicyOwner(owner.toLowerCase() === account.toLowerCase());});

      } else {
        setIsWhitelisted(false);
        setIsPolicyOwner(false);
      }

      const ptBal = await safeCall(() => pt.balanceOf(account), BigInt(0), "pt.balanceOf");
      const ytBal = await safeCall(() => yt.balanceOf(account), BigInt(0), "yt.balanceOf");
      const claimable = await safeCall(() => splitter.previewClaimUpdated(account), BigInt(0), "splitter.previewClaimUpdated");

      setPtBalRaw(ptBal);
      setYtBalRaw(ytBal);
      setClaimableRaw(claimable);

      const hasPtPosition = ptBal > BigInt(0); 
      const nowMs = Date.now();
      const dtSecNum = prevClaimableTs > 0 ? Math.floor((nowMs - prevClaimableTs) / 1000) : 0;

      if (prevClaimableTs > 0 && dtSecNum >= 30 && ytBal > BigInt(0)) {
        const dtSec = BigInt(dtSecNum);
        const delta = claimable > prevClaimableRaw ? (claimable - prevClaimableRaw) : BigInt(0);
        const ratePerDayE18 = (delta * BigInt(86400) * ONE_E18) / (ytBal * dtSec);
        if (ratePerDayE18 > BigInt(0)) {
          setYtRatePerDayE18(ratePerDayE18);
        }
      }

      setPrevClaimableRaw(claimable);
      setPrevClaimableTs(nowMs);

      if (ytBal === BigInt(0)) setYtRatePerDayE18(BigInt(0));

      const mMaturity = await splitter.maturity();    
      const blk = await provider.getBlock("latest");
      const nowSec = Number(blk?.timestamp ?? Math.floor(Date.now() / 1000));
      const mMaturitySec = Number(mMaturity);
      const secsLeft = Math.max(0, mMaturitySec - nowSec);
      const d = Math.floor(secsLeft / 86400);
      const h = Math.floor((secsLeft % 86400) / 3600);
      const mMatured = nowSec >= mMaturitySec;

      setMaturitySec(mMaturitySec);
      const maturedUi = (secsLeft === 0) || Boolean(mMatured); 

      if (!hasPtPosition) {
        setMatured(false);
        setDaysLeft(0);
        setDaysLeftLabel("");
      } else {
        setMatured(maturedUi);
        const days = maturedUi ? 0 : Math.ceil(secsLeft / 86400);
        setDaysLeft(days);
        const label = maturedUi ? "Matured." : d > 0 ? `Matures in ${d}d ${h}h.` : h > 0 ? `Matures in ${h}h.` : `Matures soon.`;
        setDaysLeftLabel(label);
      }

      const pps = await safeCall(() => pool.pricePerShare(), BigInt(0), "pricePerShare");
      const collateral = await safeCall(() => pool.collateralValue(account), BigInt(0), "collateralValue");

      let debtRaw = await safeCall( () => pool.debtOf(account), BigInt(0),"debtOf");
      if (debtRaw < DUST) debtRaw = BigInt(0);
      const debtClean = debtRaw;

      const maxWithdraw = await safeCall(() => pool.maxWithdraw(account),BigInt(0),"maxWithdraw");
      const maxBorrow = await safeCall(() => pool.maxBorrow(account),BigInt(0),"maxBorrow");
      const hf = await safeCall(() => pool.healthFactorE18(account),BigInt(0),"healthFactorE18");
      const tb = await safeCall(() => token.balanceOf(account), BigInt(0), "token.balanceOf(user)");
      const pb = await safeCall(() => token.balanceOf(POOL), BigInt(0), "token.balanceOf(pool)");
      const poolState = await safeCall(() => pool.poolState(), null as any, "poolState");
      
      try {
        if (poolState) {
          const utilE18: bigint = poolState[3];
          const supplyRateE18: bigint = poolState[6];
          const borrowRateE18: bigint = poolState[7];
          const br = Number(formatUnits(borrowRateE18, 18)) * 100;
          const sr = Number(formatUnits(supplyRateE18, 18)) * 100;
          setBorrowApy(isFinite(br) ? `${br.toFixed(2)}%` : "—");
          setSupplyApy(isFinite(sr) ? `${sr.toFixed(2)}%` : "—");
        }
      } catch {}

      setPps(fmt18(pps, 8));
      setCollateral(fmt18(collateral));
      setDebt(fmt18(debtClean));

      if (debtClean === BigInt(0)) {setRepayInput("");}

      setMaxWithdraw(fmt18(maxWithdraw));
      setMaxBorrow(fmt18(maxBorrow));
      setTokenBal(fmt18(tb));
      setPoolBal(fmt18(pb));
      setRepayInput(debtClean === BigInt(0) ? "0" : formatUnits(debtClean, 18));

      setTokenBalRaw(tb);
      setPoolBalRaw(pb);
      setMaxWithdrawRaw(maxWithdraw);
      setMaxBorrowRaw(maxBorrow);
      setCollateralRaw(collateral); 
      setHfRaw(hf);
      setDebtRaw(debtClean);

      setPtBalRaw(ptBal);
      setYtBalRaw(ytBal);
      setClaimableRaw(claimable);

      if (debtClean === BigInt(0)) {
        setHf("∞");
      } else {
        setHf(hf === MAX_UINT256 ? "∞" : fmt18(hf, 2));
      }

      setStatus("");
    } catch (e: any) {console.error("refresh failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "refresh error");
    }
  }

  async function approve(spender: string, amount: bigint) {
    const signer = await provider!.getSigner();
    const token = new Contract(TOKEN, ERC20_ABI, signer);
    const tx = await token.approve(spender, amount);
    await tx.wait();
  }

  async function approveAndDeposit() {
    try {
      if (!canUse) return;
      const amount = parseUnits(depositInput || "0", 18);
      if (amount <= BigInt(0)) return setStatus("Bad amount");

      const signer = await provider!.getSigner();
      const pool = new Contract(POOL, POOL_ABI, signer);

      setStatus("Approve...");
      await approve(POOL, amount);

      setStatus("Deposit...");
      const tx = await pool.deposit(amount);
      await tx.wait();

      setStatus("Done");
      await refresh();

      setDepositInput("");

    } catch (e: any) {
      setStatus(e?.shortMessage ?? e?.message ?? "deposit error");
      console.error(e);
    }
  }

  async function doWithdraw() {
    if (!provider || !account) return;

    try {
      setStatus("Withdrawing...");

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const pool = new Contract(POOL, POOL_ABI, signer);

      // 1) on-chain maxWithdraw (истина)
      const mw: bigint = await pool.maxWithdraw(account);

      if (mw === BigInt(0)) {
        setStatus("Max withdraw is 0 (LTV would break or no collateral)");
        return;
      }

      // 2) what user typed
      const requested = parseUnits(withdrawInput || "0", 18);

      if (requested === BigInt(0)) {
        setStatus("Withdraw amount is zero");
        return;
      }

      //  ЖЁСТКИЙ ЗАПРЕТ
      if (requested > mw) {
        setStatus(`Withdraw exceeds maxWithdraw. Max: ${formatUnits(mw, 18)}`);
        return;
      }

      // 3) withdraw
      const tx = await pool.withdraw(requested);
      await tx.wait();

      setStatus("Withdraw successful");
      await refresh();

      setWithdrawInput("");

    } catch (e: any) {
      console.error("withdraw failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "withdraw error");
    }
  }

  async function doBorrow() {
    if (!provider || !account) return;

    try {
      setStatus("Borrowing...");

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const pool = new Contract(POOL, POOL_ABI, signer);
      const mb: bigint = await pool.maxBorrow(account);

      if (mb === BigInt(0)) {
        setStatus("Max borrow is 0 (increase collateral or repay debt)");
        return;
      }

      const requested = parseUnits(borrowInput || "0", 18);

      if (requested === BigInt(0)) {
        setStatus("Borrow amount is zero");
        return;
      }

      if (requested > mb) {
        setStatus(`Borrow exceeds maxBorrow. Max: ${formatUnits(mb, 18)}`);
        return;
      }

      const tx = await pool.borrow(requested);
      await tx.wait();
      setStatus("Borrow successful");
      await refresh();
      setBorrowInput("");

    } catch (e: any) {
      console.error("borrow failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "borrow error");
    }
  }

  async function doRepay() {
    if (!provider || !account) return;

    try {
      setStatus("Repaying...");

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const token = new Contract(TOKEN, ERC20_ABI, signer);
      const pool = new Contract(POOL, POOL_ABI, signer);

      const debtNow = await pool.debtOf(account);
      const debtNowClean = debtNow < DUST ? BigInt(0) : debtNow;

      if (debtNowClean === BigInt(0)) {
        setStatus("Nothing to repay");
        return;
      }

      const requested = parseUnits(repayInput || "0", 18);

      if (requested === BigInt(0)) {
        setStatus("Repay amount is zero");
        return;
      }
      if (requested < BigInt(0)) {
        setStatus("Bad amount");
        return;
      }

      if (requested > debtNow) {
        setStatus(`Repay amount exceeds debt. Max: ${formatUnits(debtNowClean, 18)}`);
        return;
      }

      const closeAll =
        repayAllIntent ||
        (requested >= debtNowClean && debtNowClean > BigInt(0)); 

      if (closeAll) {
        await doRepayAll(); 
        return;
      }

      const allowance = await token.allowance(account, POOL);
      if (allowance < requested) {
        const tx1 = await token.approve(POOL, requested);
        await tx1.wait();
      }

      const tx2 = await pool.repay(requested);
      await tx2.wait();

      setStatus("Repay successful");
      await refresh();
      setRepayInput("");

    } catch (e: any) {
      console.error("Repay failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "Repay error");
    }
  }

  async function doRepayAll() {
    if (!provider || !account) return;

    try {
      setStatus("Repaying all...");

      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const token = new Contract(TOKEN, ERC20_ABI, signer);
      const pool = new Contract(POOL, POOL_ABI, signer);

      const shares: bigint = await pool.debtSharesOf(account);
      if (shares === BigInt(0)) {
        setStatus("Nothing to repay");
        return;
      }

      const idx: bigint = await pool.borrowIndexE18();
      const pay = (shares * idx + ONE_E18 - BigInt(1)) / ONE_E18; // ceil

      const allowance = await token.allowance(account, POOL);
      if (allowance < pay) {
        const tx1 = await token.approve(POOL, pay);
        await tx1.wait();
      }

      const tx2 = await pool.repayAll();
      await tx2.wait();

      setStatus("Repay all successful");
      setRepayAllIntent(false);
      setRepayInput("");
      await refresh();
    } catch (e: any) {
      console.error("repayAll failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "repayAll error");
    }
  }

  async function approveAndSplit() {
  try {
    if (!canUse) return;
    const amount = parseUnits(splitInput || "0", 18);
    if (amount <= BigInt(0)) return setStatus("Bad amount");

    const signer = await provider!.getSigner();
    const token = new Contract(TOKEN, ERC20_ABI, signer);
    const splitter = new Contract(SPLITTER, SPLITTER_ABI, signer);

    setStatus("Approve (Splitter)...");
    const txA = await token.approve(SPLITTER, amount);
    await txA.wait();

    setStatus("Splitting...");
    const txS = await splitter.split(amount, account);
    await txS.wait();

    setStatus("Split OK");
    await refresh();

    setSplitInput("");

  } catch (e: any) {
    console.error(e);
    setStatus(e?.shortMessage ?? e?.message ?? "split error");
  }
  }

  async function doClaimYield() {
    try {
      if (!canUse) return;
      const signer = await provider!.getSigner();
      const splitter = new Contract(SPLITTER, SPLITTER_ABI, signer);

      setStatus("Claiming yield...");
      const tx = await splitter.claimYield(account);
      await tx.wait();

      setStatus("Claim OK");
      await refresh();
    } catch (e: any) {
      console.error(e);
      setStatus(e?.shortMessage ?? e?.message ?? "claim error");
    }
  }

  async function doRedeemPT() {
    try {
      if (!canUse) return;
      const amount = parseUnits(redeemPtInput || "0", 18);
      if (amount <= BigInt(0)) return setStatus("Bad amount");

      const signer = await provider!.getSigner();
      const splitter = new Contract(SPLITTER, SPLITTER_ABI, signer);

      setStatus("Redeeming PT...");
      const tx = await splitter.redeemPT(amount, account);
      await tx.wait();

      setStatus("Redeem OK");
      await refresh();

      setRedeemPtInput("");

    } catch (e: any) {
      console.error(e);
      setStatus(e?.shortMessage ?? e?.message ?? "redeem error");
    } 
  }

  async function doRwaDeposit(amountRaw: bigint) {
    if (!provider || !account) return;

    try {
      setStatus("RWA deposit...");

      if (!isWhitelisted) {
        setStatus("Not verified (policy)");
        return;
      }

      const signer = await provider.getSigner();
      const token = new Contract(TOKEN, ERC20_ABI, signer);
      const vault = new Contract(RWA_VAULT, RWA_VAULT_ABI, signer);

      const allowance = await token.allowance(account, RWA_VAULT);
      if (allowance < amountRaw) {
        const tx1 = await token.approve(RWA_VAULT, amountRaw);
        await tx1.wait();
      }

      const tx2 = await vault.deposit(amountRaw);
      await tx2.wait();

      setStatus("RWA deposit successful");
      await refresh();
    } catch (e: any) {
      console.error("rwa deposit failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "rwa deposit error");
    }
  }

  async function doRwaWithdraw(amountRaw: bigint) {
    if (!provider || !account) return;

    try {
      setStatus("RWA withdraw...");

      const signer = await provider.getSigner();
      const vault = new Contract(RWA_VAULT, RWA_VAULT_ABI, signer);

      const tx = await vault.withdraw(amountRaw);
      await tx.wait();

      setStatus("RWA withdraw successful");
      await refresh();
    } catch (e: any) {
      console.error("rwa withdraw failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "rwa withdraw error");
    }
  }

  async function whitelistMeDemo(allowed: boolean) {
    if (!provider || !account) return;

    try {
      setStatus(allowed ? "Whitelisting..." : "Removing from whitelist (demo)...");
      const signer = await provider.getSigner();
      const policy = new Contract(WHITELIST_POLICY, WHITELIST_POLICY_ABI, signer);
      setStatus(`Admin: policy.setAllowed(${shortAddr(account)}, ${allowed})`);

      const tx = await policy.setAllowed(account, allowed);
      await tx.wait();

      setStatus("Policy updated.");
      await refresh();
    } catch (e: any) {
      console.error("whitelist demo failed", e);
      setStatus(e?.shortMessage ?? e?.message ?? "policy update error");
    }
  }

  async function doFaucet() {
    if (!canUse) return;

    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const token = new Contract(TOKEN, ERC20_ABI, signer);
      const tx = await token.faucet();
      await tx.wait();
      await refresh();
    } catch (e) {
      console.error(e); alert("Faucet failed");
    }
  }

  useEffect(() => {
    if (!window.ethereum) return;

    const onAccounts = (accs: string[]) => {
      setAccount(accs?.[0] ?? "");
      setStatus(accs?.[0] ? "Account changed" : "Disconnected");
    };

    const onChain = () => {
      setStatus("Network changed");
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, []);

  useEffect(() => {if (!provider || !account) return;
    refresh();
    const id = setInterval(() => {refresh();}, 30000);
    return () => clearInterval(id);
  }, [provider, account]);

  const hasPtPosition = ptBalRaw > BigInt(0);

  let redeemPtRaw = BigInt(0);
  try {
    redeemPtRaw = parseUnits(redeemPtInput || "0", 18);
  } catch {
    redeemPtRaw = BigInt(0);
  }

  const needsYt = !matured;
  const ytEnoughForRedeem = matured || (ytBalRaw >= redeemPtRaw);
  const splitRawSafe = (() => { try { return parseUnits(splitInput || "0", 18); } catch { return BigInt(0); } })();
  const redeemRawSafe = redeemPtRaw;
  const splitterConfirmDisabled =!canUse ||splitterModalBusy ||
    (splitterModalKind === "split" && splitRawSafe === BigInt(0)) ||
    (splitterModalKind === "redeemPT" && redeemRawSafe === BigInt(0)) ||
    (splitterModalKind === "redeemPT" && !matured && !ytEnoughForRedeem);

  return (
    <main style={page}>
      
      <header style={header}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>PrimeYield</div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>

          <button onClick={connect} style={primaryBtn}>
            {account ? `Connected: ${shortAddr(account)}` : "Connect Wallet"}
          </button>

        </div>
      </header>

      <section style={portfolioWrap}>
        <div style={portfolioHeader}>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontFamily: "Sans-serif, Verdana", }}>
            <Stat label="Wallet Balance" value={fmt18(tokenBalRaw, 2)} />
            <Stat label="Collateral" value={fmt18(collateralRaw, 2)}/>
            <Stat label="Debt" value={fmt18(debtRaw,2)} /> 
            <Stat label="Health Factor" value={hf} sublabel="Liquidation at < 1" highlight />
          </div>

          <button
              onClick={doFaucet}
              style={{...primaryBtn, ...btnPressable, ...(!canUse ? btnDisabled : {}) }}
              className="pressable"
              disabled={!canUse}
              type="button"
              title="Mint test mETH (faucet)"
            >
              Get test mETH
          </button>
        </div>
      </section>

      <section style={bottomGrid}>
        <div style={card}> 
          <div style={cardTitle}>Your Supplies</div>

          <div style={tableHead}>
            <div>Asset</div>
            <div style={{ textAlign: "left" }}>Supplied</div>
            <div style={{ textAlign: "center" }}>APY</div>
            <div style={{ textAlign: "center" }}>Withdraw Tokens</div>
          </div>

          {hasSupply ? (
            <div style={tableRow}>
              <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}> <b>mETH</b></div>
              <div style={{ textAlign: "left", fontSize: 14, fontWeight: 400 }}> {fmt18(collateralRaw,4)}</div>
              <div style={{ display: "flex", justifyContent: "center", fontSize: 14 }}> {supplyApy} </div>

              <button                
                onClick={() => openActionModal("withdraw")}
                style={{ ...primaryBtn, ...btnPressable,  alignSelf: "center", ...(!canUse ? btnDisabled : {}) }}
                className="pressable"
                disabled={!canUse}
                type="button"> Withdraw
              </button>
            </div>
          ):( <div style={{...emptyFill, padding: "14px 0", fontSize: 14, opacity: 0.65 }}> No active supplies </div> )}

        </div>

        <div style={card}>
          <div style={cardTitle}>Your Borrows</div>

          <div style={tableHead}>
            <div>Asset</div>
            <div style={{ textAlign: "left" }}>Borrowed</div>
            <div style={{ textAlign: "center" }}>APY</div>
            <div style={{ textAlign: "center" }}>Repay Tokens</div>
          </div>

          {hasBorrow ? (
            <div style={tableRow}>
              <div style={{ display: "flex", flexDirection: "column", fontSize: 14}}><b>mETH</b></div>
              <div style={{ textAlign: "left", fontSize: 14, fontWeight: 400 }}> {fmt18(debtRaw,4)}</div>
              <div style={{ display: "flex", justifyContent: "center", fontSize: 14 }}> {borrowApy} </div>

              <button
                onClick={() => openActionModal("repay")}
                style={{ ...primaryBtn, ...btnPressable, alignSelf: "center", ...(!canUse ? btnDisabled : {}) }}
                className="pressable"
                disabled={!canUse || cleanDebt === BigInt(0)}
                type="button" > Repay
              </button>
            </div>
          ):(<div style={emptyFill}> No active borrows </div>)}

        </div>
      </section>

      <section style={bottomGrid}> 

        <div style={card}>
          <div style={cardTitle}>Deposit Assets</div>    

          <div style={tableHead}>
            <div>Asset</div>
            <div style={{ textAlign: "left" }}>Available</div>
            <div style={{ textAlign: "center" }}>APY</div>
            <div style={{ textAlign: "center" }}>Make Deposit</div>
          </div>

          <div style={tableRow}>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}><b>mETH</b></div>
            <div style={{ textAlign: "left", fontSize: 14}}>{fmt18(tokenBalRaw)} </div>
            <div style={{ display: "flex", justifyContent: "center", fontSize: 14 }}> {supplyApy} </div>

            <button
              onClick={() => openActionModal("supply")}
              style={{ ...primaryBtn, ...btnPressable, alignSelf: "center", ...(!canUse ? btnDisabled : {}) }}
              className="pressable"
              disabled={!canUse}
              type="button"
              >
                Supply
            </button>

          </div>
          
        </div>  

        <div style={card}>
            <div style={cardTitle}>Assets Borrow</div>

            <div style={tableHead}>
              <div>Asset</div>
                <div style={{ textAlign: "left" }}>Available</div>
                <div style={{ textAlign: "center" }}>APY</div>
                <div style={{ textAlign: "center" }}>Borrow Tokens</div>
            </div>

            <div style={tableRow}>
              <div style={{ display: "flex", flexDirection: "column", fontSize: 14 }}><b>mETH</b></div>
              <div style={{ textAlign: "left", fontSize: 14, fontWeight: 400 }}>{(maxBorrowUi)}</div>
              <div style={{ display: "flex", justifyContent: "center", fontSize: 14 }}> {borrowApy} </div>

              <button
                onClick={() => openActionModal("borrow")}
                style={{ ...primaryBtn, ...btnPressable, alignSelf: "center", ...(!canUse ? btnDisabled : {}) }}
                className="pressable"
                disabled={!canUse}
                type="button"
                >Borrow
              </button>

            </div>
          
        </div>
        
      </section>

      <section style={card}>
        <div style={{display: "grid", gridTemplateColumns: "1fr auto", alignItems: "start", columnGap: 16, rowGap: 8,}}>
          <div>
            <div style={cardTitle}>Yield Splitter</div>
            <div style={{...regText, marginTop: 10,}}>
              Split your deposit into: PT (guaranteed principal) and YT (variable yield from lending utilization).
            </div>
          </div>

          <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
            <Stat label="PT balance" value={ptBalUi} />
            <Stat label="YT balance" value={ytBalUi} valueColor="#16a34a" />
            <Stat label="Claimable yield" value={claimableUi} />
          </div>
        </div> 

        <div style={{display: "grid", gridTemplateColumns: "0.8fr 0.8fr 0.8fr", gap: 18, alignItems: "center", marginTop: 16,}}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={yeildSplitterRow}> Split (mint PT+YT):</div>
            <button
              onClick={openSplitModal}
              style={{ ...primaryBtn, ...btnPressable,  ...(!canUse ? btnDisabled : {}) }}
              disabled={!canUse}
              className="pressable"
              type="button"
            >
              Split
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center",  gap: 10, textAlign: "center"}}>
            <div style={{flexDirection: "column"}}>

              <div style={yeildSplitterRow}> Redeem principal (burn PT): </div>

              {!matured && redeemPtRaw > BigInt(0) && !ytEnoughForRedeem && (
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  Early redeem requires burning the same amount of YT. You need at least{" "}
                  <b>{fmt18(redeemPtRaw - ytBalRaw, 6)}</b> more YT.
                </div>
              )}

              <div style={{...regText, paddingBottom:"7px" }}>
                {!hasPtPosition ? (
                    <>No PT position</>
                  ) : matured ? (
                    <>Matured • Redeem at par</>
                  ) : daysLeftLabel ? (
                    <>Early redeem. {daysLeftLabel}</>
                  ) : (
                    <>Early redeem. Matures soon</>
                )}
              </div>
            </div>    

            <button
              onClick={openRedeemModal}
              style={{...primaryBtn, ...btnPressable, ...((!canUse || (!matured && redeemPtRaw > BigInt(0) && !ytEnoughForRedeem)) ? btnDisabled: {}),}}
              disabled={!canUse || (!matured && redeemPtRaw > BigInt(0) && !ytEnoughForRedeem)}
              type="button"
            >
              Redeem PT
            </button>
          </div>

          

          <div style={{display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
            <div style={{flexDirection: "column"}}>
              <div style={yeildSplitterRow}> Claim yield from YT: </div>
              <div style={{display: "flex", justifyContent:"space-between"}}>
                <div style={regText}>Available to claim: <b>{claimableUi}</b> mETH </div>
                <span
                  title="Estimated from change in claimable yield between refreshes."
                  style={{ marginLeft: 6, cursor: "help", opacity: 0.6 }}
                >
                  ⓘ
                </span>
              </div>    
            </div>
                       
            <div>      
              <button
                onClick={doClaimYield}
                style={{...primaryBtn, ...btnPressable, ...(!canUse || claimableRaw === BigInt(0) ? btnDisabled : {}),}}
                disabled={!canUse || claimableRaw === BigInt(0)}
                className="pressable"
              >
                Claim
              </button>

              {claimableRaw === BigInt(0) && (<div style={{...regText, opacity: 0.6 }}> No yield available yet</div>)}
            </div>

          </div>

        </div>

      </section>

      <div style={card}>
        <div style={cardTitle}>RWA Vault (Preview)</div>

        <div style={{display: "grid", gridTemplateColumns: "0.8fr 0.8fr", gap: 18, alignItems: "start", marginTop: 10 }}>

          <div style={{...regText, display: "flex", alignItems: "center", gap: 10, marginTop: 10}}> <div>Access status:</div>
            <div style={{padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: "1px solid #e6e6e6", background: isWhitelisted ? "#f2fff5" : "#fff7f0", }}>
              {isWhitelisted ? "allowed by whitelist" : "not allowed"}
            </div>
          </div>

          <div style={{gap: 10, justifySelf: "end"}}>
            {isWhitelisted && (<div style={{...regText, marginTop: 10}}> Your vault balance: <b>{fmt18(rwaBalRaw, 4)} mETH</b></div>)}

            <div style={{marginTop: 10, display: "flex", gap:10}}>
                  
              <button
                disabled={!canUse || !isWhitelisted}
                className="pressable"
                type="button"
                style={{ ...primaryBtn, ...btnPressable, ...((!canUse || !isWhitelisted) ? btnDisabled : {}) }}
                onClick={() => {
                  setRwaVaultMode("deposit");
                  setRwaVaultWarn("");
                  setRwaVaultAmount("");
                  setRwaVaultModalOpen(true);
                }}
                > Deposit to RWA Vault
              </button>

              <button
                type="button"
                className="pressable"
                disabled={!canUse || rwaBalRaw === BigInt(0)}
                style={{ ...primaryBtn, ...btnPressable, ...((!canUse || rwaBalRaw === BigInt(0)) ? btnDisabled : {}) }}
                onClick={() => {
                  setRwaVaultMode("withdraw");
                  setRwaVaultWarn("");
                  setRwaVaultAmount("");
                  setRwaVaultModalOpen(true);
                }}
                > Withdraw from RWA Vault
              </button>

              {!isWhitelisted && (
                <div style={{...regText, marginTop: 10}}> Deposit disabled: the wallet is not verified by the policy.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{...regText}}> Whitelist is the on-chain access control for this MVP.</div>
        <div style={{...regText}}> On mainnet, the access will be granted via KYC/AML attestations (stub for MVP). </div>

        {!isWhitelisted && (
            <button
              type="button"
              className="pressable"
              disabled={!canUse}
              style={{marginTop: 10, ...primaryBtn, ...btnPressable, ...(!canUse ? btnDisabled : {}) }}
              onClick={() => setRwaModalOpen(true)}
            > Request verification
            </button>
          )}

          {isPolicyOwner && (
            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                className="pressable"
                style={{...primaryBtn, ...btnPressable, ...(!canUse ? btnDisabled : {})}}
                onClick={() => whitelistMeDemo(true)}
                disabled={!canUse}
              > Whitelist my wallet (demo/admin)
              </button>
            </div>
          )}        
        </div>

    <ActionModal 
      open={modalOpen}
      title={modalTitle}
      amount={modalAmount}
      hfBefore={modalHfBefore}
      hfAfter={modalHfAfter}
      warn={modalWarn}
      busy={modalBusy}
      onClose={() => setModalOpen(false)}
      onConfirm={confirmModal}

      inputValue={modalUi.inputValue}
      onInputChange={modalUi.onInputChange}
      onMax={modalUi.onMax}
      maxDisabled={modalUi.maxDisabled}
      confirmLabel={modalUi.confirmLabel}
      confirmDisabled={modalUi.confirmDisabled}
    />

    <SimpleConfirmModal
      open={splitterModalOpen}
      title={splitterTitle}
      warn={splitterModalWarn}
      busy={splitterModalBusy}
      confirmDisabled={splitterConfirmDisabled}
      confirmLabel={splitterConfirmLabel}
      onClose={() => setSplitterModalOpen(false)}
      onConfirm={async () => {
        try {
          setSplitterModalBusy(true);
          if (splitterModalKind === "split") await approveAndSplit();
          else await doRedeemPT();
          setSplitterModalOpen(false);
        } finally {
          setSplitterModalBusy(false);
        }
      }}
    >
      <div style={{ ...regText, marginTop: 10 }}>
        PT: <b>{ptBalUi}</b> • YT: <b>{ytBalUi}</b> • Claimable: <b>{claimableUi}</b>
      </div>

      {splitterModalKind === "split" ? (
        <>
          <div style={{ marginTop: 14, fontSize: 13, opacity: 0.75 }}> Amount (mETH) </div>

          <div style={{ ...actionsCell, marginTop: 8 }}>
            <div style={inputWrap}>
              <input
                value={splitInput}
                onChange={(e) => setSplitInput(e.target.value)}
                placeholder="0.0"
                style={inputWithMax}
                inputMode="decimal"
              />
              <button
                onClick={() => setSplitInput(formatUnits(tokenBalRaw, 18))}
                style={{ ...maxInsideBtn, ...btnPressable, ...(!canUse ? btnDisabled : {}) }}
                className="pressable"
                disabled={!canUse || tokenBalRaw === BigInt(0)}
                type="button"
              > MAX
              </button>
            </div>
          </div>

          <div style={{...regText, marginTop: 10, fontSize: 12, opacity: 0.65 }}>
            This may require two transactions: approve and split (deposit + mint PT/YT).
          </div>
        </>
      ) : (
        <>
          <div style={{...regText, marginTop: 14, fontSize: 13, opacity: 0.75 }}> Amount (PT)</div>

          <div style={{ ...actionsCell, marginTop: 8 }}>
            <div style={inputWrap}>
              <input
                value={redeemPtInput}
                onChange={(e) => setRedeemPtInput(e.target.value)}
                placeholder="0.0"
                style={inputWithMax}
                inputMode="decimal"
              />
              <button
                onClick={() => setRedeemPtInput(formatUnits(ptBalRaw, 18))}
                style={{ ...maxInsideBtn, ...btnPressable, ...(!canUse ? btnDisabled : {}) }}
                className="pressable"
                disabled={!canUse || ptBalRaw === BigInt(0)}
                type="button"
              >
                MAX
              </button>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
            {matured ? (
              <>Matured • Redeem at par</>
            ) : (
              <>Early redeem burns the same amount of YT.</>
            )}
          </div>

          {!matured && redeemPtRaw > BigInt(0) && !ytEnoughForRedeem && (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
              Not enough YT for early redeem.
            </div>
          )}
        </>
      )}
    </SimpleConfirmModal>

    <RwaVerificationModal
      open={rwaModalOpen}
      policy={WHITELIST_POLICY}
      account={account}
      onClose={() => setRwaModalOpen(false)}
    />

    <RwaVaultModal
      open={rwaVaultModalOpen}
      mode={rwaVaultMode}
      amount={rwaVaultAmount}
      warn={rwaVaultWarn}
      canUse={canUse}
      isWhitelisted={isWhitelisted}
      tokenBalRaw={tokenBalRaw}
      rwaBalRaw={rwaBalRaw}
      onClose={() => setRwaVaultModalOpen(false)}
      onAmountChange={(v) => { setRwaVaultWarn(""); setRwaVaultAmount(v); }}
      onMax={() => {
        const max = rwaVaultMode === "deposit" ? tokenBalRaw : rwaBalRaw;
        setRwaVaultWarn("");
        setRwaVaultAmount(formatUnits(max, 18));
      }}
      onConfirm={async () => {
        let amountRaw = BigInt(0);
        try {
          amountRaw = parseUnits(rwaVaultAmount || "0", 18);
        } catch {
          setRwaVaultWarn("Bad amount format");
          return;
        }

        if (amountRaw <= BigInt(0)) { setRwaVaultWarn("Amount is zero"); return; }

        if (rwaVaultMode === "deposit") {
          if (!isWhitelisted) { setRwaVaultWarn("Wallet is not verified"); return; }
          if (amountRaw > tokenBalRaw) { setRwaVaultWarn("Exceeds wallet balance"); return; }
          await doRwaDeposit(amountRaw);
        } else {
          if (amountRaw > rwaBalRaw) { setRwaVaultWarn("Exceeds vault balance"); return; }
          await doRwaWithdraw(amountRaw);
        }

        setRwaVaultModalOpen(false);
        setRwaVaultAmount("");
      }}
    />
    </main>
  );

}

function SimpleConfirmModal(props: {
    open: boolean;
    title: string;
    warn?: string;
    busy?: boolean;
    confirmLabel: string;
    confirmDisabled?: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    children?: React.ReactNode;
  }) {
    if (!props.open) return null;

    return (
      <div style={modalOverlay} onMouseDown={props.onClose}>
        <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{fontSize: 18, fontWeight: 900 }}>{props.title}</div>
            <button style={{ ...ghostBtn, padding: "8px 10px" }} onClick={props.onClose} type="button"> ✕ </button>
          </div>

          {props.children}

          {props.warn ? (
            <div style={{fontFamily: "Sans-serif, Verdana", marginTop: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid #ffe3a3", background: "#fff7df", fontSize: 13 }}>
              {props.warn}
            </div>
          ) : null}

          <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={props.onConfirm}
              disabled={!!props.busy || !!props.confirmDisabled}
              style={{
                ...primaryBtn,
                ...btnPressable,
                ...((props.busy || props.confirmDisabled) ? btnDisabled : {})
              }}
            >
              {props.busy ? "Confirming..." : props.confirmLabel}
            </button>

            <button type="button" onClick={props.onClose} style={{ ...ghostBtn, ...btnPressable }} className="pressable">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
}

function RwaVerificationModal(props: {
  open: boolean;
  policy: string;
  account: string;
  onClose: () => void;
  }) {
  if (!props.open) return null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div style={modalOverlay} onMouseDown={props.onClose}>
      <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Request verification</div>
          <button style={{ ...ghostBtn, padding: "8px 10px" }} onClick={props.onClose} type="button">
            ✕
          </button>
        </div>

        <div style={{...regText, marginTop: 12 }}>
          In production, verification is granted via a KYC/AML provider attestation. This MVP uses an on-chain whitelist policy as a placeholder.
        </div>

      </div>
    </div>
  );
}

function RwaVaultModal(props: {
    open: boolean;
    mode: "deposit" | "withdraw";
    amount: string;
    warn: string;
    canUse: boolean;
    isWhitelisted: boolean;
    tokenBalRaw: bigint;
    rwaBalRaw: bigint;
    onClose: () => void;
    onAmountChange: (v: string) => void;
    onMax: () => void;
    onConfirm: () => void | Promise<void>;
  }) {
    if (!props.open) return null;

    const title = props.mode === "deposit" ? "Deposit to RWA Vault" : "Withdraw from RWA Vault";
    const maxLabel = props.mode === "deposit"
      ? `Wallet: ${formatUnits(props.tokenBalRaw, 18)}`
      : `Vault: ${formatUnits(props.rwaBalRaw, 18)}`;

    const confirmDisabled =
      !props.canUse ||
      (props.mode === "deposit" && !props.isWhitelisted);

    return (
      <div style={modalOverlay} onMouseDown={props.onClose}>
        <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
            <button style={{ ...ghostBtn, padding: "8px 10px" }} onClick={props.onClose} type="button">✕</button>
          </div>

          <div style={{fontFamily: "Sans-serif, Verdana", marginTop: 10, fontSize: 13, opacity: 0.75 }}>
            {props.mode === "deposit"
              ? (props.isWhitelisted ? "Verified wallet required." : "Not verified, deposit is disabled.")
              : "Withdraw is always available for your vault balance."}
          </div>

          <div style={{fontFamily: "Sans-serif, Verdana", marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.75 }}>Amount (mETH)</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{maxLabel}</div>
            </div>

            <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", gap: 10, marginTop: 8 }}>
              <input
                value={props.amount}
                onChange={(e) => props.onAmountChange(e.target.value)}
                placeholder="0.0"
                style={input}
              />
              <button type="button" style={{ ...ghostBtn, ...btnPressable }} onClick={props.onMax}>
                MAX
              </button>
            </div>

            {props.warn && (
              <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
                {props.warn}
              </div>
            )}
          </div>

          <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              disabled={confirmDisabled}
              style={{ ...primaryBtn, ...btnPressable, ...(confirmDisabled ? btnDisabled : {}) }}
              onClick={props.onConfirm}
            >
              Confirm
            </button>

            <button type="button" style={{ ...ghostBtn, ...btnPressable }} onClick={props.onClose}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
}


function Stat(props: {label: string; value: string; sublabel?: string; highlight?: boolean; valueColor?: string;}) {
  const isInfinity = props.value === "∞";

  return (
    <div style={{fontFamily: "Sans-serif, Verdana", minWidth: 160 }}>
      <div style={{...regText, fontWeight: 700}}>
        {props.label}
      </div>

      <div style={{
          fontSize: isInfinity ? 32 : 20,
          fontWeight: isInfinity ? 900 : 800,
          lineHeight: 1,
          color:
            isInfinity
              ? "#16a34a"              
              : props.valueColor  
              ?? (props.highlight ? "#0b7a3b" : undefined),
        }}
      >
        {props.value}
      </div>

      {props.sublabel && (
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {props.sublabel}
        </div>
      )}
    </div>
  );
}

function fmt18(x: bigint | undefined,digits = 4): string 
{
  if (!x) return "0";

  const s = formatUnits(x, 18);
  const [intPart, fracPart = ""] = s.split(".");

  if (digits === 0) return intPart;

  return fracPart.length > 0
    ? `${intPart}.${fracPart.slice(0, digits)}`
    : intPart;
}

function ActionModal(props: {
  open: boolean;
  title: string;
  amount: string;
  hfBefore: string;
  hfAfter: string;
  warn?: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;

  inputValue: string;
  maxDisabled?: boolean;
  confirmLabel: string;
  confirmDisabled?: boolean;

  onInputChange: (v: string) => void;
  onMax: () => void;
}) {
  if (!props.open) return null;

    const toNum = (s: string) => {
    if (s === "∞") return Infinity;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };

  const beforeN = toNum(props.hfBefore);
  const afterN = toNum(props.hfAfter);

  return (
    <div style={modalOverlay} onMouseDown={props.onClose}>
      <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{props.title}</div>
          <button style={{ ...ghostBtn, padding: "8px 10px" }} onClick={props.onClose} type="button">
            ✕
          </button>
        </div>

        <div style={{fontFamily: "Sans-serif, Verdana", marginTop: 10, fontSize: 13, opacity: 0.75 }}>Amount: <b>{props.amount || "0"}</b> </div>
        <div style={{ marginTop: 14 }}>
          <div style={actionsCell}>
            <div style={inputWrap}>
              <input
                value={props.inputValue}
                onChange={(e) => props.onInputChange(e.target.value)}
                placeholder="0.0"
                style={inputWithMax}
                inputMode="decimal"
              />

              <button
                onClick={props.onMax}
                style={{ ...maxInsideBtn, ...btnPressable }}
                className="pressable"
                disabled={props.maxDisabled}
                type="button"
              >
                MAX
              </button>
            </div>

            <button
              onClick={props.onConfirm}
              style={{...primaryBtn,...btnPressable,alignSelf: "center", ...(props.confirmDisabled ? btnDisabled : {}),}}
              className="pressable"
              disabled={props.confirmDisabled || props.busy}
              type="button"
            >
              {props.busy ? "Confirming..." : props.confirmLabel}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{fontFamily: "Sans-serif, Verdana", fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Health Factor</div>

          <div style={{fontFamily: "Sans-serif, Verdana", display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 20, fontWeight: 900 }}>
              {props.hfBefore}
            </span>

            <span style={{ fontSize: 20, fontWeight: 900,
                color:
                  props.hfAfter !== "∞" &&
                  props.hfBefore !== "∞" &&
                  Number(props.hfAfter) < Number(props.hfBefore)
                    ? "#dc2626"
                    : "#16a34a",
              }}
            >
              →
            </span>

            <span style={{fontFamily: "Sans-serif, Verdana",fontSize: 20,fontWeight: 900,
                color:
                  props.hfAfter === "∞"
                    ? "#16a34a"
                    : Number(props.hfAfter) < 1
                    ? "#dc2626"
                    : "#16a34a",
              }}
            >
              {props.hfAfter}
            </span>
          </div>
        </div>

        {props.warn ? (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid #ffe3a3", background: "#fff7df", fontSize: 13 }}>
            {props.warn}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const regText: React.CSSProperties={fontFamily: "Sans-serif, Verdana", fontSize:14, opacity: 0.65};

const bottomGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 10,
  alignItems: "stretch", 
};

const page: React.CSSProperties = {
  background: "#A7AAE1", 
  padding: 20,
  fontFamily: "Sans-serif, Verdana",
  width: "100%",
  margin: "0 auto",
};

const header: React.CSSProperties = {
  fontFamily: "Sans-serif, Verdana",
  background: "#A7AAE1",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  padding: 16,
  borderRadius: 16,
};

const portfolioWrap: React.CSSProperties = {
  marginTop: 14, 
  display: "flex", 
  flexDirection: "column", gap: 14,
};

const portfolioHeader: React.CSSProperties = {
  padding: 16, 
  border: "1px solid #e6e6e6", 
  borderRadius: 16, 
  background: "#fff",
  display: "flex", 
  justifyContent: "space-between", gap: 14, flexWrap: "wrap",
};

const card: React.CSSProperties = {
  padding: 16,
  border: "1px solid #e6e6e6",
  borderRadius: 16,
  background: "#fff",
  boxShadow: "0 1px 0 rgba(0,0,0,0.02)",
  minWidth: 0,
  marginTop: 14,
};

const emptyFill: React.CSSProperties = {...regText,
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  padding: "14px 0",
};

const cardTitle: React.CSSProperties = {
  fontFamily: "Sans-serif, Verdana",
  fontSize: 18,
  fontWeight: 800,
  letterSpacing: 0.2,
  opacity: 0.85,
  marginBottom: 10,
};

const btnDisabled: React.CSSProperties = {background: "#d1d5db",color: "#6b7280",};

const btnPressable: React.CSSProperties = {
  cursor: "pointer",
  userSelect: "none",
  transition: "transform 90ms ease, background 150ms ease, color 150ms ease",
};

const ghostBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #cfcfcf",
  cursor: "pointer",
  background: "#fff",
  color: "#111",
  fontWeight: 700,
};

const input: React.CSSProperties = {
  width: "100%",
  minWidth: 0, height: 40,
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #d0d0d0",
  outline: "none",
  marginBottom: 10,
  fontFamily: "Sans-serif, Verdana",
};

const tableCols = "minmax(0, 0.5fr) minmax(0, 0.5fr) minmax(0, 0.5fr) minmax(0, 0.5fr)";

const tableHead: React.CSSProperties = {...regText,
  display: "grid",
  gridTemplateColumns: tableCols,
  gap: 10,
  padding: "10px 0",
  borderTop: "1px solid #f0f0f0",
  borderBottom: "1px solid #f0f0f0",
  fontWeight: 700,
};

const tableRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: tableCols,
  gap: 10,
  padding: "14px 0",
  alignItems: "center",
  fontFamily: "Sans-serif, Verdana",
};

const yeildSplitterRow: React.CSSProperties={ ...tableHead, borderTop:"none", borderBottom: "none", display: "flex" }

const actionsCell: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 100px", 
  gap: 10,
  alignItems: "center",
  justifyContent: "end",
  minWidth: 0,
};

const btnBase: React.CSSProperties = {
  height: 40,
  padding: "0 16px",
  borderRadius: 12,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: "40px",
  whiteSpace: "nowrap",
  fontFamily: "Sans-serif, Verdana",
};

const primaryBtn: React.CSSProperties = {
  ...btnBase,
  background: "#111",
  color: "#fff",
  border: "1px solid #111",
  cursor: "pointer",
  fontFamily: "Sans-serif, Verdana",
};

const inputWrap: React.CSSProperties = {position: "relative", width: "100%", fontFamily: "Sans-serif, Verdana",};

const inputWithMax: React.CSSProperties = {
  height: 40,
  width: "100%",
  padding: "0 54px 0 14px", 
  borderRadius: 12,
  border: "1px solid #e6e6e6",
  fontSize: 14,
  outline: "none",
};

const maxInsideBtn: React.CSSProperties = {
  position: "absolute",
  right: 6,
  top: "50%",
  transform: "translateY(-50%)",
  height: 26,
  padding: "0 10px",
  borderRadius: 8,

  fontSize: 10,
  fontWeight: 700,
  lineHeight: "26px",
  fontFamily: "Sans-serif, Verdana",

  background: "#f5f5f5",
  border: "1px solid #e6e6e6",
  cursor: "pointer",
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

const modalCard: React.CSSProperties = {
  width: "min(520px, 100%)",
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e6e6e6",
  boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
  padding: 16,
};
