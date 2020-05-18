pragma solidity ^0.5.15;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./IERC20Mintable.sol";
import "./Sacrifice.sol";

contract EasyStaking is Ownable {
    using Address for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 constant YEAR = 365 days;
    address constant BURN_ADDRESS = 0x0000000000000000000000000000000000000001;

    IERC20Mintable public token;

    uint256[] intervals;
    uint256[] interestRates;
    uint256 fee; // in percentage, represented as fixed point numbers with 18 decimals like in Ether
    uint256 withdrawalLockDuration; // in seconds

    mapping (bytes32 => uint256) balances;
    mapping (bytes32 => uint256) depositDates;
    mapping (bytes32 => uint256) withdrawalRequestsDates;

    bool locked;

    function initialize(
        address _owner,
        address _tokenAddress,
        uint256[] memory _intervals,
        uint256[] memory _interestRates,
        uint256 _fee,
        uint256 _withdrawalLockDuration
    ) public initializer {
        require(_owner != address(0), "zero address");
        Ownable.initialize(_owner);
        _setToken(_tokenAddress);
        _setIntervalsAndInterestRates(_intervals, _interestRates);
        _setFee(_fee);
        _setWithdrawalLockDuration(_withdrawalLockDuration);
    }

    function deposit(uint256 _amount, string calldata _customId) external {
        _deposit(msg.sender, _amount, _customId);
        _setLocked(true);
        token.transferFrom(msg.sender, address(this), _amount);
        _setLocked(false);
    }

    function onTokenTransfer(address _sender, uint256 _amount, bytes calldata) external {
        require(msg.sender == address(token), "only token contract is allowed");
        if (!locked) {
            _deposit(_sender, _amount, "");
        }
    }

    function _deposit(address _sender, uint256 _amount, string memory _customId) internal {
        bytes32 userHash = _getUserHash(_sender, _customId);
        _mint(userHash);
        balances[userHash] = balances[userHash].add(_amount);
    }

    function makeForcedWithdrawal(uint256 _amount, string calldata _customId) external {
        _withdraw(msg.sender, _amount, _customId, true);
    }

    function requestWithdrawal(string calldata _customId) external {
        bytes32 userHash = _getUserHash(msg.sender, _customId);
        // solium-disable-next-line security/no-block-members
        withdrawalRequestsDates[userHash] = block.timestamp;
    }

    function executeWithdrawal(uint256 _amount, string calldata _customId) external {
        bytes32 userHash = _getUserHash(msg.sender, _customId);
        uint256 requestDate = withdrawalRequestsDates[userHash];
        require(requestDate > 0, "withdrawal wasn't requested");
        // solium-disable-next-line security/no-block-members
        uint256 timestamp = block.timestamp;
        uint256 lockEnd = requestDate.add(withdrawalLockDuration);
        require(timestamp >= lockEnd, "too early");
        require(timestamp < lockEnd.add(1 days), "too late");
        _withdraw(msg.sender, _amount, _customId, false);
        withdrawalRequestsDates[userHash] = 0;
    }

    function _withdraw(address _sender, uint256 _amount, string memory _customId, bool _forced) internal {
        bytes32 userHash = _getUserHash(_sender, _customId);
        require(balances[userHash] > 0, "zero balance");
        _mint(userHash);
        uint256 amount = _amount;
        if (amount == 0) {
            amount = balances[userHash];
        }
        balances[userHash] = balances[userHash].sub(amount);
        if (_forced) {
            uint256 feeValue = amount.mul(fee).div(1 ether);
            amount = amount.sub(feeValue);
            token.transfer(BURN_ADDRESS, feeValue);
        }
        token.transfer(_sender, amount);
    }

    function claimTokens(address _token, address payable _to) public onlyOwner {
        require(_to != address(0) && _to != address(this), "not a valid recipient");
        if (_token == address(0)) {
            uint256 value = address(this).balance;
            if (!_to.send(value)) { // solium-disable-line security/no-send
                (new Sacrifice).value(value)(_to);
            }
        } else {
            IERC20 customToken = IERC20(_token);
            uint256 balance = customToken.balanceOf(address(this));
            customToken.safeTransfer(_to, balance);
        }
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

    function setFee(uint256 _fee) external onlyOwner {
        _setFee(_fee);
    }

    function setWithdrawalLockDuration(uint256 _withdrawalLockDuration) internal {
        _setWithdrawalLockDuration(_withdrawalLockDuration);
    }

    function getBalance(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return balances[userHash];
    }

    function getDepositDate(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return depositDates[userHash];
    }

    function getWithdrawalRequestDate(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return withdrawalRequestsDates[userHash];
    }

    function getIntervals() external view returns (uint256[] memory) {
        return intervals;
    }

    function getInterestRates() external view returns (uint256[] memory) {
        return interestRates;
    }

    function _mint(bytes32 _user) internal {
        // solium-disable-next-line security/no-block-members
        uint256 timePassed = block.timestamp.sub(depositDates[_user]);
        uint256 currentInterestRate;
        uint256 sumOfIntervals;
        for (uint256 i = 0; i < interestRates.length; i++) {
            currentInterestRate = interestRates[i];
            sumOfIntervals = sumOfIntervals.add(intervals[i]);
            if (timePassed < sumOfIntervals) break;
        }
        uint256 interest = balances[_user].mul(currentInterestRate).div(1 ether).mul(timePassed).div(YEAR);
        token.mint(address(this), interest);
        balances[_user] = balances[_user].add(interest);
        // solium-disable-next-line security/no-block-members
        depositDates[_user] = block.timestamp;
    }

    function _setToken(address _tokenAddress) internal {
        require(_tokenAddress.isContract(), "not a contract address");
        token = IERC20Mintable(_tokenAddress);
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

    function _setFee(uint256 _fee) internal {
        require(_fee <= 1 ether, "should be less than or equal to 1 ether");
        fee = _fee;
    }

    function _setWithdrawalLockDuration(uint256 _withdrawalLockDuration) internal {
        withdrawalLockDuration = _withdrawalLockDuration;
    }

    function _setLocked(bool _locked) internal {
        locked = _locked;
    }

    function _getUserHash(address _sender, string memory _customId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(_sender, _customId));
    }
}
