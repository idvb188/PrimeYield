// import "dotenv/config";
// import "@nomicfoundation/hardhat-ethers";
// import "@nomicfoundation/hardhat-viem";
// import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
// import { configVariable, defineConfig } from "hardhat/config";
// // require("@nomicfoundation/hardhat-ethers");

import "dotenv/config";
import { configVariable, defineConfig } from "hardhat/config";

import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatViemPlugin from "@nomicfoundation/hardhat-viem";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin,hardhatToolboxViemPlugin,],
  solidity: {
    profiles: {
      default: {version: "0.8.28",},
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {enabled: true, runs: 200,}, viaIR: true,
        },
      },
    },
  },
  networks: {
    // hardhatMainnet: {
    //   type: "edr-simulated",
    //   chainType: "l1",
    // },
    // hardhatOp: {
    //   type: "edr-simulated",
    //   chainType: "op",
    // },
    // sepolia: {
    //   type: "http",
    //   chainType: "l1",
    //   url: configVariable("SEPOLIA_RPC_URL"),
    //   accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    // },

    mantle: {
      type: "http",
      chainType: "l1",
      url: "https://rpc.sepolia.mantle.xyz",
      chainId: 5003,
      accounts: process.env.MANTLE_PRIVATE_KEY ? [process.env.MANTLE_PRIVATE_KEY.trim()] : [],
      //accounts: [process.env.MANTLE_PRIVATE_KEY || ""], 
      //accounts: [configVariable("MANTLE_PRIVATE_KEY")],
    },

  },
});
