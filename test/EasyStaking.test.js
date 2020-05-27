const { ether, BN, expectRevert, expectEvent, constants, time, balance, send } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const EasyStaking = artifacts.require('EasyStaking');
const EasyStakingMock = artifacts.require('EasyStakingMock');
const ReceiverMock = artifacts.require('ReceiverMock');
const Token = artifacts.require('ERC677Mock');

contract('PoaMania', accounts => {
  const [owner, user1, user2] = accounts;
  const YEAR = new BN(31536000); // in seconds
  const intervals = [YEAR.div(new BN(4)), YEAR.div(new BN(2)), YEAR];
  const interestRates = [ether('0.05'), ether('0.08'), ether('0.1'), ether('0.15')]; // 5%, 8%, 10% and 15%
  const fee = ether('0.03'); // 3%
  const withdrawalLockDuration = new BN(600); // in seconds
  const withdrawalUnlockDuration = new BN(60); // in seconds
  const oneEther = ether('1');

  let easyStaking;
  let stakeToken;

  const initializeMethod = 'initialize(address,address,uint256[],uint256[],uint256,uint256,uint256)';

  function initialize(...params) {
    if (params.length === 0) {
      params = [
        owner,
        stakeToken.address,
        intervals.map(item => item.toString()),
        interestRates.map(item => item.toString()),
        fee.toString(),
        withdrawalLockDuration.toString(),
        withdrawalUnlockDuration.toString(),
      ];
    }
    return easyStaking.methods[initializeMethod](...params, { from: owner });
  }

  beforeEach(async () => {
    stakeToken = await Token.new();
    easyStaking = await EasyStaking.new();
    await initialize();
    await stakeToken.initialize('Stake', 'STAKE', 18, 0, owner, [owner, easyStaking.address], []);
  });

  describe('initialize', () => {
    it('should be set up correctly', async () => {
      expect(await easyStaking.token()).to.equal(stakeToken.address);
      (await easyStaking.getIntervals()).forEach((interval, index) => {
        expect(interval).to.be.bignumber.equal(intervals[index]);
      });
      (await easyStaking.getInterestRates()).forEach((interestRate, index) => {
        expect(interestRate).to.be.bignumber.equal(interestRates[index]);
      });
    });
    it('fails if any of parameters is incorrect', async () => {
      easyStaking = await EasyStaking.new();
      await expectRevert(
        initialize(
          constants.ZERO_ADDRESS,
          stakeToken.address,
          intervals.map(item => item.toString()),
          interestRates.map(item => item.toString()),
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
        ),
        'zero address'
      );
      await expectRevert(
        initialize(
          owner,
          constants.ZERO_ADDRESS,
          intervals.map(item => item.toString()),
          interestRates.map(item => item.toString()),
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
        ),
        'not a contract address'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          [...intervals, new BN(600)].map(item => item.toString()),
          interestRates.map(item => item.toString()),
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
        ),
        'wrong array sizes'
      );
    });
  });
  function testDeposit(directly) {
    beforeEach(async () => {
      await stakeToken.mint(user1, ether('1000'), { from: owner });
      if (directly) {
        await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
      }
    });
    it('should deposit', async () => {
      const value = ether('100');
      if (directly) {
        const receipt = await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
        expectEvent(receipt, 'Deposited', {
          sender: user1,
          amount: value,
          customId: '',
          balance: value,
          lastStakingPeriod: new BN(0),
        });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      const timestamp = await time.latest();
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(value);
      expect(await easyStaking.methods['getDepositDate(address)'](user1)).to.be.bignumber.equal(timestamp);
      expect(await easyStaking.numberOfParticipants()).to.be.bignumber.equal(new BN(1));
    });
    it('should earn interest', async () => {
      const value = ether('100');
      if (directly) {
        await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      let receipt;
      if (directly) {
        receipt = await easyStaking.methods['deposit(uint256)'](0, { from: user1 });
      } else {
        await stakeToken.transfer(easyStaking.address, 0, { from: user1 });
      }
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      if (directly) {
        expectEvent(receipt, 'Deposited', {
          sender: user1,
          amount: new BN(0),
          customId: '',
          balance: value.add(interest),
          lastStakingPeriod: new BN(timePassed),
        });
      }
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(value.add(interest));
      expect(await easyStaking.methods['getDepositDate(address)'](user1)).to.be.bignumber.equal(timestampAfter);
      expect(await easyStaking.getTotalStakedAmount()).to.be.bignumber.equal(value.add(interest));
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
      await easyStaking.setIntervalsAndInterestRates([], [0], { from: owner });
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      let timestampBefore = await time.latest();
      expect(await easyStaking.getTotalStakedAmount()).to.be.bignumber.equal(value);
      let receipt = await easyStaking.methods['makeForcedWithdrawal(uint256)'](oneEther, { from: user1 });
      let timestampAfter = await time.latest();
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(value.sub(oneEther));
      expect(await easyStaking.methods['getDepositDate(address)'](user1)).to.be.bignumber.equal(timestampAfter);
      expect(await easyStaking.getTotalStakedAmount()).to.be.bignumber.equal(value.sub(oneEther));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther);
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: oneEther,
        customId: '',
        balance: value.sub(oneEther),
        lastStakingPeriod: timestampAfter.sub(timestampBefore),
      });
      timestampAfter = timestampBefore;
      receipt = await easyStaking.methods['makeForcedWithdrawal(uint256)'](0, { from: user1 });
      timestampAfter = await time.latest();
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value);
      expect(await easyStaking.getTotalStakedAmount()).to.be.bignumber.equal(new BN(0));
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: value.sub(oneEther),
        customId: '',
        balance: new BN(0),
        lastStakingPeriod: timestampAfter.sub(timestampBefore),
      });
    });
    it('should withdraw with interest', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.methods['makeForcedWithdrawal(uint256)'](0, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(interest));
    });
    it('should withdraw part and earn interest', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.methods['makeForcedWithdrawal(uint256)'](oneEther, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(value.sub(oneEther).add(interest));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther);
    });
    it('should earn interest for different users from 1 address', async () => {
      const exchange = user1;
      const users = ['ben', 'sarah', 'steve'];
      const values = [ether('100'), ether('250'), ether('600')];
      for (let i = 0; i < users.length; i++) {
        await easyStaking.methods['deposit(uint256,string)'](values[i], users[i], { from: exchange });
        expect(await easyStaking.methods['getBalance(address,string)'](exchange, users[i])).to.be.bignumber.equal(values[i]);
        expect(await easyStaking.numberOfParticipants()).to.be.bignumber.equal(new BN(i + 1));
      }
      expect(await easyStaking.numberOfParticipants()).to.be.bignumber.equal(new BN(users.length));
      expect(await easyStaking.getTotalStakedAmount()).to.be.bignumber.equal(values.reduce((acc, cur) => acc.add(cur), new BN(0)));
      let exchangeBalance = await stakeToken.balanceOf(exchange);
      await time.increase(intervals[0].div(new BN(2)));
      for (let i = 0; i < users.length; i++) {
        const timestampBefore = await easyStaking.methods['getDepositDate(address,string)'](exchange, users[i]);
        await easyStaking.methods['makeForcedWithdrawal(uint256,string)'](0, users[i], { from: user1 });
        const timestampAfter = await time.latest();
        const timePassed = timestampAfter.sub(timestampBefore);
        const interest = values[i].mul(interestRates[i]).div(oneEther).mul(timePassed).div(YEAR);
        const expectedExchangeBalance = exchangeBalance.add(values[i]).add(interest);
        expect(interest).to.be.bignumber.gt(new BN(0));
        expect(await easyStaking.methods['getBalance(address,string)'](exchange, users[i])).to.be.bignumber.equal(new BN(0));
        expect(await stakeToken.balanceOf(exchange)).to.be.bignumber.equal(expectedExchangeBalance);
        exchangeBalance = expectedExchangeBalance;
        await time.increase(intervals[i]);
        expect(await easyStaking.numberOfParticipants()).to.be.bignumber.equal(new BN(users.length - (i + 1)));
      }
      expect(await easyStaking.getTotalStakedAmount()).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.numberOfParticipants()).to.be.bignumber.equal(new BN(0));
    });
  });
  describe('requestWithdrawal', () => {
    it('should request', async () => {
      await easyStaking.methods['requestWithdrawal()']({ from: user1 });
      const timestamp = await time.latest();
      expect(await easyStaking.methods['getWithdrawalRequestDate(address)'](user1)).to.be.bignumber.equal(timestamp);
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
      await easyStaking.methods['requestWithdrawal()']({ from: user1 });
      await time.increase(withdrawalLockDuration);
      const receipt = await easyStaking.methods['makeRequestedWithdrawal(uint256)'](0, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.methods['getWithdrawalRequestDate(address)'](user1)).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.methods['getBalance(address)'](user1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(interest));
      expectEvent(receipt, 'Withdrawn', {
        sender: user1,
        amount: value.add(interest),
        customId: '',
        balance: new BN(0),
        lastStakingPeriod: timePassed,
      });
    });
    it('should fail if not requested', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      await expectRevert(easyStaking.methods['makeRequestedWithdrawal(uint256)'](0, { from: user1 }), `withdrawal wasn't requested`);
    });
    it('should fail if too early', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      await easyStaking.methods['requestWithdrawal()']({ from: user1 });
      await time.increase(withdrawalLockDuration.sub(new BN(5)));
      await expectRevert(easyStaking.methods['makeRequestedWithdrawal(uint256)'](0, { from: user1 }), 'too early');
    });
    it('should fail if too late', async () => {
      await easyStaking.methods['deposit(uint256)'](value, { from: user1 });
      await easyStaking.methods['requestWithdrawal()']({ from: user1 });
      await time.increase(withdrawalLockDuration.add(new BN(86400)));
      await expectRevert(easyStaking.methods['makeRequestedWithdrawal(uint256)'](0, { from: user1 }), 'too late');
    });
  });
  describe('setToken', () => {
    it('should set', async () => {
      expect(await easyStaking.token()).to.be.equal(stakeToken.address)
      const newStakeToken = await Token.new();
      await easyStaking.setToken(newStakeToken.address, { from: owner });
      expect(newStakeToken.address).to.be.not.equal(stakeToken.address);
      expect(await easyStaking.token()).to.be.equal(newStakeToken.address);
    });
    it('fails if not an owner', async () => {
      const newStakeToken = await Token.new();
      await expectRevert(
        easyStaking.setToken(newStakeToken.address, { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
    it('fails if not a contract address', async () => {
      await expectRevert(easyStaking.setToken(user1, { from: owner }), 'not a contract address');
      await expectRevert(easyStaking.setToken(constants.ZERO_ADDRESS, { from: owner }), 'not a contract address');
    });
  });
  describe('setIntervalsAndInterestRates', () => {
    it('should set', async () => {
      (await easyStaking.getIntervals()).forEach((interval, index) => {
        expect(interval).to.be.bignumber.equal(intervals[index]);
      });
      (await easyStaking.getInterestRates()).forEach((interestRate, index) => {
        expect(interestRate).to.be.bignumber.equal(interestRates[index]);
      });
      const newIntervals = [YEAR.div(new BN(2)), YEAR, YEAR.mul(new BN(2))];
      const newInterestRates = [ether('0.15'), ether('0.3'), ether('0.6'), ether('0.9')];
      await easyStaking.setIntervalsAndInterestRates(newIntervals, newInterestRates, { from: owner });
      (await easyStaking.getIntervals()).forEach((interval, index) => {
        expect(interval).to.be.bignumber.equal(newIntervals[index]);
      });
      (await easyStaking.getInterestRates()).forEach((interestRate, index) => {
        expect(interestRate).to.be.bignumber.equal(newInterestRates[index]);
      });
    });
    it('fails if not an owner', async () => {
      const newIntervals = [YEAR.div(new BN(2)), YEAR, YEAR.mul(new BN(2))];
      const newInterestRates = [ether('0.3'), ether('0.6'), ether('0.9')];
      await expectRevert(
        easyStaking.setIntervalsAndInterestRates(newIntervals, newInterestRates, { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
    it('fails if arrays have wrong sizes', async () => {
      await expectRevert(
        easyStaking.setIntervalsAndInterestRates([], [], { from: owner }),
        'wrong array sizes',
      );
      await expectRevert(
        easyStaking.setIntervalsAndInterestRates([YEAR], [], { from: owner }),
        'wrong array sizes',
      );
      await expectRevert(
        easyStaking.setIntervalsAndInterestRates([YEAR], [ether('0.6')], { from: owner }),
        'wrong array sizes',
      );
      await easyStaking.setIntervalsAndInterestRates([], [ether('0.6')], { from: owner });
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
    it('fails if wrong token address', async () => {
      await expectRevert(
        easyStaking.claimTokens(stakeToken.address, owner, { from: owner }),
        'cannot be the main token',
      );
    });
  });
  describe('getCurrentEarnedInterest', () => {
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
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.getCurrentEarnedInterest(user1)).to.be.bignumber.equal(interest);
    });
  });
});
