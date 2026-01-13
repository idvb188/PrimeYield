import "dotenv/config";
import { createPublicClient, createWalletClient, http, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const PRIVATE_KEY = process.env.MANTLE_PRIVATE_KEY;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const SPLITTER = process.env.SPLITTER_ADDRESS;

if (!RPC_URL || !PRIVATE_KEY || !CHAIN_ID || !TOKEN || !SPLITTER) {
  throw new Error("Missing env: RPC_URL PRIVATE_KEY CHAIN_ID TOKEN_ADDRESS SPLITTER_ADDRESS");
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
];

function loadArtifact(rel) {
  const p = path.join(process.cwd(), rel);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY);
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account });
  const splitterArt = loadArtifact("artifacts/contracts/YieldSplitter.sol/YieldSplitter.json");
  const decimals = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "decimals" });
  const bal0 = await publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });

  const claim0 = await publicClient.readContract({
    address: SPLITTER,
    abi: splitterArt.abi,
    functionName: "previewClaim",
    args: [account.address],
  });

  console.log("mETH balance before:", formatUnits(bal0, decimals));
  console.log("previewClaim before:", formatUnits(claim0, decimals));

  const hash = await walletClient.writeContract({
    address: SPLITTER,
    abi: splitterArt.abi,
    functionName: "claimYield",
    args: [account.address],
  });

  await publicClient.waitForTransactionReceipt({hash, timeout: 120_000, pollingInterval: 2_000,});

  const bal1 = await publicClient.readContract({address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address],});
  const claim1 = await publicClient.readContract({address: SPLITTER, abi: splitterArt.abi, functionName: "previewClaim", args: [account.address], });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
