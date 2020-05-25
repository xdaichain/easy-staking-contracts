pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./IERC20Mintable.sol";
import "./Sacrifice.sol";

/**
 * @title EasyStaking
 *
 * Note: all percentage values are between 0 and 1
 * and represented as fixed point numbers with 18 decimals like in Ether
 * 100% == 1 ether
 */
contract EasyStaking is Ownable {
    using Address for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /**
     * @dev Emitted when a user deposits tokens
     * @param sender User address
     * @param amount The amount of deposited tokens
     * @param customId Custom identifier (for exchanges)
     */
    event Deposited(address indexed sender, uint256 amount, string customId);

    /**
     * @dev Emitted when a user withdraws tokens
     * @param sender User address
     * @param amount The amount of deposited tokens
     * @param customId Custom identifier (for exchanges)
     */
    event Withdrawn(address indexed sender, uint256 amount, string customId);

    uint256 constant YEAR = 365 days;
    address constant BURN_ADDRESS = 0x0000000000000000000000000000000000000001;

    // STAKE token
    IERC20Mintable public token;

    // The array of staking intervals
    uint256[] intervals;
    // The array of interest rates for each staking interval
    uint256[] interestRates;
    // The fee of the forced withdrawal (in percentage)
    uint256 public fee;
    // The time from the request after which the withdrawal will be available (in seconds)
    uint256 public withdrawalLockDuration;
    // The time during which the withdrawal will be available from the moment of unlocking (in seconds)
    uint256 public withdrawalUnlockDuration;

    // The deposit balances of users
    mapping (bytes32 => uint256) balances;
    // The dates of users' deposits
    mapping (bytes32 => uint256) depositDates;
    // The dates of users' withdrawal requests
    mapping (bytes32 => uint256) withdrawalRequestsDates;

    // Variable that prevents reentrance
    bool locked;

    /**
     * @dev Initializes the contract
     * @param _owner The owner of the contract
     * @param _tokenAddress The address of the STAKE token contract
     * @param _intervals The array of staking intervals
     * @param _interestRates The array of interest rates for each staking interval
     * @param _fee The fee of the forced withdrawal (in percentage)
     * @param _withdrawalLockDuration The time from the request after which the withdrawal will be available (in seconds)
     * @param _withdrawalUnlockDuration The time during which the withdrawal will be available from the moment of unlocking (in seconds)
     */
    function initialize(
        address _owner,
        address _tokenAddress,
        uint256[] memory _intervals,
        uint256[] memory _interestRates,
        uint256 _fee,
        uint256 _withdrawalLockDuration,
        uint256 _withdrawalUnlockDuration
    ) public initializer {
        require(_owner != address(0), "zero address");
        Ownable.initialize(_owner);
        _setToken(_tokenAddress);
        _setIntervalsAndInterestRates(_intervals, _interestRates);
        _setFee(_fee);
        _setWithdrawalLockDuration(_withdrawalLockDuration);
        _setWithdrawalUnlockDuration(_withdrawalUnlockDuration);
    }

    /**
     * @dev This method is used to deposit tokens.
     * It calls the internal "_deposit" method and transfer tokens from user to contract
     * @param _amount The amount to deposit
     * @param _customId Custom identifier (for exchanges)
     */
    function deposit(uint256 _amount, string calldata _customId) external {
        _deposit(msg.sender, _amount, _customId);
        _setLocked(true);
        token.transferFrom(msg.sender, address(this), _amount);
        _setLocked(false);
    }

    /**
     * @dev This method is called when tokens are transferred to this contract
     * using "transfer" method of STAKE token contract. It calls the internal "_deposit" method
     * @param _sender The sender of tokens
     * @param _amount The transferred amount
     */
    function onTokenTransfer(address _sender, uint256 _amount, bytes calldata) external {
        require(msg.sender == address(token), "only token contract is allowed");
        if (!locked) {
            _deposit(_sender, _amount, "");
        }
    }

    /**
     * @dev This method is used to make a forced withdrawal with fee.
     * It calls the internal "_withdraw" method
     * @param _amount The amount to withdraw (0 - to withdraw all)
     * @param _customId Custom identifier (for exchanges)
     */
    function makeForcedWithdrawal(uint256 _amount, string calldata _customId) external {
        _withdraw(msg.sender, _amount, _customId, true);
    }

    /**
     * @dev This method is used to request a withdrawal without fee.
     * It sets the date of the request
     * @param _customId Custom identifier (for exchanges)
     */
    function requestWithdrawal(string calldata _customId) external {
        bytes32 userHash = _getUserHash(msg.sender, _customId);
        // solium-disable-next-line security/no-block-members
        withdrawalRequestsDates[userHash] = block.timestamp;
    }

    /**
     * @dev This method is used to make a requested withdrawal.
     * It calls the internal "_withdraw" method and resets the date of the request
     * @param _amount The amount to withdraw (0 - to withdraw all)
     * @param _customId Custom identifier (for exchanges)
     */
    function makeRequestedWithdrawal(uint256 _amount, string calldata _customId) external {
        bytes32 userHash = _getUserHash(msg.sender, _customId);
        uint256 requestDate = withdrawalRequestsDates[userHash];
        require(requestDate > 0, "withdrawal wasn't requested");
        // solium-disable-next-line security/no-block-members
        uint256 timestamp = block.timestamp;
        uint256 lockEnd = requestDate.add(withdrawalLockDuration);
        require(timestamp >= lockEnd, "too early");
        require(timestamp < lockEnd.add(withdrawalUnlockDuration), "too late");
        withdrawalRequestsDates[userHash] = 0;
        _withdraw(msg.sender, _amount, _customId, false);
    }

    /**
     * @dev This method is used to claim unsupported tokens accidentally sent to the contract.
     * It can be called only by owner
     * @param _token The address of the token contract (zero address for native tokens)
     * @param _to The address of the tokens receiver
     */
    function claimTokens(address _token, address payable _to) public onlyOwner {
        require(_token != address(token), "cannot be the main token");
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

    /**
     * @dev Sets the staking token address. Can be called only by owner
     * @param _tokenAddress The new address of the token
     */
    function setToken(address _tokenAddress) external onlyOwner {
        _setToken(_tokenAddress);
    }

    /**
     * @dev Sets staking intervals and interest rates. Can be called only by owner
     * @param _intervals The array of staking intervals
     * @param _interestRates The array of interest rates for each staking interval
     */
    function setIntervalsAndInterestRates(
        uint256[] calldata _intervals,
        uint256[] calldata _interestRates
    ) external onlyOwner {
        _setIntervalsAndInterestRates(_intervals, _interestRates);
    }

    /**
     * @dev Sets the fee of the forced withdrawals. Can be called only by owner
     * @param _fee The new fee value (in percentage)
     */
    function setFee(uint256 _fee) external onlyOwner {
        _setFee(_fee);
    }

    /**
     * @dev Sets the time from the request after which the withdrawal will be available.
     * Can be called only by owner
     * @param _withdrawalLockDuration The new duration value (in seconds)
     */
    function setWithdrawalLockDuration(uint256 _withdrawalLockDuration) external onlyOwner {
        _setWithdrawalLockDuration(_withdrawalLockDuration);
    }

    /**
     * @dev Sets the time during which the withdrawal will be available from the moment of unlocking.
     * Can be called only by owner
     * @param _withdrawalUnlockDuration The new duration value (in seconds)
     */
    function setWithdrawalUnlockDuration(uint256 _withdrawalUnlockDuration) external onlyOwner {
        _setWithdrawalUnlockDuration(_withdrawalUnlockDuration);
    }

    /**
     * @param _user The address of the user
     * @param _customId Custom identifier (for exchanges)
     * @return The deposit balance of the user
     */
    function getBalance(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return balances[userHash];
    }

    /**
     * @param _user The address of the user
     * @param _customId Custom identifier (for exchanges)
     * @return The deposit date of the user
     */
    function getDepositDate(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return depositDates[userHash];
    }

    /**
     * @param _user The address of the user
     * @param _customId Custom identifier (for exchanges)
     * @return The date of user's withdrawal request
     */
    function getWithdrawalRequestDate(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return withdrawalRequestsDates[userHash];
    }

    /**
     * @param _user The address of the user
     * @param _customId Custom identifier (for exchanges)
     * @return Current earned interest
     */
    function getCurrentEarnedInterest(address _user, string calldata _customId) external view returns (uint256) {
        bytes32 userHash = _getUserHash(_user, _customId);
        return _getCurrentEarnedInterest(userHash);
    }

    /**
     * @return The array of staking intervals
     */
    function getIntervals() external view returns (uint256[] memory) {
        return intervals;
    }

    /**
     * @return The array of interest rates
     */
    function getInterestRates() external view returns (uint256[] memory) {
        return interestRates;
    }

    /**
     * @dev Calls internal "_mint" method and increases the user balance
     * @param _sender The address of the sender
     * @param _amount The amount to deposit
     * @param _customId Custom identifier (for exchanges)
     */
    function _deposit(address _sender, uint256 _amount, string memory _customId) internal {
        bytes32 userHash = _getUserHash(_sender, _customId);
        _mint(userHash);
        balances[userHash] = balances[userHash].add(_amount);
        emit Deposited(_sender, _amount, _customId);
    }

    /**
     * @dev Calls internal "_mint" method and then transfers tokens to the sender
     * @param _sender The address of the sender
     * @param _amount The amount to withdraw
     * @param _customId Custom identifier (for exchanges)
     * @param _forced With or without commission
     */
    function _withdraw(address _sender, uint256 _amount, string memory _customId, bool _forced) internal {
        bytes32 userHash = _getUserHash(_sender, _customId);
        require(balances[userHash] > 0, "zero balance");
        _mint(userHash);
        uint256 amount = _amount;
        if (amount == 0) {
            amount = balances[userHash];
        }
        balances[userHash] = balances[userHash].sub(amount);
        if (balances[userHash] == 0) {
            depositDates[userHash] = 0;
        }
        if (_forced) {
            uint256 feeValue = amount.mul(fee).div(1 ether);
            amount = amount.sub(feeValue);
            token.transfer(BURN_ADDRESS, feeValue);
        }
        token.transfer(_sender, amount);
        emit Withdrawn(_sender, amount, _customId);
    }

    /**
     * @dev Mints the user's interest and updates the deposit date
     * @param _user The hash of the user
     */
    function _mint(bytes32 _user) internal {
        uint256 interest = _getCurrentEarnedInterest(_user);
        if (interest > 0) {
            token.mint(address(this), interest);
            balances[_user] = balances[_user].add(interest);
        }
        // solium-disable-next-line security/no-block-members
        depositDates[_user] = block.timestamp;
    }

    /**
     * @dev Sets the staking token address
     * @param _tokenAddress The new address of the token
     */
    function _setToken(address _tokenAddress) internal {
        require(_tokenAddress.isContract(), "not a contract address");
        token = IERC20Mintable(_tokenAddress);
    }

    /**
     * @dev Sets staking intervals and interest rates
     * @param _intervals The array of staking intervals
     * @param _interestRates The array of interest rates for each staking interval
     */
    function _setIntervalsAndInterestRates(
        uint256[] memory _intervals,
        uint256[] memory _interestRates
    ) internal {
        require(_intervals.length.add(1) == _interestRates.length, "wrong array sizes");
        intervals = _intervals;
        interestRates = _interestRates;
    }

    /**
     * @dev Sets the fee of the forced withdrawals
     * @param _fee The new fee value (in percentage)
     */
    function _setFee(uint256 _fee) internal {
        require(_fee <= 1 ether, "should be less than or equal to 1 ether");
        fee = _fee;
    }

    /**
     * @dev Sets the time from the request after which the withdrawal will be available.
     * @param _withdrawalLockDuration The new duration value (in seconds)
     */
    function _setWithdrawalLockDuration(uint256 _withdrawalLockDuration) internal {
        withdrawalLockDuration = _withdrawalLockDuration;
    }

    /**
     * @dev Sets the time during which the withdrawal will be available from the moment of unlocking.
     * @param _withdrawalUnlockDuration The new duration value (in seconds)
     */
    function _setWithdrawalUnlockDuration(uint256 _withdrawalUnlockDuration) internal {
        withdrawalUnlockDuration = _withdrawalUnlockDuration;
    }

    /**
     * @dev Sets lock to prevent reentrance
     */
    function _setLocked(bool _locked) internal {
        locked = _locked;
    }

    /**
     * @param _sender The address of the sender
     * @param _customId Custom identifier (for exchanges)
     * @return The unique hash of the user
     */
    function _getUserHash(address _sender, string memory _customId) internal pure returns (bytes32) {
        return keccak256(abi.encode(_sender, _customId));
    }

    /**
     * @param _user The hash of the user
     * @return Current earned interest
     */
    function _getCurrentEarnedInterest(bytes32 _user) internal view returns (uint256) {
        uint256 balance = balances[_user];
        if (balance == 0) return 0;
        // solium-disable-next-line security/no-block-members
        uint256 timePassed = block.timestamp.sub(depositDates[_user]);
        uint256 currentInterestRate = interestRates[0];
        uint256 sumOfIntervals;
        for (uint256 i = 0; i < intervals.length; i++) {
            sumOfIntervals = sumOfIntervals.add(intervals[i]);
            if (timePassed < sumOfIntervals) break;
            currentInterestRate = interestRates[i.add(1)];
        }
        return balance.mul(currentInterestRate).div(1 ether).mul(timePassed).div(YEAR);
    }
}
