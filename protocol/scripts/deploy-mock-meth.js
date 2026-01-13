import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);  
  const MockMETH = await ethers.getContractFactory("MockMETH");
  const token = await MockMETH.deploy();

  await token.waitForDeployment();  
  console.log("Mock mETH deployed at:", await token.getAddress());  
  const bal = await token.balanceOf(deployer.address);
  console.log("Deployer mETH balance:", ethers.formatUnits(bal, 18));

}main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

