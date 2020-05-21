# Smart contracts for Easy Staking

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)

**Easy Staking** allows a user to earn interest on [STAKE](https://github.com/xdaichain/stake-token) tokens deployed on the Ethereum mainnet. Tokens are deposited into the Easy Staking contract and earn a pre-determined interest rate while locked. 

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
A user can deposit STAKE tokens to the contract and withdraw them along with earned interest at any time. There are 2 types of withdrawals: `1.`  Timed Withdrawal: user submits a withdrawal request, and after a specified time period, tokens + interest may be withdrawn with no fee or `2.` Instant Withdrawal: user requests an instant withdrawal and pays a small fee to withdraw tokens + interest.

### Intervals

Interval and interest rate arrays determine the APR a staker earns. As an example, we can use intervals [1 week, 1 month] and interest rates [5%, 10%, 15%]. If staking for 1 week or less, a user earns 5% APR (.013% daily), if staking between 1 week and (1 week + 1 month), a user earns 10% (.027% daily), and if staking more than (1 week + 1 month), a user earns 15% (.041%). Interval start and end times are set as timestamps based on deposits and withdrawal requests.

### Withdrawal Window

When a user requests a timed withdrawal, they must wait to withdraw their tokens within a set window of time. There is a lock period before they can withdraw, then there is a set withdrawal window during which they can execute their withdrawal. 

If a user requests a timed withdrawal but fails to execute within the alloted time, their STAKE tokens are relocked into the contract. This does not reset their staking time. Tokens are relocked and accrue interest according to the initial deposit timestamp.

## Roles and methods available to each role

### Anyone
1. `deposit()`
2. `requestWithdrawal(string)`
3. `executeWithdrawal(uint256,string)`
4. `makeForcedWithdrawal(uint256,string)`

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