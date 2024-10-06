// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import {INameWrapper} from "@ensdomains/ens-contracts/contracts/wrapper/INameWrapper.sol";
import {IReverseRegistrar} from "@ensdomains/ens-contracts/contracts/reverseRegistrar/IReverseRegistrar.sol";
import {IAddressResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddressResolver.sol";
import {ITextResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/ITextResolver.sol";
import {IContentHashResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IContentHashResolver.sol";

error OffchainLookup(
    address from,
    string[] urls,
    bytes request,
    bytes4 callback,
    bytes carry
);

import "forge-std/console2.sol";

contract L1MultiResolver is IERC165, IExtendedResolver {
    error Unauthorized(address owner);

    bytes32 constant ADDR_REVERSE_NODE =
        0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2; // https://adraffy.github.io/keccak.js/test/demo.html#algo=namehash&s=addr.reverse&escape=1&encoding=utf8

    mapping(bytes data => address) recordResolvers;
    mapping(bytes32 node => address) fallbackResolvers;

    ENS immutable _ens;
    INameWrapper immutable _wrapper;
    constructor(ENS ens, INameWrapper wrapper) {
        _ens = ens;
        _wrapper = wrapper;
        address owner = ens.owner(ADDR_REVERSE_NODE);
        if (owner != address(0)) {
            IReverseRegistrar(owner).claimWithResolver(
                msg.sender,
                address(this)
            );
        }
    }

    function supportsInterface(bytes4 x) external pure returns (bool) {
        return
            x == type(IERC165).interfaceId ||
            x == type(IExtendedResolver).interfaceId;
    }

    modifier requireOperator(bytes32 node) {
        address owner = _ens.owner(node);
        if (
            owner == address(_wrapper)
                ? !_wrapper.canModifyName(node, msg.sender)
                : (owner != msg.sender &&
                    !_ens.isApprovedForAll(owner, msg.sender))
        ) {
            revert Unauthorized(owner);
        }
        _;
    }

    struct Carry {
        address from;
        bytes4 callback;
        bytes carry;
    }

    function resolve(
        bytes calldata,
        bytes calldata data
    ) external view returns (bytes memory) {
		address resolver = recordResolvers[data];
        if (resolver == address(0)) {
            bytes32 node = bytes32(data[4:36]);
            resolver = fallbackResolvers[node];
        }
        if (resolver != address(0)) {
			bool wild;
            try IERC165(resolver).supportsInterface{gas: 30000}(type(IExtendedResolver).interfaceId) returns (bool quacks) {
				wild = quacks;
			} catch {
			}
            (bool ok, bytes memory v) = address(resolver).staticcall(
                wild ? msg.data : data
            );
            if (ok) {
                if (!wild) v = abi.encode(v);
            } else if (wild && bytes4(v) == OffchainLookup.selector) {
                assembly {
                    mstore(add(v, 4), sub(mload(v), 4))
                    v := add(v, 4)
                }
                (
                    address from,
                    string[] memory urls,
                    bytes memory request,
                    bytes4 callback,
                    bytes memory carry
                ) = abi.decode(v, (address, string[], bytes, bytes4, bytes));
                revert OffchainLookup(
                    address(this),
                    urls,
                    request,
                    this.resolveCallback.selector,
                    abi.encode(Carry(from, callback, carry))
                );
            }
            if (ok) {
                assembly {
                    return(add(v, 32), mload(v))
                }
            } else {
                assembly {
                    revert(add(v, 32), mload(v))
                }
            }
        }
        return new bytes(64);
    }
    function resolveCallback(
        bytes calldata response,
        bytes calldata carry
    ) external view returns (bytes memory v) {
        Carry memory carry0 = abi.decode(carry, (Carry));
        (, v) = carry0.from.staticcall(
            abi.encodeWithSelector(carry0.callback, response, carry0.carry)
        );
    }

    function setFallbackResolver(
        bytes32 node,
        address resolver
    ) external requireOperator(node) {
        fallbackResolvers[node] = resolver;
    }
    function setTextResolver(
        bytes32 node,
        string memory key,
        address resolver
    ) external requireOperator(node) {
        recordResolvers[
            abi.encodeCall(ITextResolver.text, (node, key))
        ] = resolver;
    }
    function setAddressResolver(
        bytes32 node,
        uint256 coinType,
        address resolver
    ) external requireOperator(node) {
        recordResolvers[
            abi.encodeCall(IAddressResolver.addr, (node, coinType))
        ] = resolver;
    }
    function setContenthashResolver(
        bytes32 node,
        address resolver
    ) external requireOperator(node) {
        recordResolvers[
            abi.encodeCall(IContentHashResolver.contenthash, (node))
        ] = resolver;
    }
}
