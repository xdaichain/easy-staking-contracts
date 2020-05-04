const { accounts, contract } = require('@openzeppelin/test-environment');
const { ether, BN, expectRevert, constants, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const EasyStaking = contract.fromArtifact('EasyStaking');
const Token = contract.fromArtifact('@openzeppelin/contracts-ethereum-package/StandaloneERC20');

describe('PoaMania', () => {
  const [owner, user1, user2] = accounts;
  const YEAR = new BN(31536000); // in seconds
  const intervals = [YEAR.div(new BN(4)), YEAR.div(new BN(2)), YEAR];
  const interestRates = [ether('0.05'), ether('0.1'), ether('0.15')]; // 5%, 10% and 15%
  const oneEther = ether('1');

  let easyStaking;
  let stakeToken;

  const initializeMethod = 'initialize(address,address,uint256[],uint256[])';

  function initialize(...params) {
    if (params.length === 0) {
      params = [
        owner,
        stakeToken.address,
        intervals.map(item => item.toString()),
        interestRates.map(item => item.toString()),
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
        ),
        'zero address'
      );
      await expectRevert(
        initialize(
          owner,
          constants.ZERO_ADDRESS,
          intervals.map(item => item.toString()),
          interestRates.map(item => item.toString()),
        ),
        'not a contract address'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          [],
          [],
        ),
        'empty array'
      );
      await expectRevert(
        initialize(
          owner,
          stakeToken.address,
          [...intervals, new BN(600)].map(item => item.toString()),
          interestRates.map(item => item.toString()),
        ),
        'different array sizes'
      );
    });
  });

  describe('deposit', () => {
    beforeEach(async () => {
      await stakeToken.mint(user1, ether('1000'), { from: owner });
      await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
    });
    it('should deposit', async () => {
      const value = ether('100');
      await easyStaking.deposit(value, { from: user1 });
      const timestamp = await time.latest();
      expect(await easyStaking.balances(user1)).to.be.bignumber.equal(value);
      expect(await easyStaking.depositDates(user1)).to.be.bignumber.equal(timestamp);
    });
    it('should earn interest', async () => {
      const value = ether('100');
      await easyStaking.deposit(value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.deposit(0, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.balances(user1)).to.be.bignumber.equal(value.add(interest));
      expect(await easyStaking.depositDates(user1)).to.be.bignumber.equal(timestampAfter);
    });
  });
  describe('withdraw', () => {
    const value = ether('1000');
    beforeEach(async () => {
      await stakeToken.mint(user1, value, { from: owner });
      await stakeToken.approve(easyStaking.address, ether('10000'), { from: user1 });
    });
    it('should withdraw', async () => {
      await easyStaking.setIntervalsAndInterestRates([0], [0], { from: owner });
      await easyStaking.deposit(value, { from: user1 });
      await easyStaking.withdraw(oneEther, { from: user1 });
      const timestamp = await time.latest();
      expect(await easyStaking.balances(user1)).to.be.bignumber.equal(value.sub(oneEther));
      expect(await easyStaking.depositDates(user1)).to.be.bignumber.equal(timestamp);
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther);
      await easyStaking.methods['withdraw()']({ from: user1 });
      expect(await easyStaking.balances(user1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value);
    });
    it('should withdraw with interest', async () => {
      await easyStaking.deposit(value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.methods['withdraw()']({ from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.balances(user1)).to.be.bignumber.equal(new BN(0));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(value.add(interest));
    });
    it('should withdraw part and earn interest', async () => {
      await easyStaking.deposit(value, { from: user1 });
      const timestampBefore = await time.latest();
      await time.increase(YEAR.div(new BN(8)));
      await easyStaking.withdraw(oneEther, { from: user1 });
      const timestampAfter = await time.latest();
      const timePassed = timestampAfter.sub(timestampBefore);
      const interest = value.mul(interestRates[0]).div(oneEther).mul(timePassed).div(YEAR);
      expect(await easyStaking.balances(user1)).to.be.bignumber.equal(value.sub(oneEther).add(interest));
      expect(await stakeToken.balanceOf(user1)).to.be.bignumber.equal(oneEther);
    });
  });
});
