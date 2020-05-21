module.exports = {
  norpc: true,
  compileCommand: '../node_modules/.bin/truffle compile',
  testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
  copyPackages: ['openzeppelin-solidity'],
  providerOptions: {
    accounts: [
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501202', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501203', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501204', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501205', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501206', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501207', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501208', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501209', balance: '0xD3C21BCECCEDA1000000' },
      { secretKey: '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501210', balance: '0xD3C21BCECCEDA1000000' },
    ],
  }
};
