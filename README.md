# Smart contracts for Easy Staking

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)

**Easy Staking** provides an alternative interest-earning application for [POSDAO](https://forum.poa.network/t/posdao-white-paper/2208) participants. Users can deposit [STAKE](https://github.com/xdaichain/stake-token) tokens deployed on the Ethereum mainnet and earn a pre-determined interest rate while tokens are locked in the contract.

Easy Staking gives users an additional choice for STAKE token usage. There are no minimum deposit requirements (vs minimum 1000K for POSDAO delegated staking) and several withdrawal options available for users. While the overall APR is set lower in Easy Staking than for POSDAO stakers, effective earnings will vary between the two methods based on POSDAO reward distribution percentages.

Easy Staking serves to reduce the overall amount of STAKE in active circulation and acts as a mechanism to limit available liquidity and supply. Limited supply in the open market increases security for POSDAO chains such as the xDai stable chain.


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
### Compiling
This will create `build/contracts` directory with contract's artifacts:
```
$ npx oz compile
```
More about `oz` commands [here](https://docs.openzeppelin.com/cli).
### Deployment
To run deployment in interactive mode:
```
$ npx oz create
```

## How it works
Users can deposit [STAKE](https://github.com/xdaichain/stake-token) tokens to the contract and withdraw them along with earned interest at any time.

There are 2 types of withdrawal:
1. _Timed Withdrawal:_ user submits a withdrawal request, and after a specified time period, tokens and interest may be withdrawn with no fee.
2. _Instant Withdrawal:_ user requests an instant withdrawal and pays a small fee to withdraw tokens and interest.

*Note:* each deposit and withdrawal operation adds current earned interest to the user balance and updates (resets to current) the deposit date. If the desire is to stake for a longer period of time, user should make a single deposit and shouldn't deposit/withdraw for that period.

### Examples of earning interest

The contract has an array of staking intervals (for example: `[1 month, 2 months, 3 months, 6 months]`), an array of interest rates (for example: `[5%, 6%, 7%, 8%, 10%]`) and a fee for the instant withdrawal (for example: `3%`).

```
if (staking_period < 1 month) interest_rate = 5%
else if (staking_period < (1 month + 2 months)) interest_rate = 6%
else if (staking_period < (1 month + 2 months + 3 months)) interest_rate = 7%
else if (staking_period < (1 month + 2 months + 3 months + 6 months)) interest_rate = 8%
else interest_rate = 10%
```

**1st example:**

User deposits `1000 tokens` then makes an instant withdrawal in or near this block. In this case, earned interest will be close to 0 with a fee of about `30 tokens`. User will receive `970 tokens` back.

**2nd example:**

User deposits `1000 tokens`. After `2 weeks` (14 days), the user makes a 2nd deposit of `1000 tokens`. This is within the 1st interval, so the contract will pay `5%` annual interest `(1000 * 0.05) / 365 * 14 = 1.92` and will update the deposit date to the current date. The new balance will be `1000 + 1.92 + 1000 = 2001.92 tokens`.

`3 months` (90 days) later the user makes a timed withdawal for the total amount. `3 months >= (1 month + 2 months)` which corresponds to the 3rd interval. In this case, the contract will pay `7%` annual interest `(2001.92 * 0.07) / 365 * 90 = 34.55` and the user will receive `2001.92 + 34.55 = 2036.47 tokens`.

**3rd example**

User deposits `1000 tokens`. They make a timed withdraw for half after `6 months` (180 days). This is the 4th interval corresponding to `8%` annual interest `(1000 * 0.08) / 365 * 180 = 39.45` . User receives `500 tokens`, the remaining half + interest remains in the contract and the deposit date is updated to the current date. 

User has `500 + 39.45 = 539.45 tokens`, and `1 year` later they decide to withdraw all. This staking period is greater than the sum of staking intervals so the contract pays `10%` annual interest `(539.45 * 0.1) = 53.95` and user receives `539.45 + 53.95 = 593.4 tokens`.

### Withdrawal Window

When a user requests a timed withdrawal, they must wait to withdraw their tokens within a set window of time. There is a lock period (e.g., 7 days) before they can withdraw, then there is a set withdrawal window during which they can execute their withdrawal (e.g., 24 hours).

If a user requests a timed withdrawal but fails to execute within the allotted time, their STAKE tokens are relocked into the contract. This does not update their deposit date. Tokens are relocked and accrue interest according to the initial deposit timestamp.


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
The Proxy Admin can upgrade the contract logic. This role will be abolished following an audit and sufficient testing.

*`Note: All methods are described in code.`*
