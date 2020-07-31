pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/StandaloneERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";

contract ERC677Mock is StandaloneERC20 {
    using Address for address;

    address bridge;

    function initialize(
        string memory name, string memory symbol, uint8 decimals, uint256 initialSupply, address initialHolder,
        address[] memory minters, address[] memory pausers, address _bridge
    ) public initializer {
        StandaloneERC20.initialize(name, symbol, decimals, initialSupply, initialHolder, minters, pausers);
        bridge = _bridge;
    }

    function removeMinter(address _account) external {
        _removeMinter(_account);
    }

    function transfer(address recipient, uint256 amount) public returns (bool) {
        bool success = super.transfer(recipient, amount);
        require(success, "transfer failed");
        _callAfterTransfer(msg.sender, recipient, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        bool success = super.transferFrom(sender, recipient, amount);
        require(success, "transfer failed");
        _callAfterTransfer(sender, recipient, amount);
        return true;
    }

    function _callAfterTransfer(address _from, address _to, uint256 _value) internal {
        if (_to.isContract() && !_contractFallback(_from, _to, _value, new bytes(0))) {
            require(_to != bridge, "you can't transfer to bridge contract");
        }
    }

    function _contractFallback(
        address _from,
        address _to,
        uint256 _value,
        bytes memory _data
    ) private returns (bool) {
        string memory signature = "onTokenTransfer(address,uint256,bytes)";
        // solium-disable-next-line security/no-low-level-calls
        (bool success, ) = _to.call(abi.encodeWithSignature(signature, _from, _value, _data));
        return success;
    }
}
