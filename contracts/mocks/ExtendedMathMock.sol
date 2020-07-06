pragma solidity 0.5.16;

import "../lib/ExtendedMath.sol";

contract ExtendedMathMock {
    using ExtendedMath for uint256;

    uint256 public squareRoot;

    function sqrt(uint256 _value) external {
        squareRoot = _value.sqrt();
    }
}
