# Smart contracts for Easy Staking

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)

**Easy Staking** provides an alternative emission-accruing application for [POSDAO](https://forum.poa.network/t/posdao-white-paper/2208) participants. Users can deposit [STAKE](https://github.com/xdaichain/stake-token) tokens deployed on the Ethereum mainnet and get a pre-determined emission rate while tokens are locked in the contract.

Easy Staking gives users an additional choice for STAKE token usage. There are no minimum deposit requirements (vs minimum 1000K for POSDAO delegated staking) and several withdrawal options available for users. While the overall APR is set lower in Easy Staking than for POSDAO stakers, effective emission accruing will vary between the two methods based on POSDAO reward distribution percentages.

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
Users can deposit [STAKE](https://github.com/xdaichain/stake-token) tokens to the contract and withdraw them along with accrued emission at any time.

There are 2 types of withdrawal:
1. _Timed Withdrawal:_ user submits a withdrawal request, and after a specified time period, tokens and accrued emission may be withdrawn with no fee.
2. _Instant Withdrawal:_ user requests an instant withdrawal and pays a small fee to withdraw tokens and accrued emission.

*Note:* if user deposits more tokens to the already created deposit it will update (reset to current) the deposit date and accrue emission for the previous deposit amount.

### Examples of accruing emission

There are 2 parts of emission rate:
1. personal, that is calculated using sigmoid function and depends on the staking period (max 7.5%)
2. general, that is calculated using linear function and depends on the total amount of staked tokens in relation to the total supply of STAKE token (max 7.5%)

Data for examples:
1. sigmoid function: https://www.desmos.com/calculator/2xtimbnzqw
2. total supply: `8537500 STAKE`
3. total staked: `1500000 STAKE`
4. instant withdrawal fee: 3%

**1st example:**

User deposits `1000 tokens` then makes an instant withdrawal near this block. In this case, accrued emission is close to 0 with a fee of about `30 tokens`. User receives about `970 tokens` back.

**2nd example:**

User deposits `1000 tokens`. After `2 weeks` (14 days), the user replenishes the deposit by other `1000 tokens`. The personal APR is `2.67%` (look at the graph of the sigmoid function), the general APR is `(1500000 + 1000) / 8537500 * 0.075 * 100 = 1.32%` and accrued emission is `1000 * (2.67 + 1.32) / 100 * 14 / 365 = 1.53 tokens` (we assume a year has 365 days). The new balance is `1000 + 1.53 + 1000 = 2001.53 tokens` and deposit date is reset (starts from the replenishment point).

`3 months` (90 days) later the user makes a timed withdrawal for the total amount of `2001.53` tokens. The personal APR is `6.94%`, the general APR is `(1500000 + 2001.53) / 8537501.53 * 0.075 * 100 = 1.32%` and accrued emission is `2001.53 * (6.94 + 1.32) / 100 * 90 / 365 = 40.76 tokens`. User receives `2001.53 + 40.76 = 2,042.29 tokens`.

**3rd example**

User deposits `1000 tokens`. Then they make a timed withdrawal for half after `6 months` (180 days). The personal APR is `7.35%`, the general APR is `(1500000 + 1000) / 8537500 * 0.075 * 100 = 1.32%` and accrued emission is `500 * (7.35 + 1.32) / 100 * 180 / 365 = 21.37 tokens`. User receives `521.37 tokens`, the new balance is `500 tokens` and the deposit date isn't reset (that is, the personal APR remained equal to 7.35%).

### Withdrawal Window

When a user requests a timed withdrawal, they must wait to withdraw their tokens within a set window of time. There is a lock period (e.g., 7 days) before they can withdraw, then there is a set withdrawal window during which they can execute their withdrawal (e.g., 24 hours).

If a user requests a timed withdrawal but fails to execute within the allotted time, their STAKE tokens are relocked into the contract. This does not update their deposit date. Tokens are relocked and accrue emission according to the initial deposit timestamp.


## Roles and methods available to each role

### Anyone
1. `deposit(uint256)`
2. `deposit(uint256,uint256)`
3. `requestWithdrawal(uint256)`
4. `makeRequestedWithdrawal(uint256,uint256)`
5. `makeForcedWithdrawal(uint256,uint256)`

### Owner
The owner can only change the contract parameters and claim unsupported tokens accidentally sent to the contract.
1. `claimTokens(address,address)`
2. `setFee(uint256)`
3. `setWithdrawalLockDuration(uint256)`
4. `setWithdrawalUnlockDuration(uint256)`
5. `setSigmoidParameters(uint256,int256,uint256)`
6. `setLiquidityProvidersRewardAddress(address)`

### Proxy Admin
The Proxy Admin can upgrade the contract logic. This role will be abolished following an audit and sufficient testing.

*`Note: All methods are described in code.`*
