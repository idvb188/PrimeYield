import 'dotenv/config'
import { createPublicClient, createWalletClient, http, parseEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import fs from "node:fs";
import path from "node:path";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL!
const PRIVATE_KEY = process.env.MANTLE_PRIVATE_KEY! as `0x${string}`
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID!)
const POOL = process.env.NEXT_PUBLIC_POOL_ADDRESS! as `0x${string}`
const OWNER = process.env.OWNER_ADDRESS! as `0x${string}`

console.log("RPC_URL", RPC_URL);
console.log("CHAIN_ID", CHAIN_ID);
console.log("POOL", POOL);
console.log("OWNER", OWNER);


const chain = {
  id: CHAIN_ID,
  name: 'mantle',
  nativeCurrency: { name: 'MNT', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
} as const

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY)

  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
  const walletClient = createWalletClient({ chain, transport: http(RPC_URL), account })

  const maturity = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 3600) // +7 days

  const artifactPath = path.join(
    process.cwd(),
    "artifacts",
    "contracts",
    "YieldSplitter.sol",
    "YieldSplitter.json"
  );
  const splitterArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));


  const hash = await walletClient.deployContract({
    abi: splitterArtifact.abi,
    bytecode: splitterArtifact.bytecode as `0x${string}`,
    args: [POOL, maturity, OWNER],
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const splitter = receipt.contractAddress!
  console.log('YieldSplitter:', splitter)

  const pt = await publicClient.readContract({
    address: splitter,
    abi: splitterArtifact.abi,
    functionName: 'pt',
  })
  const yt = await publicClient.readContract({
    address: splitter,
    abi: splitterArtifact.abi,
    functionName: 'yt',
  })

  console.log('PT:', pt)
  console.log('YT:', yt)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
