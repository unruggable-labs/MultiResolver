// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IAddrResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddrResolver.sol";
import {BytesUtils} from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract ChonkOwner is IERC165, IExtendedResolver {

	ENS immutable _ens;

	constructor(ENS ens) {
		_ens = ens;
	}

	function supportsInterface(bytes4 x) external pure returns (bool) {
		return x == type(IERC165).interfaceId || x == type(IExtendedResolver).interfaceId;
	}

	function resolve(bytes calldata dnsname, bytes calldata) external view returns (bytes memory) {
		bytes32 node = BytesUtils.namehash(dnsname, 0);
		(bool ok, bytes memory v) = _ens.resolver(node).staticcall(abi.encodeCall(IExtendedResolver.resolve, (dnsname, abi.encodeCall(IAddrResolver.addr, (node)))));
		uint256 count;
		if (ok) {
			v = abi.decode(v, (bytes));
			if (v.length == 32) {
				address addr = abi.decode(v, (address));
				try IERC721(0xE68d1aEeE2C17E43A955103DaB5E341eE439f55c).balanceOf(addr) returns (uint256 n) {
					count = n;
				} catch {
				}
			}
		}
		return abi.encode(count > 0 ? "Owns a Chonk" : "Does not own a Chonk");
	}

}
