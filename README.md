# Smart contracts for Easy Staking

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)

**Easy Staking** allows you to earn interest on deposits of [STAKE](https://github.com/xdaichain/stake-token) token on Ethereum side.

## How to run
### Setup
Clone the repo and then install dependencies:
```
$ npm i
$ npm i -g npx
```
### Testing
To run the entire test suite:
```
$ npm test
```
### Deployment
To run deployment in interactive mode:
```
$ npx oz create
```
More about `oz` commands [here](https://docs.openzeppelin.com/cli).

## How it works
You can deposit tokens to the contract and withdraw them with the earned interest at any time. There are 2 types of withdrawal: `1.` you can request a withdrawal and, after some blocking period, withdraw tokens without any commission or `2.` you can make an instant withdrawal by paying a small commission.

## Roles and methods available to each role

### Anyone
1. `deposit(uint256)`
2. `deposit(uint256,string)`
3. `requestWithdrawal()`
4. `requestWithdrawal(string)`
5. `makeRequestedWithdrawal(uint256)`
6. `makeRequestedWithdrawal(uint256,string)`
7. `makeForcedWithdrawal(uint256)`
8. `makeForcedWithdrawal(uint256,string)`

### Owner
The owner can only change the contract parameters and claim unsupported tokens accidentally sent to the contract.
1. `claimTokens(address,address)`
2. `setToken(address)`
3. `setIntervalsAndInterestRates(uint256[],uint256[])`
4. `setFee(uint256)`
5. `setWithdrawalLockDuration(uint256)`
6. `setWithdrawalUnlockDuration(uint256)`

### Proxy Admin
The Proxy Admin can upgrade the logic of the contracts. This role will be abolished after an audit and some testing time.

*`Note: All methods are described in code.`*
