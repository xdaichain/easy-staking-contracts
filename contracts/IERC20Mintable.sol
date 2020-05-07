pragma solidity ^0.5.15;


interface IERC20Mintable {
    function transfer(address _to, uint256 _value) external returns (bool);
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
    function mint(address _to, uint256 _value) external returns (bool);
}
