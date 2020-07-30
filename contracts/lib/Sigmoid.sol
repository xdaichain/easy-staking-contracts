pragma solidity 0.5.16;

import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./ExtendedMath.sol";

library Sigmoid {
    using SafeMath for uint256;
    using ExtendedMath for uint256;

    // The period after which the new value of the parameter is set
    uint256 public constant PARAM_UPDATE_DELAY = 7 days;

    struct Params {
        uint256 a;
        int256 b;
        uint256 c;
    }

    struct State {
        Params oldParams;
        Params newParams;
        uint256 timestamp;
    }

    /**
     * @dev Sets sigmoid parameters
     * @param _a Sigmoid parameter A.
     * @param _b Sigmoid parameter B.
     * @param _c Sigmoid parameter C.
     */
    function setParameters(State storage self, uint256 _a, int256 _b, uint256 _c) internal {
        require(_c != 0, "should be greater than 0"); // prevent division by zero
        uint256 currentTimestamp = _now();
        if (self.timestamp == 0) {
            self.oldParams = Params(_a, _b, _c);
        } else if (currentTimestamp > self.timestamp.add(PARAM_UPDATE_DELAY)) {
            self.oldParams = self.newParams;
        }
        self.newParams = Params(_a, _b, _c);
        self.timestamp = currentTimestamp;
    }

    /**
     * @return Sigmoid parameters
     */
    function getParameters(State storage self) internal view returns (uint256, int256, uint256) {
        bool isUpdated = _now() > self.timestamp.add(PARAM_UPDATE_DELAY);
        return isUpdated ?
            (self.newParams.a, self.newParams.b, self.newParams.c) :
            (self.oldParams.a, self.oldParams.b, self.oldParams.c);
    }

    /**
     * @return The corresponding Y value for a given X value
     */
    function calculate(State storage self, int256 _x) internal view returns (uint256) {
        (uint256 a, int256 b, uint256 c) = getParameters(self);
        int256 k = _x - b;
        if (k < 0) return 0;
        uint256 uk = uint256(k);
        return a.mul(uk).div(uk.pow2().add(c).sqrt());
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
