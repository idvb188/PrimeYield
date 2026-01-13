import "dotenv/config";
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const PRIVATE_KEY = process.env.MANTLE_PRIVATE_KEY;
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID);
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const SPLITTER = process.env.SPLITTER_ADDRESS;

console.log("RPC_URL", RPC_URL);
console.log("CHAIN_ID", CHAIN_ID);
console.log("TOKEN", TOKEN);
console.log("SPLITTER_ADDRESS", SPLITTER);

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
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "amt", type: "uint256" }], outputs: [{ type: "bool" }] },
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

  const decimals = await publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "decimals",
  });

  const amount = parseUnits("10", decimals);

  const pt = await publicClient.readContract({
    address: SPLITTER,
    abi: splitterArt.abi,
    functionName: "pt",
  });
  const yt = await publicClient.readContract({
    address: SPLITTER,
    abi: splitterArt.abi,
    functionName: "yt",
  });

  const balToken0 = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  const balPT0 = await publicClient.readContract({ address: pt, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  const balYT0 = await publicClient.readContract({ address: yt, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });

  console.log("Token balance before:", formatUnits(balToken0, decimals));
  console.log("PT balance before:", formatUnits(balPT0, decimals));
  console.log("YT balance before:", formatUnits(balYT0, decimals));

  const allowance = await publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, SPLITTER],
  });

  if (allowance < amount) {
    const hashA = await walletClient.writeContract({
      address: TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [SPLITTER, amount],
    });
    await publicClient.waitForTransactionReceipt({
      hash: hashA,
      timeout: 120_000,         
      pollingInterval: 2_000,   
    });

    console.log("approve ok");
  } else {
    console.log("approve already sufficient");
  }

  const hashS = await walletClient.writeContract({
    address: SPLITTER,
    abi: splitterArt.abi,
    functionName: "split",
    args: [amount, account.address],
  });
  await publicClient.waitForTransactionReceipt({ hash: hashS });
  console.log("split ok");

  const balToken1 = await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  const balPT1 = await publicClient.readContract({ address: pt, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  const balYT1 = await publicClient.readContract({ address: yt, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });

  console.log("Token balance after:", formatUnits(balToken1, decimals));
  console.log("PT balance after:", formatUnits(balPT1, decimals));
  console.log("YT balance after:", formatUnits(balYT1, decimals));

  const claim = await publicClient.readContract({
    address: SPLITTER,
    abi: splitterArt.abi,
    functionName: "previewClaim",
    args: [account.address],
  });
  console.log("previewClaim:", formatUnits(claim, decimals));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
