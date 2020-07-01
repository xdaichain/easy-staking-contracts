module.exports = {
  networks: {
    test: {
      host: "localhost",
      port: 8544,
      gas: 8000000,
      network_id: "*",
    },
    coverage: {
      host: "localhost",
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
      network_id: "*",
    },
  },
  plugins: ["solidity-coverage"],
  mocha: {
    enableTimeouts: false,
  },
  compilers: {
    solc: {
      version: "0.5.16",
      settings: {
       optimizer: {
         enabled: true,
         runs: 200,
       },
      },
    },
  },
};
