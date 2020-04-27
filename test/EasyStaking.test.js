const { accounts, contract } = require('@openzeppelin/test-environment');
const { ether, BN } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const EasyStaking = contract.fromArtifact('EasyStaking');
const Token = contract.fromArtifact('@openzeppelin/contracts-ethereum-package/StandaloneERC20');

describe('PoaMania', () => {
  const [owner, user1, user2] = accounts;
  const intervals = [new BN(600), new BN(600), new BN(600)];          // in seconds
  const interestRates = [ether('0.05'), ether('0.1'), ether('0.15')]; // 5%, 10% and 15%

  let easyStaking;
  let stakeToken;

  const initializeMethod = 'initialize(address,uint256[],uint256[])';

  function initialize(...params) {
    if (params.length === 0) {
      params = [
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
  });
});
