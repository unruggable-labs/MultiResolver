// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract TextEchoKey {
	function text(bytes32, string memory key) external pure returns (string memory) {
		return key;
	}
}
