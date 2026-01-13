import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const PRIVATE_KEY = process.env.MANTLE_PRIVATE_KEY;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const POOL = process.env.NEXT_PUBLIC_POOL_ADDRESS;  

if (!RPC_URL || !PRIVATE_KEY || !CHAIN_ID || !TOKEN || !POOL) {
  throw new Error("Missing env: RPC_URL PRIVATE_KEY CHAIN_ID TOKEN_ADDRESS POOL_ADDRESS");
}

const chain = {
  id: CHAIN_ID,
  name: "mantle",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "amt", type: "uint256" }], outputs: [{ type: "bool" }] },
];

const poolAbi = [
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "borrow", stateMutability: "nonpayable", inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
];

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });
  const decimals = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "decimals" });
  const depositAmt = 1n; 
  const borrowAmt = 0n;  

  const bal0 = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  console.log("mETH balance:", formatUnits(bal0, decimals));
  if (bal0 < depositAmt) throw new Error("Not enough mETH to deposit 1000");

  const allowance = await publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, POOL],
  });

  if (allowance < depositAmt) {
    const hashA = await walletClient.writeContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [POOL, depositAmt],
    });
    await publicClient.waitForTransactionReceipt({ hash: hashA });
    console.log("approve(pool) ok");
  } else {
    console.log("approve(pool) already sufficient");
  }

  // deposit
  const hashD = await walletClient.writeContract({
    address: POOL,
    abi: poolAbi,
    functionName: "deposit",
    args: [depositAmt],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashD });
  console.log("deposit ok");

  const bal1 = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  console.log("mETH balance after:", formatUnits(bal1, decimals));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
