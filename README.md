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
You can deposit [STAKE](https://github.com/xdaichain/stake-token) tokens to the contract and withdraw them with the earned interest at any time.

There are 2 types of withdrawal:
1. request a withdrawal and, after some blocking period, withdraw tokens without any commission
2. make an instant withdrawal by paying a small commission.

*Note:* each deposit and withdrawal operation adds current earned interest to your balance and updates your deposit date, so be careful if you want to make a long staking — make a deposit only once in this case.

### Examples of earning interest

The contract has an array of staking intervals (for example: `[1 month, 2 months, 3 months, 6 months]`), an array of insterest rates (for example: `[5%, 6%, 7%, 8%, 10%]`) and a commission for the instant withdrawal (for example: `3%`).

```
if (staking_period < 1 month) interest_rate = 5%
else if (staking_period < (1 month + 2 months)) interest_rate = 6%
else if (staking_period < (1 month + 2 months + 3 months)) interest_rate = 7%
else if (staking_period < (1 month + 2 months + 3 months + 6 months)) interest_rate = 8%
else interest_rate = 10%
```

**1st example:**

You made your first deposit `1000 tokens` and then made an instant withdrawal in or near this block. In this case, your earned interest will be 0 or very small and you will pay a commission about `30 tokens` and get about `970 tokens` back.

**2nd example:**

You made your first deposit `1000 tokens`. Then you decided to make one more deposit `1000 tokens` after `2 weeks`. As it is the 1st interval the contract will pay you `5%` annual interest `(1000 * 0.05) / 365 * 14 = 1.92` and it will update your deposit date to the current date. Now you have `2001.92 tokens`, and `3 months` later you decided to withdraw all. `3 months >= (1 month + 2 months)` so this is the 3rd interval. In this case, the contract will pay you `7%` annual interest `(2001.92 * 0.07) / 365 * 90 = 34.55` and you will receive `2036.47 tokens`.

**3rd example**

You made your first deposit `1000 tokens`. Then you decided to withdraw a half after `6 months`. As it is the 4th interval the contract will pay you `8%` annual interest `(1000 * 0.08) / 365 * 180 = 3.95` and it will update your deposit date to the current date. Now you have `503.95 tokens`, and `1 year` later you decided to withdraw all. This staking period is greater than the sum of staking intervals so the contract will pay you `10%` annual interest `(503.95 * 0.1) = 50.4` and you will receive `554.35 tokens`.


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
