const { accounts, contract } = require('@openzeppelin/test-environment');
const { ether, BN, expectRevert, expectEvent, constants, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const EasyStaking = contract.fromArtifact('EasyStaking');
const Token = contract.fromArtifact('ERC677Mock');

describe('PoaMania', () => {
  const [owner, user1, user2] = accounts;
  const YEAR = new BN(31536000); // in seconds
  const intervals = [YEAR.div(new BN(4)), YEAR.div(new BN(2)), YEAR];
  const interestRates = [ether('0.05'), ether('0.1'), ether('0.15')]; // 5%, 10% and 15%
  const fee = ether('0.03'); // 3%
  const withdrawalLockDuration = new BN(600); // in seconds
  const oneEther = ether('1');

  let easyStaking;
  let stakeToken;

  const initializeMethod = 'initialize(address,address,uint256[],uint256[],uint256,uint256)';

  function initialize(...params) {
    if (params.length === 0) {
      params = [
        owner,
        stakeToken.address,
        intervals.map(item => item.toString()),
        interestRates.map(item => item.toString()),
        fee.toString(),
        withdrawalLockDuration.toString(),
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
        ),
        'not a contract address'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          [],
          [],
          fee.toString(),
          withdrawalLockDuration.toString(),
        ),
        'empty array'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          [...intervals, new BN(600)].map(item => item.toString()),
          interestRates.map(item => item.toString()),
          fee.toString(),
          withdrawalLockDuration.toString(),
        ),
        'different array sizes'
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
        const receipt = await easyStaking.deposit(value, '', { from: user1 });
        expectEvent(receipt, 'Deposited', { sender: user1, amount: value, customId: '' });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      const timestamp = await time.latest();
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(value);
      expect(await easyStaking.getDepositDate(user1, '')).to.be.bignumber.equal(timestamp);
    });
    it('should earn interest', async () => {
      const value = ether('100');
      if (directly) {
        await easyStaking.deposit(value, '', { from: user1 });
      } else {
        await stakeToken.transfer(easyStaking.address, value, { from: user1 });
      }
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      if (directly) {
        await easyStaking.deposit(0, '', { from: user1 });
      } else {
        await stakeToken.transfer(easyStaking.address, 0, { from: user1 });
      }
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(value.add(interest));
      expect(await easyStaking.getDepositDate(user1, '')).to.be.bignumber.equal(timestampAfter);
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
      await easyStaking.setIntervalsAndInterestRates([0], [0], { from: owner });
      await easyStaking.deposit(value, '', { from: user1 });
      let receipt = await easyStaking.makeForcedWithdrawal(oneEther, '', { from: user1 });
      const timestamp = await time.latest();
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(value.sub(oneEther));
      expect(await easyStaking.getDepositDate(user1, '')).to.be.bignumber.equal(timestamp);
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther);
      expectEvent(receipt, 'Withdrawn', { sender: user1, amount: oneEther, customId: '' });
      receipt = await easyStaking.makeForcedWithdrawal(0, '', { from: user1 });
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value);
      expectEvent(receipt, 'Withdrawn', { sender: user1, amount: value.sub(oneEther), customId: '' });
    });
    it('should withdraw with interest', async () => {
      await easyStaking.deposit(value, '', { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.makeForcedWithdrawal(0, '', { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(interest));
    });
    it('should withdraw part and earn interest', async () => {
      await easyStaking.deposit(value, '', { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.makeForcedWithdrawal(oneEther, '', { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(value.sub(oneEther).add(interest));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther);
    });
    it('should earn interest for different users from 1 address', async () => {
      const exchange = user1;
      const users = ['ben', 'sarah', 'steve'];
      const values = [ether('100'), ether('250'), ether('600')];
      await Promise.all(users.map(async (user, index) => {
        await easyStaking.deposit(values[index], user, { from: exchange });
        expect(await easyStaking.getBalance(exchange, user)).to.be.bignumber.equal(values[index]);
      }));
      let exchangeBalance = await stakeToken.balanceOf(exchange);
      await time.increase(intervals[0].div(new BN(2)));
      for (let i = 0; i < users.length; i++) {
        const timestampBefore = await easyStaking.getDepositDate(exchange, users[i]);
        await easyStaking.makeForcedWithdrawal(0, users[i], { from: user1 });
        const timestampAfter = await time.latest();
        const timePassed = timestampAfter.sub(timestampBefore);
        const interest = values[i].mul(interestRates[i]).div(oneEther).mul(timePassed).div(YEAR);
        const expectedExchangeBalance = exchangeBalance.add(values[i]).add(interest);
        expect(interest).to.be.bignumber.gt(new BN(0));
        expect(await easyStaking.getBalance(exchange, users[i])).to.be.bignumber.equal(new BN(0));
        expect(await stakeToken.balanceOf(exchange)).to.be.bignumber.equal(expectedExchangeBalance);
        exchangeBalance = expectedExchangeBalance;
        await time.increase(intervals[i]);
      }
    });
  });
  describe('requestWithdrawal', () => {
    it('should request', async () => {
      await easyStaking.requestWithdrawal('', { from: user1 });
      const timestamp = await time.latest();
      expect(await easyStaking.getWithdrawalRequestDate(user1, '')).to.be.bignumber.equal(timestamp);
    });
  });
  describe('executeWithdrawal', () => {
    const value = ether('1000');
    beforeEach(async () => {
      await stakeToken.mint(user1, value, { from: owner });
      await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
    });
    it('should withdraw', async () => {
      await easyStaking.deposit(value, '', { from: user1 });
      const timestampBefore = await time.latest();
      await easyStaking.requestWithdrawal('', { from: user1 });
      await time.increase(withdrawalLockDuration);
      const receipt = await easyStaking.executeWithdrawal(0, '', { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.getWithdrawalRequestDate(user1, '')).to.be.bignumber.equal(new BN(0));
      expect(await easyStaking.getBalance(user1, '')).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(interest));
      expectEvent(receipt, 'Withdrawn', { sender: user1, amount: value.add(interest), customId: '' });
    });
    it('should fail if not requested', async () => {
      await easyStaking.deposit(value, '', { from: user1 });
      await expectRevert(easyStaking.executeWithdrawal(0, '', { from: user1 }), `withdrawal wasn't requested`);
    });
    it('should fail if too early', async () => {
      await easyStaking.deposit(value, '', { from: user1 });
      await easyStaking.requestWithdrawal('', { from: user1 });
      await time.increase(withdrawalLockDuration.sub(new BN(5)));
      await expectRevert(easyStaking.executeWithdrawal(0, '', { from: user1 }), 'too early');
    });
    it('should fail if too late', async () => {
      await easyStaking.deposit(value, '', { from: user1 });
      await easyStaking.requestWithdrawal('', { from: user1 });
      await time.increase(withdrawalLockDuration.add(new BN(86400)));
      await expectRevert(easyStaking.executeWithdrawal(0, '', { from: user1 }), 'too late');
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
      expectRevert(
        easyStaking.setToken(newStakeToken.address, { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
    it('fails if not a contract address', async () => {
      expectRevert(easyStaking.setToken(user1, { from: owner }), 'not a contract address');
      expectRevert(easyStaking.setToken(constants.ZERO_ADDRESS, { from: owner }), 'not a contract address');
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
      const newInterestRates = [ether('0.3'), ether('0.6'), ether('0.9')];
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
      expectRevert(
        easyStaking.setIntervalsAndInterestRates(newIntervals, newInterestRates, { from: user1 }),
        'Ownable: caller is not the owner',
      );
    });
    it('fails if arrays are empty or not the same size', async () => {
      expectRevert(
        easyStaking.setIntervalsAndInterestRates([], [], { from: owner }),
        'empty array',
      );
      expectRevert(
        easyStaking.setIntervalsAndInterestRates([], [ether('0.05')], { from: owner }),
        'empty array',
      );
      expectRevert(
        easyStaking.setIntervalsAndInterestRates([YEAR], [], { from: owner }),
        'different array sizes',
      );
      expectRevert(
        easyStaking.setIntervalsAndInterestRates([YEAR, YEAR], [], { from: owner }),
        'different array sizes',
      );
    });
  });
});
