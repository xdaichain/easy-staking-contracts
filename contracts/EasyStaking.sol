pragma solidity ^0.5.15;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./IStakeToken.sol";

contract EasyStaking is Ownable {
    using Address for address;
    using SafeMath for uint256;

    uint256 constant YEAR = 365 days;

    IStakeToken public token;

    uint256[] intervals;
    uint256[] interestRates;

    mapping (address => uint256) public balances;
    mapping (address => uint256) public depositDates;


    function initialize(
        address _tokenAddress,
        uint256[] memory _intervals,
        uint256[] memory _interestRates
    ) public initializer {
        _setToken(_tokenAddress);
        _setIntervalsAndInterestRates(_intervals, _interestRates);
    }

    function deposit(uint256 _amount) external {
        _mint();
        token.transferFrom(msg.sender, address(this), _amount);
        balances[msg.sender] = balances[msg.sender].add(_amount);
    }

    function withdraw() external {
        require(balances[msg.sender] > 0, "zero balance");
        _mint();
        token.transfer(msg.sender, balances[msg.sender]);
        balances[msg.sender] = 0;
    }

    function withdraw(uint256 _amount) external {
        require(balances[msg.sender] > 0, "zero balance");
        _mint();
        balances[msg.sender] = balances[msg.sender].sub(_amount);
        token.transfer(msg.sender, _amount);
    }

    function setToken(address _tokenAddress) external onlyOwner {
        _setToken(_tokenAddress);
    }

    function setIntervalsAndInterestRates(
        uint256[] calldata _intervals,
        uint256[] calldata _interestRates
    ) external onlyOwner {
        _setIntervalsAndInterestRates(_intervals, _interestRates);
    }

    function getIntervals() external view returns (uint256[] memory) {
        return intervals;
    }

    function getInterestRates() external view returns (uint256[] memory) {
        return interestRates;
    }

    function _mint() internal {
        uint256 timePassed = block.timestamp.sub(depositDates[msg.sender]);
        uint256 currentInterestRate;
        uint256 sumOfIntervals;
        for (uint256 i = 0; i < interestRates.length; i++) {
            currentInterestRate = interestRates[i];
            sumOfIntervals = sumOfIntervals.add(intervals[i]);
            if (timePassed < sumOfIntervals) break;
        }
        uint256 interest = balances[msg.sender].mul(currentInterestRate).div(1 ether).mul(timePassed).div(YEAR);
        token.mint(address(this), interest);
        balances[msg.sender] = balances[msg.sender].add(interest);
        depositDates[msg.sender] = block.timestamp;
    }

    function _setToken(address _tokenAddress) internal {
        require(_tokenAddress.isContract(), "not a contract address");
        token = IStakeToken(_tokenAddress);
    }

    function _setIntervalsAndInterestRates(
        uint256[] memory _intervals,
        uint256[] memory _interestRates
    ) internal {
        require(_intervals.length > 0, "empty array");
        require(_intervals.length == _interestRates.length, "different array sizes");
        intervals = _intervals;
        interestRates = _interestRates;
    }
}
