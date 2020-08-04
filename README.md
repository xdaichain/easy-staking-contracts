# Smart contracts for EasyStaking

[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)

**EasyStaking** provides an alternative emission-accruing application for [POSDAO](https://forum.poa.network/t/posdao-white-paper/2208) participants and STAKE liquidity providers. Users can deposit [STAKE](https://github.com/xdaichain/stake-token) tokens deployed on the Ethereum mainnet and receive a pre-determined emission rate while tokens are locked in the contract.

EasyStaking gives users an additional choice for STAKE token usage. There are no minimum deposit requirements (vs minimum 1000K for POSDAO delegated staking) and several withdrawal options available for users. While the overall APR is set lower in EasyStaking than for POSDAO stakers, effective emission accrual will vary between the two methods based on POSDAO reward distribution percentages.

EasyStaking also provides emission distribution options for STAKE liquidity providers. A specified liquidity pool receives a % of emissions on every withdrawal event.

EasyStaking serves to reduce the overall amount of STAKE in active circulation, provides options for STAKE holders on Ethereum, and acts as a mechanism to limit available liquidity and supply. Limited supply in the open market increases security for POSDAO chains such as the xDai stable chain.


See also: https://www.xdaichain.com/for-stakers/easy-staking

UI: https://easy-staking.xdaichain.com

## Security Audit

EasyStaking was audited by Quantstamp. You can find the audit report [here](https://github.com/xdaichain/easy-staking-contracts/blob/master/audit/Quantstamp/xDai%20EasyStaking%20-%20Final%20Report.pdf).

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


### Making a deposit

In order to make a deposit, a user can call `deposit(uint256 _amount)` function of the `EasyStaking` contract or directly send STAKE tokens to the `EasyStaking` contract using `transfer` or `transferFrom` ERC20 function of the [STAKE token contract](https://etherscan.io/address/0x0Ae055097C6d159879521C384F1D2123D1f195e6). The contract will generate a unique ID of the new deposit and accept tokens. The `deposit(uint256 _amount)` function requires tokens to be approved by the user first (using `approve` ERC20 function of the STAKE token).

The easiest way to make a new deposit is to call the `transfer` function of the STAKE token.

To replenish an existing deposit, the user can call `deposit(uint256 _depositId, uint256 _amount)` function specifying the ID of the existing deposit. In this case, the EasyStaking contract will accrue emission, add the specified `_amount` to the deposit, and reset the deposit's timestamp to the current one. This function can be useful for exchanges.

### Making a timed withdrawal

To withdraw tokens from the `EasyStaking` contract without a fee, a user needs to submit a withdrawal request using `requestWithdrawal(uint256 _depositId)` function. After `withdrawalLockDuration` time has elapsed, the user must call `makeRequestedWithdrawal(uint256 _depositId, uint256 _amount)` within the withdrawal window defined in `withdrawalUnlockDuration`. If the user misses the withdrawal window time period, they can repeat the steps (calling `requestWithdrawal` again and then wait for the `withdrawalLockDuration` time before calling `makeRequestedWithdrawal`).

The `_amount` parameter allows the user to define the amount of tokens to withdraw from their deposit. The balance can be obtained using the `balances(address _holder, uint256 _depositId)` public getter. The `_amount` can be passed as `0` which means the user wants to withdraw all of their tokens with accrued emission.

When withdrawing a deposit (fully or partly) the user will receive the specified amount of tokens and accrued emission.

### Making an instant withdrawal

To withdraw tokens from the `EasyStaking` contract immediately, a user needs to call `makeForcedWithdrawal(uint256 _depositId, uint256 _amount)`. In this case, the fee will be subtracted from the deposit.

### Examples of accruing emission

There are 2 parts that make up the emission rate:
1. Personal (time-based): Calculated using a sigmoid function based on the staking period and amount of time a deposit is staked (max 7.5%).
2. General (supply-based): Calculated using a linear function and based on the total amount of staked tokens in relation to the total supply of STAKE tokens (max 7.5%). There is also a `totalSupplyFactor` which defines a percentage of STAKE's `totalSupply` (from 0% to 100%) used for the supply-based emission calculation. The factor can be changed by the owner.

Accrued emissions are calculated for the user (`userShare`), and the remaining accrued amount (15% APR - `userShare`) is sent to the assigned Liquidity Pool (LP) `liquidityProvidersRewardAddress`.

Data for examples:
1. sigmoid function: https://www.desmos.com/calculator/2xtimbnzqw
2. total supply: `8537500 STAKE`
3. total supply factor: 100%
4. total staked: `1500000 STAKE`
5. instant withdrawal fee: 3%

**1st example:**

User deposits `1000 tokens` then makes an instant withdrawal near this block. In this case, accrued emission is close to 0 with a fee of about `30 tokens`. User receives about `970 tokens` back. The LP also receives close to 0 in accrued emissions.

**2nd example:**

User deposits `1000 tokens`. After `2 weeks` (14 days), the user replenishes the deposit by adding an additional `1000 tokens`. The personal APR is `2.67%` (see the graph of the sigmoid function), the general APR is `(1500000 + 1000) / 8537500 * 0.075 * 100 = 1.32%` and accrued emission is `1000 * (2.67 + 1.32) / 100 * 14 / 365 = 1.53 tokens` (we assume a year has 365 days). The new user balance is `1000 + 1.53 + 1000 = 2001.53 tokens` and the deposit date is reset (restarts at the replenishment time point). The LP also receives accrued emission from the deposit replenishment: `1000 * (15-(2.67 + 1.32)) / 100 * 14 / 365 = 4.22 tokens`.

_Note: The user could have instead chosen to create a 2nd deposit, which would have created a new deposit id and not reset the deposit date or generated accrued emissions for the initial 1000 token deposit._ 

`3 months` (90 days) later the user makes a timed withdrawal for the total amount of `2001.53` tokens. The personal APR is `6.94%`, the general APR is `(1500000 + 2001.53) / (8537500 + 1.53 + 4.22) * 0.075 * 100 = 1.32%` and accrued emission for the user is `2001.53 * (6.94 + 1.32) / 100 * 90 / 365 = 40.76 tokens`. The LP also receives accrued emission from the timed withdrawal: `2001.53 * (15-(6.94 + 1.32)) / 100 * 90 / 365 = 33.26 tokens`. On timed withdrawal:

- User receives `2001.53 + 40.76 = 2,042.29 tokens`.
- LP receives `33.26 tokens`.

**3rd example**

User deposits `1000 tokens`. Then they make a timed withdrawal for half after `6 months` (180 days). The personal APR is `7.35%`, the general APR is `(1500000 + 1000) / 8537500 * 0.075 * 100 = 1.32%` and accrued emission is `500 * (7.35 + 1.32) / 100 * 180 / 365 = 21.37 tokens`. 

- User receives `521.37 tokens`, the new balance is `500 tokens` and the deposit date is not reset (that is, the personal APR remains equal to 7.35% and continues to grow). 

- On withdrawal, the LP receives `500 * (15-(7.35 + 1.32)) / 100 * 180 / 365 = 15.6 tokens`.

### Withdrawal Window

When a user requests a timed withdrawal, they must wait to withdraw their tokens within a set window of time. There is a lock period (e.g., 12 hours) before they can withdraw, then there is a set withdrawal window during which they can execute their withdrawal (e.g., 12 hours as well).

If a user requests a timed withdrawal but fails to execute within the allotted time, their STAKE tokens are relocked into the contract. This does not update their deposit date. Tokens are relocked and accrue emission according to the initial deposit timestamp.


## Roles and methods available to each role

### Anyone
1. `deposit(uint256)`
2. `deposit(uint256,uint256)`
3. `requestWithdrawal(uint256)`
4. `makeRequestedWithdrawal(uint256,uint256)`
5. `makeForcedWithdrawal(uint256,uint256)`

### Owner
The owner can change the contract parameters and claim unsupported tokens accidentally sent to the contract.

For the `set*` functions listed below the changed parameter values will only take effect `7 days` after the function is called.

1. `setFee(uint256)` allows the owner to set a fee percentage for an instant withdrawal. 2% by default.
2. `setWithdrawalLockDuration(uint256)` allows the owner to change time period from the withdrawal request after which a timed withdrawal is available. 12 hours by default. Cannot exceed 30 days.
3. `setWithdrawalUnlockDuration(uint256)` allows the owner to change time period during which a timed withdrawal is available from the moment of unlocking. 12 hours by default. Cannot be less than 1 hour.
4. `setTotalSupplyFactor(uint256)` allows the owner to change the value of `total supply factor` which defines a percentage of STAKE's `totalSupply` (from 0% to 100%) used for the supply-based emission calculation (the larger the factor, the smaller the supply-based emission). 50% by default.
5. `setSigmoidParameters(uint256,int256,uint256)` allows the owner to change sigmoid's parameters (`a`, `b`, and `c`) which is used for the time-based emission. The default values are: `a` = `75000000000000000`, `b` = `0`, `c` = `10000000000000` - they represent a sigmoid on the page https://www.desmos.com/calculator/2xtimbnzqw
6. `setLiquidityProvidersRewardAddress(address)` allows the owner to change the address to which the liquidity providers reward is sent.
7. `claimTokens(address,address,uint256)` allows the owner to return any tokens (or native coins) mistakenly transferred to the EasyStaking contract by any address.
8. `transferOwnership(address)` allows the owner to transfer the ownership to another address.
9. `renounceOwnership()` allows the owner to resign forever.

### Proxy Admin
The Proxy Admin can upgrade the contract logic. This role was abolished by [calling `renounceOwnership`](https://etherscan.io/tx/0x5b8ee5625ee76f90bc3444811185202af3bf29e8d1a72c2dc72767b32cfd14e9) in the [ProxyAdmin contract](https://etherscan.io/address/0xec800ffdd7c4081911614fed9a6dd780ab264ea6#code).

*`Note: All methods are described in code.`*
