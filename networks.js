
const HDWalletProvider = require('truffle-hdwallet-provider');
require('dotenv').config();

function getProvider(network) {
  return () => new HDWalletProvider(process.env.MNEMONIC, `https://${network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`);
}

module.exports = {
  networks: {
    development: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      gas: 5000000,
      gasPrice: 5e9,
      networkId: '*',
    },
    kovan: {
      provider: getProvider('kovan'),
      gasPrice: 1e10,
      networkId: 42,
    },
    mainnet: {
      provider: getProvider('mainnet'),
      gasPrice: 7e10,
      networkId: 1,
    },
  },
};
