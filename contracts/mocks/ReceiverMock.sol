pragma solidity 0.5.16;

contract ReceiverMock {
    function () external payable {
        revert("");
    }
}
