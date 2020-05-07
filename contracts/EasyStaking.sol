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

    IERC20Mintable public token;

    uint256[] intervals;
    uint256[] interestRates;

    mapping (address => uint256) public balances;
    mapping (address => uint256) public depositDates;

    bool locked;

    function initialize(
        address _owner,
        address _tokenAddress,
        uint256[] memory _intervals,
        uint256[] memory _interestRates
    ) public initializer {
        require(_owner != address(0), "zero address");
        Ownable.initialize(_owner);
        _setToken(_tokenAddress);
        _setIntervalsAndInterestRates(_intervals, _interestRates);
    }

    function deposit(uint256 _amount) external {
        _deposit(msg.sender, _amount);
        _setLocked(true);
        token.transferFrom(msg.sender, address(this), _amount);
        _setLocked(false);
    }

    function onTokenTransfer(address _sender, uint256 _amount, bytes calldata) external {
        require(msg.sender == address(token), "only token contract is allowed");
        if (!locked) {
            _deposit(_sender, _amount);
        }
    }

    function _deposit(address _sender, uint256 _amount) internal {
        _mint(_sender);
        balances[_sender] = balances[_sender].add(_amount);
    }

    function withdraw() public {
        withdraw(0);
    }

    function withdraw(uint256 _amount) public {
        require(balances[msg.sender] > 0, "zero balance");
        _mint(msg.sender);
        uint256 amount = _amount;
        if (amount == 0) {
            amount = balances[msg.sender];
        }
        balances[msg.sender] = balances[msg.sender].sub(amount);
        token.transfer(msg.sender, amount);
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

    function getIntervals() external view returns (uint256[] memory) {
        return intervals;
    }

    function getInterestRates() external view returns (uint256[] memory) {
        return interestRates;
    }

    function _mint(address _sender) internal {
        // solium-disable-next-line security/no-block-members
        uint256 timePassed = block.timestamp.sub(depositDates[_sender]);
        uint256 currentInterestRate;
        uint256 sumOfIntervals;
        for (uint256 i = 0; i < interestRates.length; i++) {
            currentInterestRate = interestRates[i];
            sumOfIntervals = sumOfIntervals.add(intervals[i]);
            if (timePassed < sumOfIntervals) break;
        }
        uint256 interest = balances[_sender].mul(currentInterestRate).div(1 ether).mul(timePassed).div(YEAR);
        token.mint(address(this), interest);
        balances[_sender] = balances[_sender].add(interest);
        // solium-disable-next-line security/no-block-members
        depositDates[_sender] = block.timestamp;
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

    function _setLocked(bool _locked) internal {
        locked = _locked;
    }
}
