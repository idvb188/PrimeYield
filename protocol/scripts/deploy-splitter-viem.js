import hre from "hardhat";

const POOL = process.env.NEXT_PUBLIC_POOL_ADDRESS; 
const MATURITY_TS = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // +7 дней

async function main() {
  const connection = await hre.network.connect();
  const [walletClient] = await connection.viem.getWalletClients();

  const OWNER = walletClient.account.address;

  console.log("Deployer/Owner:", OWNER);
  console.log("POOL:", POOL);
  console.log("MATURITY_TS:", MATURITY_TS);

  if (!POOL) throw new Error("Missing NEXT_PUBLIC_POOL_ADDRESS in env");

  // constructor(address pool_, uint256 maturity_, address owner_)
  const splitter = await connection.viem.deployContract("contracts/YieldSplitter.sol:YieldSplitter",[POOL, MATURITY_TS, OWNER]);

  console.log("YieldSplitter deployed to:", splitter.address);

  // PT/YT создаются внутри конструктора — читаем адреса
  const pt = await splitter.read.pt();
  const yt = await splitter.read.yt();

  console.log("PT:", pt);
  console.log("YT:", yt);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
