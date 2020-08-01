pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "./IERC20Mintable.sol";
import "./Sacrifice.sol";
import "./lib/Sigmoid.sol";

/**
 * @title EasyStaking
 *
 * Note: all percentage values are between 0 (0%) and 1 (100%)
 * and represented as fixed point numbers containing 18 decimals like with Ether
 * 100% == 1 ether
 */
contract EasyStaking is Ownable, ReentrancyGuard {
    using Address for address;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Sigmoid for Sigmoid.State;

    /**
     * @dev Emitted when a user deposits tokens.
     * @param sender User address.
     * @param id User's unique deposit ID.
     * @param amount The amount of deposited tokens.
     * @param balance Current user balance.
     * @param accruedEmission User's accrued emission.
     * @param prevDepositDuration Duration of the previous deposit in seconds.
     */
    event Deposited(
        address indexed sender,
        uint256 indexed id,
        uint256 amount,
        uint256 balance,
        uint256 accruedEmission,
        uint256 prevDepositDuration
    );

    /**
     * @dev Emitted when a user requests withdrawal.
     * @param sender User address.
     * @param id User's unique deposit ID.
     */
    event WithdrawalRequested(address indexed sender, uint256 indexed id);

    /**
     * @dev Emitted when a user withdraws tokens.
     * @param sender User address.
     * @param id User's unique deposit ID.
     * @param amount The amount of withdrawn tokens.
     * @param fee The withdrawal fee.
     * @param balance Current user balance.
     * @param accruedEmission User's accrued emission.
     * @param lastDepositDuration Duration of the last deposit in seconds.
     */
    event Withdrawn(
        address indexed sender,
        uint256 indexed id,
        uint256 amount,
        uint256 fee,
        uint256 balance,
        uint256 accruedEmission,
        uint256 lastDepositDuration
    );

    /**
     * @dev Emitted when a new fee value is set.
     * @param value A new fee value.
     * @param sender The owner address at the moment of fee changing.
     */
    event FeeSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new withdrawal lock duration value is set.
     * @param value A new withdrawal lock duration value.
     * @param sender The owner address at the moment of value changing.
     */
    event WithdrawalLockDurationSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new withdrawal unlock duration value is set.
     * @param value A new withdrawal unlock duration value.
     * @param sender The owner address at the moment of value changing.
     */
    event WithdrawalUnlockDurationSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new total supply factor value is set.
     * @param value A new total supply factor value.
     * @param sender The owner address at the moment of value changing.
     */
    event TotalSupplyFactorSet(uint256 value, address sender);

    /**
     * @dev Emitted when new sigmoid parameters values are set.
     * @param a A new parameter A value.
     * @param b A new parameter B value.
     * @param c A new parameter C value.
     * @param sender The owner address at the moment of value changing.
     */
    event SigmoidParametersSet(uint256 a, int256 b, uint256 c, address sender);

    /**
     * @dev Emitted when a new Liquidity Providers Reward address value is set.
     * @param value A new address value.
     * @param sender The owner address at the moment of address changing.
     */
    event LiquidityProvidersRewardAddressSet(address value, address sender);

    uint256 private constant YEAR = 365 days;
    // The maximum emission rate (in percentage)
    uint256 public constant MAX_EMISSION_RATE = 150 finney; // 15%, 0.15 ether
    // The period after which the new value of the parameter is set
    uint256 public constant PARAM_UPDATE_DELAY = 7 days;

    // STAKE token
    IERC20Mintable public token;

    struct UintParam {
        uint256 oldValue;
        uint256 newValue;
        uint256 timestamp;
    }

    struct AddressParam {
        address oldValue;
        address newValue;
        uint256 timestamp;
    }

    // The address for the Liquidity Providers reward
    AddressParam public liquidityProvidersRewardAddressParam;
    // The fee of the forced withdrawal (in percentage)
    UintParam public feeParam;
    // The time from the request after which the withdrawal will be available (in seconds)
    UintParam public withdrawalLockDurationParam;
    // The time during which the withdrawal will be available from the moment of unlocking (in seconds)
    UintParam public withdrawalUnlockDurationParam;
    // Total supply factor for calculating emission rate (in percentage)
    UintParam public totalSupplyFactorParam;

    // The deposit balances of users
    mapping (address => mapping (uint256 => uint256)) public balances;
    // The dates of users' deposits
    mapping (address => mapping (uint256 => uint256)) public depositDates;
    // The dates of users' withdrawal requests
    mapping (address => mapping (uint256 => uint256)) public withdrawalRequestsDates;
    // The last deposit id
    mapping (address => uint256) public lastDepositIds;
    // The total staked amount
    uint256 public totalStaked;

    // Variable that prevents _deposit method from being called 2 times
    bool private locked;
    // The library that is used to calculate user's current emission rate
    Sigmoid.State private sigmoid;

    /**
     * @dev Initializes the contract.
     * @param _owner The owner of the contract.
     * @param _tokenAddress The address of the STAKE token contract.
     * @param _liquidityProvidersRewardAddress The address for the Liquidity Providers reward.
     * @param _fee The fee of the forced withdrawal (in percentage).
     * @param _withdrawalLockDuration The time from the request after which the withdrawal will be available (in seconds).
     * @param _withdrawalUnlockDuration The time during which the withdrawal will be available from the moment of unlocking (in seconds).
     * @param _totalSupplyFactor Total supply factor for calculating emission rate (in percentage).
     * @param _sigmoidParamA Sigmoid parameter A.
     * @param _sigmoidParamB Sigmoid parameter B.
     * @param _sigmoidParamC Sigmoid parameter C.
     */
    function initialize(
        address _owner,
        address _tokenAddress,
        address _liquidityProvidersRewardAddress,
        uint256 _fee,
        uint256 _withdrawalLockDuration,
        uint256 _withdrawalUnlockDuration,
        uint256 _totalSupplyFactor,
        uint256 _sigmoidParamA,
        int256 _sigmoidParamB,
        uint256 _sigmoidParamC
    ) external initializer {
        require(_owner != address(0), "zero address");
        require(_tokenAddress.isContract(), "not a contract address");
        Ownable.initialize(msg.sender);
        ReentrancyGuard.initialize();
        token = IERC20Mintable(_tokenAddress);
        setFee(_fee);
        setWithdrawalLockDuration(_withdrawalLockDuration);
        setWithdrawalUnlockDuration(_withdrawalUnlockDuration);
        setTotalSupplyFactor(_totalSupplyFactor);
        setSigmoidParameters(_sigmoidParamA, _sigmoidParamB, _sigmoidParamC);
        setLiquidityProvidersRewardAddress(_liquidityProvidersRewardAddress);
        Ownable.transferOwnership(_owner);
    }

    /**
     * @dev This method is used to deposit tokens to a new deposit.
     * It generates a new deposit ID and calls another public "deposit" method. See its description.
     * @param _amount The amount to deposit.
     */
    function deposit(uint256 _amount) external {
        deposit(++lastDepositIds[msg.sender], _amount);
    }

    /**
     * @dev This method is used to deposit tokens to the deposit opened before.
     * It calls the internal "_deposit" method and transfers tokens from sender to contract.
     * Sender must approve tokens first.
     *
     * Instead this, user can use the simple "transfer" method of STAKE token contract to make a deposit.
     * Sender's approval is not needed in this case.
     *
     * Note: each call updates the deposit date so be careful if you want to make a long staking.
     *
     * @param _depositId User's unique deposit ID.
     * @param _amount The amount to deposit.
     */
    function deposit(uint256 _depositId, uint256 _amount) public {
        require(_depositId > 0 && _depositId <= lastDepositIds[msg.sender], "wrong deposit id");
        _deposit(msg.sender, _depositId, _amount);
        _setLocked(true);
        require(token.transferFrom(msg.sender, address(this), _amount), "transfer failed");
        _setLocked(false);
    }

    /**
     * @dev This method is called when STAKE tokens are transferred to this contract.
     * using "transfer", "transferFrom", or "transferAndCall" method of STAKE token contract.
     * It generates a new deposit ID and calls the internal "_deposit" method.
     * @param _sender The sender of tokens.
     * @param _amount The transferred amount.
     * @return true if successful
     */
    function onTokenTransfer(address _sender, uint256 _amount, bytes calldata) external returns (bool) {
        require(msg.sender == address(token), "only token contract is allowed");
        if (!locked) {
            _deposit(_sender, ++lastDepositIds[_sender], _amount);
        }
        return true;
    }

    /**
     * @dev This method is used to make a forced withdrawal with a fee.
     * It calls the internal "_withdraw" method.
     * @param _depositId User's unique deposit ID.
     * @param _amount The amount to withdraw (0 - to withdraw all).
     */
    function makeForcedWithdrawal(uint256 _depositId, uint256 _amount) external {
        _withdraw(msg.sender, _depositId, _amount, true);
    }

    /**
     * @dev This method is used to request a withdrawal without a fee.
     * It sets the date of the request.
     *
     * Note: each call updates the date of the request so don't call this method twice during the lock.
     *
     * @param _depositId User's unique deposit ID.
     */
    function requestWithdrawal(uint256 _depositId) external {
        require(_depositId > 0 && _depositId <= lastDepositIds[msg.sender], "wrong deposit id");
        withdrawalRequestsDates[msg.sender][_depositId] = _now();
        emit WithdrawalRequested(msg.sender, _depositId);
    }

    /**
     * @dev This method is used to make a requested withdrawal.
     * It calls the internal "_withdraw" method and resets the date of the request.
     *
     * If sender didn't call this method during the unlock period (if timestamp >= lockEnd + withdrawalUnlockDuration)
     * they have to call "requestWithdrawal" one more time.
     *
     * @param _depositId User's unique deposit ID.
     * @param _amount The amount to withdraw (0 - to withdraw all).
     */
    function makeRequestedWithdrawal(uint256 _depositId, uint256 _amount) external {
        uint256 requestDate = withdrawalRequestsDates[msg.sender][_depositId];
        require(requestDate > 0, "withdrawal wasn't requested");
        uint256 timestamp = _now();
        uint256 lockEnd = requestDate.add(withdrawalLockDuration());
        require(timestamp >= lockEnd, "too early");
        require(timestamp < lockEnd.add(withdrawalUnlockDuration()), "too late");
        withdrawalRequestsDates[msg.sender][_depositId] = 0;
        _withdraw(msg.sender, _depositId, _amount, false);
    }

    /**
     * @dev This method is used to claim unsupported tokens accidentally sent to the contract.
     * It can only be called by the owner.
     * @param _token The address of the token contract (zero address for claiming native coins).
     * @param _to The address of the tokens/coins receiver.
     * @param _amount Amount to claim.
     */
    function claimTokens(address _token, address payable _to, uint256 _amount) external onlyOwner {
        require(_to != address(0) && _to != address(this), "not a valid recipient");
        require(_amount > 0, "amount should be greater than 0");
        if (_token == address(0)) {
            if (!_to.send(_amount)) { // solium-disable-line security/no-send
                (new Sacrifice).value(_amount)(_to);
            }
        } else if (_token == address(token)) {
            uint256 availableAmount = token.balanceOf(address(this)).sub(totalStaked);
            require(availableAmount >= _amount, "insufficient funds");
            require(token.transfer(_to, _amount), "transfer failed");
        } else {
            IERC20 customToken = IERC20(_token);
            customToken.safeTransfer(_to, _amount);
        }
    }

    /**
     * @dev Sets the fee for forced withdrawals. Can only be called by owner.
     * @param _value The new fee value (in percentage).
     */
    function setFee(uint256 _value) public onlyOwner {
        require(_value <= 1 ether, "should be less than or equal to 1 ether");
        _updateUintParam(feeParam, _value);
        emit FeeSet(_value, msg.sender);
    }

    /**
     * @dev Sets the time from the request after which the withdrawal will be available.
     * Can only be called by owner.
     * @param _value The new duration value (in seconds).
     */
    function setWithdrawalLockDuration(uint256 _value) public onlyOwner {
        require(_value <= 30 days, "shouldn't be greater than 30 days");
        _updateUintParam(withdrawalLockDurationParam, _value);
        emit WithdrawalLockDurationSet(_value, msg.sender);
    }

    /**
     * @dev Sets the time during which the withdrawal will be available from the moment of unlocking.
     * Can only be called by owner.
     * @param _value The new duration value (in seconds).
     */
    function setWithdrawalUnlockDuration(uint256 _value) public onlyOwner {
        require(_value >= 1 hours, "shouldn't be less than 1 hour");
        _updateUintParam(withdrawalUnlockDurationParam, _value);
        emit WithdrawalUnlockDurationSet(_value, msg.sender);
    }

    /**
     * @dev Sets total supply factor for calculating emission rate.
     * Can only be called by owner.
     * @param _value The new factor value (in percentage).
     */
    function setTotalSupplyFactor(uint256 _value) public onlyOwner {
        require(_value <= 1 ether, "should be less than or equal to 1 ether");
        _updateUintParam(totalSupplyFactorParam, _value);
        emit TotalSupplyFactorSet(_value, msg.sender);
    }

    /**
     * @dev Sets parameters of the sigmoid that is used to calculate the user's current emission rate.
     * Can only be called by owner.
     * @param _a Sigmoid parameter A. Unsigned integer.
     * @param _b Sigmoid parameter B. Signed integer.
     * @param _c Sigmoid parameter C. Unsigned integer. Cannot be zero.
     */
    function setSigmoidParameters(uint256 _a, int256 _b, uint256 _c) public onlyOwner {
        require(_a <= MAX_EMISSION_RATE.div(2), "should be less than or equal to a half of the maximum emission rate");
        sigmoid.setParameters(_a, _b, _c);
        emit SigmoidParametersSet(_a, _b, _c, msg.sender);
    }

    /**
     * @dev Sets the address for the Liquidity Providers reward.
     * Can only be called by owner.
     * @param _address The new address.
     */
    function setLiquidityProvidersRewardAddress(address _address) public onlyOwner {
        require(_address != address(0), "zero address");
        require(_address != address(this), "wrong address");
        AddressParam memory param = liquidityProvidersRewardAddressParam;
        if (param.timestamp == 0) {
            param.oldValue = _address;
        } else if (_paramUpdateDelayElapsed(param.timestamp)) {
            param.oldValue = param.newValue;
        }
        param.newValue = _address;
        param.timestamp = _now();
        liquidityProvidersRewardAddressParam = param;
        emit LiquidityProvidersRewardAddressSet(_address, msg.sender);
    }

    /**
     * @return Returns current fee.
     */
    function fee() public view returns (uint256) {
        return _getUintParamValue(feeParam);
    }

    /**
     * @return Returns current withdrawal lock duration.
     */
    function withdrawalLockDuration() public view returns (uint256) {
        return _getUintParamValue(withdrawalLockDurationParam);
    }

    /**
     * @return Returns current withdrawal unlock duration.
     */
    function withdrawalUnlockDuration() public view returns (uint256) {
        return _getUintParamValue(withdrawalUnlockDurationParam);
    }

    /**
     * @return Returns current total supply factor.
     */
    function totalSupplyFactor() public view returns (uint256) {
        return _getUintParamValue(totalSupplyFactorParam);
    }

    /**
     * @return Returns current liquidity providers reward address.
     */
    function liquidityProvidersRewardAddress() public view returns (address) {
        AddressParam memory param = liquidityProvidersRewardAddressParam;
        return _paramUpdateDelayElapsed(param.timestamp) ? param.newValue : param.oldValue;
    }

    /**
     * @return Emission rate based on the ratio of total staked to total supply.
     */
    function getSupplyBasedEmissionRate() public view returns (uint256) {
        uint256 totalSupply = token.totalSupply();
        uint256 factor = totalSupplyFactor();
        if (factor == 0) return 0;
        uint256 target = totalSupply.mul(factor).div(1 ether);
        uint256 maxSupplyBasedEmissionRate = MAX_EMISSION_RATE.div(2); // 7.5%
        if (totalStaked >= target) {
            return maxSupplyBasedEmissionRate;
        }
        return maxSupplyBasedEmissionRate.mul(totalStaked).div(target);
    }

    /**
     * @param _depositDate Deposit date.
     * @param _amount Amount based on which emission is calculated and accrued.
     * @return Total accrued emission (for the user and Liquidity Providers), user share, and seconds passed since the previous deposit started.
     */
    function getAccruedEmission(
        uint256 _depositDate,
        uint256 _amount
    ) public view returns (uint256 total, uint256 userShare, uint256 timePassed) {
        if (_amount == 0 || _depositDate == 0) return (0, 0, 0);
        timePassed = _now().sub(_depositDate);
        if (timePassed == 0) return (0, 0, 0);
        uint256 userEmissionRate = sigmoid.calculate(int256(timePassed));
        userEmissionRate = userEmissionRate.add(getSupplyBasedEmissionRate());
        if (userEmissionRate == 0) return (0, 0, timePassed);
        assert(userEmissionRate <= MAX_EMISSION_RATE);
        total = _amount.mul(MAX_EMISSION_RATE).mul(timePassed).div(YEAR * 1 ether);
        userShare = _amount.mul(userEmissionRate).mul(timePassed).div(YEAR * 1 ether);
    }

    /**
     * @return Sigmoid parameters.
     */
    function getSigmoidParameters() public view returns (uint256 a, int256 b, uint256 c) {
        return sigmoid.getParameters();
    }

    /**
     * @dev Calls internal "_mint" method, increases the user balance, and updates the deposit date.
     * @param _sender The address of the sender.
     * @param _id User's unique deposit ID.
     * @param _amount The amount to deposit.
     */
    function _deposit(address _sender, uint256 _id, uint256 _amount) internal nonReentrant {
        require(_amount > 0, "deposit amount should be more than 0");
        (uint256 sigmoidParamA,,) = getSigmoidParameters();
        if (sigmoidParamA == 0 && totalSupplyFactor() == 0) revert("emission stopped");
        (uint256 userShare, uint256 timePassed) = _mint(_sender, _id, 0);
        uint256 newBalance = balances[_sender][_id].add(_amount);
        balances[_sender][_id] = newBalance;
        totalStaked = totalStaked.add(_amount);
        depositDates[_sender][_id] = _now();
        emit Deposited(_sender, _id, _amount, newBalance, userShare, timePassed);
    }

    /**
     * @dev Calls internal "_mint" method and then transfers tokens to the sender.
     * @param _sender The address of the sender.
     * @param _id User's unique deposit ID.
     * @param _amount The amount to withdraw (0 - to withdraw all).
     * @param _forced Defines whether to apply fee (true), or not (false).
     */
    function _withdraw(address _sender, uint256 _id, uint256 _amount, bool _forced) internal nonReentrant {
        require(_id > 0 && _id <= lastDepositIds[_sender], "wrong deposit id");
        require(balances[_sender][_id] > 0 && balances[_sender][_id] >= _amount, "insufficient funds");
        (uint256 accruedEmission, uint256 timePassed) = _mint(_sender, _id, _amount);
        uint256 amount = _amount == 0 ? balances[_sender][_id] : _amount.add(accruedEmission);
        balances[_sender][_id] = balances[_sender][_id].sub(amount);
        totalStaked = totalStaked.sub(amount);
        if (balances[_sender][_id] == 0) {
            depositDates[_sender][_id] = 0;
        }
        uint256 feeValue = 0;
        if (_forced) {
            feeValue = amount.mul(fee()).div(1 ether);
            amount = amount.sub(feeValue);
            require(token.transfer(liquidityProvidersRewardAddress(), feeValue), "transfer failed");
        }
        require(token.transfer(_sender, amount), "transfer failed");
        emit Withdrawn(_sender, _id, amount, feeValue, balances[_sender][_id], accruedEmission, timePassed);
    }

    /**
     * @dev Mints MAX_EMISSION_RATE per annum and distributes the emission between the user and Liquidity Providers in proportion.
     * @param _user User's address.
     * @param _id User's unique deposit ID.
     * @param _amount Amount based on which emission is calculated and accrued. When 0, current deposit balance is used.
     */
    function _mint(address _user, uint256 _id, uint256 _amount) internal returns (uint256, uint256) {
        uint256 currentBalance = balances[_user][_id];
        uint256 amount = _amount == 0 ? currentBalance : _amount;
        (uint256 total, uint256 userShare, uint256 timePassed) = getAccruedEmission(depositDates[_user][_id], amount);
        if (total > 0) {
            require(token.mint(address(this), total), "minting failed");
            balances[_user][_id] = currentBalance.add(userShare);
            totalStaked = totalStaked.add(userShare);
            require(token.transfer(liquidityProvidersRewardAddress(), total.sub(userShare)), "transfer failed");
        }
        return (userShare, timePassed);
    }

    /**
     * @dev Sets the next value of the parameter and the timestamp of this setting.
     */
    function _updateUintParam(UintParam storage _param, uint256 _newValue) internal {
        if (_param.timestamp == 0) {
            _param.oldValue = _newValue;
        } else if (_paramUpdateDelayElapsed(_param.timestamp)) {
            _param.oldValue = _param.newValue;
        }
        _param.newValue = _newValue;
        _param.timestamp = _now();
    }

    /**
     * @return Returns the current value of the parameter.
     */
    function _getUintParamValue(UintParam memory _param) internal view returns (uint256) {
        return _paramUpdateDelayElapsed(_param.timestamp) ? _param.newValue : _param.oldValue;
    }

    /**
     * @return Returns true if param update delay elapsed.
     */
    function _paramUpdateDelayElapsed(uint256 _paramTimestamp) internal view returns (bool) {
        return _now() > _paramTimestamp.add(PARAM_UPDATE_DELAY);
    }

    /**
     * @dev Sets lock to prevent reentrance.
     */
    function _setLocked(bool _locked) internal {
        locked = _locked;
    }

    /**
     * @return Returns current timestamp.
     */
    function _now() internal view returns (uint256) {
        // Note that the timestamp can have a 900-second error:
        // https://github.com/ethereum/wiki/blob/c02254611f218f43cbb07517ca8e5d00fd6d6d75/Block-Protocol-2.0.md
        return now; // solium-disable-line security/no-block-members
    }
}
