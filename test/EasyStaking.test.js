const { ether, BN, expectRevert, expectEvent, constants, time, balance, send } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');
const { ethers } = require('ethers');

const EasyStaking = artifacts.require('EasyStaking');
const EasyStakingMock = artifacts.require('EasyStakingMock');
const ReceiverMock = artifacts.require('ReceiverMock');
const Token = artifacts.require('ERC677Mock');

contract('PoaMania', accounts => {
  const [owner, user1, user2] = accounts;
  const YEAR = new BN(31536000); // in seconds
  const MAX_EMISSION_RATE = ether('0.15'); // 15%
  const fee = ether('0.03'); // 3%
  const withdrawalLockDuration = new BN(600); // in seconds
  const withdrawalUnlockDuration = new BN(60); // in seconds
  const sigmoidParamA = ether('0.075'); // 7.5%
  const sigmoidParamB = new BN(0);
  const sigmoidParamC = new BN(10000000000000);
  const oneEther = ether('1');

  let easyStaking;
  let stakeToken;
  let liquidityProvidersRewardAddress = user2;

  const initializeMethod = 'initialize(address,address,address,uint256,uint256,uint256,uint256,int256,uint256)';

  function initialize(...params) {
    if (params.length === 0) {
      params = [
        owner,
        stakeToken.address,
        liquidityProvidersRewardAddress,
        fee.toString(),
        withdrawalLockDuration.toString(),
        withdrawalUnlockDuration.toString(),
        sigmoidParamA.toString(),
        sigmoidParamB.toString(),
        sigmoidParamC.toString(),
      ];
    }
    return easyStaking.methods[initializeMethod](...params, { from: owner });
  }

  function squareRoot(y) {
    let z = new BN(0);
    if (y.gt(new BN(3))) {
      z = y;
      let x = y.div(new BN(2)).add(new BN(1));
      while (x.lt(z)) {
        z = x;
        x = y.div(x).add(x).div(new BN(2));
      }
    } else if (!y.isZero()) {
      z = new BN(1);
    }
    return z;
  }

  function calculateUserAccruedEmission(deposit, timePassed, totalSupply, totalStaked) {
    let userEmissionRate = sigmoidParamA.mul(timePassed.sub(sigmoidParamB)).div(squareRoot(timePassed.sub(sigmoidParamB).sqr().add(sigmoidParamC)));
    if (userEmissionRate.lt(new BN(0))) {
      userEmissionRate = new BN(0);
    }
    const emissionRateBasedOnTotalStakedAmount = MAX_EMISSION_RATE.div(new BN(2)).mul(totalStaked).div(totalSupply);
    userEmissionRate = userEmissionRate.add(emissionRateBasedOnTotalStakedAmount);
    return deposit.mul(userEmissionRate).div(oneEther).mul(timePassed).div(YEAR);
  }

  beforeEach(async () => {
    stakeToken = await Token.new();
    easyStaking = await EasyStaking.new();
    liquidityProvidersRewardContract = await ReceiverMock.new();
    await initialize();
    await stakeToken.initialize('Stake', 'STAKE', 18, 0, owner, [owner, easyStaking.address], []);
  });

  describe('initialize', () => {
    it('should be set up correctly', async () => {
      expect(await easyStaking.token()).to.equal(stakeToken.address);
      const params = await easyStaking.getSigmoidParameters();
      expect(params.a).to.be.bignumber.equal(sigmoidParamA);
      expect(params.b).to.be.bignumber.equal(sigmoidParamB);
      expect(params.c).to.be.bignumber.equal(sigmoidParamC);
    });
    it('fails if any of parameters is incorrect', async () => {
      easyStaking = await EasyStaking.new();
      await expectRevert(
        initialize(
          constants.ZERO_ADDRESS,
          stakeToken.address,
          liquidityProvidersRewardAddress,
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          sigmoidParamA.toString(),
          sigmoidParamB.toString(),
          sigmoidParamC.toString(),
        ),
        'zero address'
      );
      await expectRevert(
        initialize(
          owner,
          constants.ZERO_ADDRESS,
          liquidityProvidersRewardAddress,
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          sigmoidParamA.toString(),
          sigmoidParamB.toString(),
          sigmoidParamC.toString(),
        ),
        'not a contract address'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          liquidityProvidersRewardAddress,
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          ether('0.076').toString(),
          sigmoidParamB.toString(),
          sigmoidParamC.toString(),
        ),
        'should be less than or equal to a half of the maximum emission rate'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          constants.ZERO_ADDRESS,
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          sigmoidParamA.toString(),
          sigmoidParamB.toString(),
          sigmoidParamC.toString(),
        ),
        'zero address'
      );
    });
  });
  function testDeposit(directly) {
    beforeEach(async () => {
      await stakeToken.mint(user1, ether('1000'), { from: owner });
      await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
    });
    it('should deposit', async () => {
      const value = ether('100');
      if (directly) {
        const receipt = await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
        expectEvent(receipt, 'Deposited', {
          sender: user1,
          amount: value,
          id: new BN(1),
          balance: value,
          accruedEmission: new BN(0),
          prevDepositDuration: new BN(0),
        });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      const timestamp = await time.latest();
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(value);
      expect(await easyStaking.depositDates(user1, 1)).to.be.bignumber.equal(timestamp);
    });
    it('should accrue emission', async () => {
      const value = ether('100');
      if (directly) {
        await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      const totalSupply = await stakeToken.totalSupply();
      const totalStaked = await easyStaking.totalStaked();
      const receipt = await easyStaking.methods['deposit(uint256,uint256)'](1, value, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission = calculateUserAccruedEmission(value, timePassed, totalSupply, totalStaked);
      if (directly) {
        expectEvent(receipt, 'Deposited', {
          sender: user1,
          amount: value,
          id: new BN(1),
          balance: value.add(value).add(userAccruedEmission),
          accruedEmission: userAccruedEmission,
          prevDepositDuration: new BN(timePassed),
        });
      }
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(value.add(value).add(userAccruedEmission));
      expect(await easyStaking.depositDates(user1, 1)).to.be.bignumber.equal(timestampAfter);
      expect(await easyStaking.totalStaked()).to.be.bignumber.equal(value.add(value).add(userAccruedEmission));
    });
    it('should deposit using an old id', async () => {
      await easyStaking.setFee(0, { from: owner });
      const value = ether('100');
      if (directly) {
        await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
        await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      await time.increase(YEAR);
      await easyStaking.makeForcedWithdrawal(1, 0, { from: user1 });
      await easyStaking.makeForcedWithdrawal(2, 0, { from: user1 });
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.balances(user1, 2)).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.depositDates(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.depositDates(user1, 2)).to.be.bignumber.equal(new BN(0));

      await easyStaking.methods['deposit(uint256,uint256)'](1, value, { from: user1 });
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(value);
      const timestampBefore = await time.latest();
      const totalSupply = await stakeToken.totalSupply();
      const totalStaked = await easyStaking.totalStaked();
      const balanceBefore = await stakeToken.balanceOf(user1);
      await time.increase(YEAR);
      const receipt = await easyStaking.makeForcedWithdrawal(1, 0, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission = calculateUserAccruedEmission(value, timePassed, totalSupply, totalStaked);
      const balanceAfter = await stakeToken.balanceOf(user1);
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: value.add(userAccruedEmission),
        id: new BN(1),
        balance: new BN(0),
        accruedEmission: userAccruedEmission,
        lastDepositDuration: timePassed,
      });
      expect(balanceAfter).to.be.bignumber.equal(balanceBefore.add(value.add(userAccruedEmission)));
    });
  }
  describe('deposit', () => testDeposit(true));
  describe('onTokenTransfer', () => testDeposit(false));
  describe('makeForcedWithdrawal', () => {
    const value = ether('1000');
    beforeEach(async () => {
      await stakeToken.mint(user1, value, { from: owner });
      await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
      await easyStaking.setFee(0, { from: owner });
    });
    it('should withdraw', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      let timestampBefore = await time.latest();
      expect(await easyStaking.totalStaked()).to.be.bignumber.equal(value);
      let totalSupply = await stakeToken.totalSupply();
      let totalStaked = await easyStaking.totalStaked();
      let receipt = await easyStaking.makeForcedWithdrawal(1, oneEther, { from: user1 });
      let timestampAfter = await time.latest();
      let timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission1 = calculateUserAccruedEmission(oneEther, timePassed, totalSupply, totalStaked);
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(value.sub(oneEther));
      expect(await easyStaking.depositDates(user1, 1)).to.be.bignumber.equal(timestampAfter);
      expect(await easyStaking.totalStaked()).to.be.bignumber.equal(value.sub(oneEther));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther.add(userAccruedEmission1));
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: oneEther.add(userAccruedEmission1),
        id: new BN(1),
        balance: value.sub(oneEther),
        accruedEmission: userAccruedEmission1,
        lastDepositDuration: timestampAfter.sub(timestampBefore),
      });
      timestampAfter = timestampBefore;
      totalSupply = await stakeToken.totalSupply();
      totalStaked = await easyStaking.totalStaked();
      receipt = await easyStaking.makeForcedWithdrawal(1, 0, { from: user1 });
      timestampAfter = await time.latest();
      timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission2 = calculateUserAccruedEmission(value.sub(oneEther), timePassed, totalSupply, totalStaked);
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(userAccruedEmission1).add(userAccruedEmission2));
      expect(await easyStaking.totalStaked()).to.be.bignumber.equal(new BN(0));
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: value.sub(oneEther).add(userAccruedEmission2),
        id: new BN(1),
        balance: new BN(0),
        accruedEmission: userAccruedEmission2,
        lastDepositDuration: timestampAfter.sub(timestampBefore),
      });
    });
    it('should withdraw with accrued emission', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      const totalSupply = await stakeToken.totalSupply();
      const totalStaked = await easyStaking.totalStaked();
      await easyStaking.makeForcedWithdrawal(1, 0, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission = calculateUserAccruedEmission(value, timePassed, totalSupply, totalStaked);
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(userAccruedEmission));
    });
    it('should withdraw part and accrue emission', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      const totalSupply = await stakeToken.totalSupply();
      const totalStaked = await easyStaking.totalStaked();
      await easyStaking.makeForcedWithdrawal(1, oneEther, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission = calculateUserAccruedEmission(oneEther, timePassed, totalSupply, totalStaked);
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(value.sub(oneEther));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther.add(userAccruedEmission));
    });
    it('should accrue emission for different users from 1 address', async () => {
      const exchange = user1;
      const values = [ether('100'), ether('250'), ether('600')];
      const MONTH = 2592000; // in seconds
      for (let i = 0; i < 3; i++) {
        await easyStaking.methods['deposit(uint256)'](values[i], { from: exchange });
        expect(await easyStaking.balances(exchange, i + 1)).to.be.bignumber.equal(values[i]);
      }
      expect(await easyStaking.totalStaked()).to.be.bignumber.equal(values.reduce((acc, cur) => acc.add(cur), new BN(0)));
      let exchangeBalance = await stakeToken.balanceOf(exchange);
      await time.increase(MONTH * 4);
      for (let i = 0; i < 3; i++) {
        const timestampBefore = await easyStaking.depositDates(exchange, i + 1);
        const totalSupply = await stakeToken.totalSupply();
        const totalStaked = await easyStaking.totalStaked();
        await easyStaking.makeForcedWithdrawal(i + 1, 0, { from: user1 });
        const timestampAfter = await time.latest();
        const timePassed = timestampAfter.sub(timestampBefore);
        const userAccruedEmission = calculateUserAccruedEmission(values[i], timePassed, totalSupply, totalStaked);
        const expectedExchangeBalance = exchangeBalance.add(values[i]).add(userAccruedEmission);
        expect(userAccruedEmission).to.be.bignumber.gt(new BN(0));
        expect(await easyStaking.balances(exchange, i + 1)).to.be.bignumber.equal(new BN(0));
        expect(await stakeToken.balanceOf(exchange)).to.be.bignumber.equal(expectedExchangeBalance);
        exchangeBalance = expectedExchangeBalance;
        await time.increase(MONTH * 4);
      }
      expect(await easyStaking.totalStaked()).to.be.bignumber.equal(new BN(0));
    });
    it('should fail if trying to withdraw more than deposited', async () => {
      await easyStaking.methods['deposit(uint256)'](ether('10'), { from: user1 });
      await time.increase(YEAR);
      await expectRevert(
        easyStaking.makeForcedWithdrawal(1, ether('10.000000000000000001'), { from: user1 }),
        'SafeMath: subtraction overflow'
      );
      await easyStaking.makeForcedWithdrawal(1, ether('10'), { from: user1 });
    });
  });
  describe('requestWithdrawal', () => {
    it('should request', async () => {
      const value = ether('1000');
      await stakeToken.mint(user1, value, { from: owner });
      await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      await easyStaking.requestWithdrawal(1, { from: user1 });
      const timestamp = await time.latest();
      expect(await easyStaking.withdrawalRequestsDates(user1, 1)).to.be.bignumber.equal(timestamp);
    });
  });
  describe('makeRequestedWithdrawal', () => {
    const value = ether('1000');
    beforeEach(async () => {
      await stakeToken.mint(user1, value, { from: owner });
      await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
    });
    it('should withdraw', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      const timestampBefore = await time.latest();
      await easyStaking.requestWithdrawal(1, { from: user1 });
      await time.increase(withdrawalLockDuration);
      const totalSupply = await stakeToken.totalSupply();
      const totalStaked = await easyStaking.totalStaked();
      const receipt = await easyStaking.makeRequestedWithdrawal(1, 0, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const userAccruedEmission = calculateUserAccruedEmission(value, timePassed, totalSupply, totalStaked);
      expect(await easyStaking.withdrawalRequestsDates(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(userAccruedEmission));
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: value.add(userAccruedEmission),
        id: new BN(1),
        balance: new BN(0),
        accruedEmission: userAccruedEmission,
        lastDepositDuration: timePassed,
      });
    });
    it('should fail if not requested', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      await expectRevert(easyStaking.makeRequestedWithdrawal(1, 0, { from: user1 }), `withdrawal wasn't requested`);
    });
    it('should fail if too early', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      await easyStaking.requestWithdrawal(1, { from: user1 });
      await time.increase(withdrawalLockDuration.sub(new BN(5)));
      await expectRevert(easyStaking.makeRequestedWithdrawal(1, 0, { from: user1 }), 'too early');
    });
    it('should fail if too late', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      await easyStaking.requestWithdrawal(1, { from: user1 });
      await time.increase(withdrawalLockDuration.add(new BN(86400)));
      await expectRevert(easyStaking.makeRequestedWithdrawal(1, 0, { from: user1 }), 'too late');
    });
  });
  describe('setFee', () => {
    it('should set', async () => {
      const newFee = ether('0.1');
      expect(await easyStaking.fee()).to.be.bignumber.equal(fee);
      expect(newFee).to.be.bignumber.not.equal(fee);
      await easyStaking.setFee(newFee, { from: owner });
      expect(await easyStaking.fee()).to.be.bignumber.equal(newFee);
    });
    it('fails if not an owner', async () => {
      await expectRevert(
        easyStaking.setFee(ether('0.1'), { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
    it('fails if greater than 1 ether', async () => {
      await expectRevert(easyStaking.setFee(ether('1.01'), { from: owner }), 'should be less than or equal to 1 ether');
    });
  });
  describe('setWithdrawalLockDuration', () => {
    it('should set', async () => {
      const newWithdrawalLockDuration = new BN(1000);
      expect(await easyStaking.withdrawalLockDuration()).to.be.bignumber.equal(withdrawalLockDuration);
      expect(newWithdrawalLockDuration).to.be.bignumber.not.equal(withdrawalLockDuration);
      await easyStaking.setWithdrawalLockDuration(newWithdrawalLockDuration, { from: owner });
      expect(await easyStaking.withdrawalLockDuration()).to.be.bignumber.equal(newWithdrawalLockDuration);
    });
    it('fails if not an owner', async () => {
      await expectRevert(
        easyStaking.setWithdrawalLockDuration(new BN(1000), { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
  });
  describe('setWithdrawalUnlockDuration', () => {
    it('should set', async () => {
      const newWithdrawalUnlockDuration = new BN(100);
      expect(await easyStaking.withdrawalUnlockDuration()).to.be.bignumber.equal(withdrawalUnlockDuration);
      expect(newWithdrawalUnlockDuration).to.be.bignumber.not.equal(withdrawalUnlockDuration);
      await easyStaking.setWithdrawalUnlockDuration(newWithdrawalUnlockDuration, { from: owner });
      expect(await easyStaking.withdrawalUnlockDuration()).to.be.bignumber.equal(newWithdrawalUnlockDuration);
    });
    it('fails if not an owner', async () => {
      await expectRevert(
        easyStaking.setWithdrawalUnlockDuration(new BN(100), { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
  });
  describe('claimTokens', () => {
    it('should claim tokens', async () => {
      const value = ether('10');
      const anotherToken = await Token.new();
      await anotherToken.initialize('Some token', 'TOKEN', 18, 0, owner, [owner], []);
      await anotherToken.mint(user1, value, { from: owner });
      expect(await anotherToken.balanceOf(user1)).to.be.bignumber.equal(value);
      await anotherToken.transfer(easyStaking.address, value, { from: user1 });
      expect(await anotherToken.balanceOf(easyStaking.address)).to.be.bignumber.equal(value);
      expect(await anotherToken.balanceOf(owner)).to.be.bignumber.equal(new BN(0));
      await easyStaking.claimTokens(anotherToken.address, owner, { from: owner });
      expect(await anotherToken.balanceOf(easyStaking.address)).to.be.bignumber.equal(new BN(0));
      expect(await anotherToken.balanceOf(owner)).to.be.bignumber.equal(value);
    });
    it('should claim STAKE tokens', async () => {
      await stakeToken.mint(easyStaking.address, ether('10'), { from: owner });
      await stakeToken.mint(user1, ether('100'), { from: owner });
      expect(await stakeToken.balanceOf(easyStaking.address)).to.be.bignumber.equal(ether('10'));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(ether('100'));
      await stakeToken.transfer(easyStaking.address, ether('100'), { from: user1 });
      expect(await stakeToken.balanceOf(easyStaking.address)).to.be.bignumber.equal(ether('110'));
      expect(await stakeToken.balanceOf(owner)).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(ether('100'));
      await easyStaking.claimTokens(stakeToken.address, owner, { from: owner });
      expect(await stakeToken.balanceOf(easyStaking.address)).to.be.bignumber.equal(ether('100'));
      expect(await stakeToken.balanceOf(owner)).to.be.bignumber.equal(ether('10'));
      expect(await easyStaking.balances(user1, 1)).to.be.bignumber.equal(ether('100'));
      await expectRevert(easyStaking.claimTokens(stakeToken.address, owner, { from: owner }), 'nothing to claim');
    });
    async function claimEtherAndSend(to) {
      easyStaking = await EasyStakingMock.new();
      await initialize();
      const value = ether('10');
      expect(await balance.current(easyStaking.address)).to.be.bignumber.equal(new BN(0));
      await send.ether(user1, easyStaking.address, value);
      expect(await balance.current(easyStaking.address)).to.be.bignumber.equal(value);
      const balanceBefore = await balance.current(to);
      await easyStaking.claimTokens(constants.ZERO_ADDRESS, to, { from: owner, gasPrice: 0 });
      expect(await balance.current(easyStaking.address)).to.be.bignumber.equal(new BN(0));
      expect(await balance.current(to)).to.be.bignumber.equal(balanceBefore.add(value));
    }
    it('should claim ether', async () => {
      await claimEtherAndSend(owner)
    });
    it('should claim and send ether even if receiver reverts it', async () => {
      const receiver = await ReceiverMock.new();
      await claimEtherAndSend(receiver.address);
    });
    it('fails if not an owner', async () => {
      await expectRevert(
        easyStaking.claimTokens(constants.ZERO_ADDRESS, owner, { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
    it('fails if invalid recipient', async () => {
      await expectRevert(
        easyStaking.claimTokens(constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, { from: owner }),
        'not a valid recipient',
      );
      await expectRevert(
        easyStaking.claimTokens(constants.ZERO_ADDRESS, easyStaking.address, { from: owner }),
        'not a valid recipient',
      );
    });
  });
  describe('getAccruedEmission', () => {
    it('should be calculated correctly', async () => {
      const value = ether('100');
      await stakeToken.mint(user1, value, { from: owner });
      await stakeToken.approve(easyStaking.address, value, { from: user1 });
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await time.advanceBlock();
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const totalSupply = await stakeToken.totalSupply();
      const totalStaked = await easyStaking.totalStaked();
      const depositDate = await easyStaking.depositDates(user1, 1);
      const userAccruedEmission = calculateUserAccruedEmission(value, timePassed, totalSupply, totalStaked);
      expect((await easyStaking.getAccruedEmission(depositDate, value)).userShare).to.be.bignumber.equal(userAccruedEmission);
    });
  });
});
