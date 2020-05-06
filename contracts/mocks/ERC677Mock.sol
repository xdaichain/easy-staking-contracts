pragma solidity ^0.5.15;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/StandaloneERC20.sol";

contract ERC677Mock is StandaloneERC20 {
    function transfer(address recipient, uint256 amount) public returns (bool) {
        bool success = super.transfer(recipient, amount);
        _contractFallback(msg.sender, recipient, amount, new bytes(0));
        return success;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public returns (bool) {
        bool success = super.transferFrom(sender, recipient, amount);
        _contractFallback(sender, recipient, amount, new bytes(0));
        return success;
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
