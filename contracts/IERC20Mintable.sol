pragma solidity 0.5.16;


interface IERC20Mintable {
    function transfer(address _to, uint256 _value) external returns (bool);
    function transferFrom(address _from, address _to, uint256 _value) external returns (bool);
    function mint(address _to, uint256 _value) external returns (bool);
    function balanceOf(address _account) external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
