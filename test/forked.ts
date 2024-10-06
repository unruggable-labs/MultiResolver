import { Foundry } from "@adraffy/blocksmith";
import { serve } from "@resolverworks/ezccip";
import { ethers } from "ethers";

const foundry = await Foundry.launch({
	infoLog: true,
	fork: "https://rpc.ankr.com/eth",
});

const ENS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const L1MultiResolver = await foundry.deploy({
	file: "L1MultiResolver",
	args: [
		ENS,
		"0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401", // NameWrapper
	],
});

const Echo = await foundry.deploy({ file: "TextEchoKey" });
const ChonkOwner = await foundry.deploy({ file: "ChonkOwner", args: [ENS] });

const ccip = await serve(
	async () => {
		return {
			async text(key: string) {
				return `${key}:${new Date().toISOString()}`;
			},
		};
	},
	{ protocol: "raw" }
);
const Offchain = await foundry.deploy(`
	import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
	import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
	error OffchainLookup(address, string[], bytes, bytes4, bytes);
	contract Offchain is IERC165, IExtendedResolver {
		string[] urls = ["${ccip.endpoint}"];
		function supportsInterface(bytes4 x) external pure returns (bool) {
			return x == type(IExtendedResolver).interfaceId;
		}
		function resolve(bytes calldata dnsname, bytes calldata) external view returns (bytes memory) {
			revert OffchainLookup(address(this), urls, msg.data, this.textCallback.selector, '');
		}
		function textCallback(bytes calldata v, bytes calldata) external view returns (bytes memory) {
			return v;
		}
	}
`);

/*
// https://resolverworks.github.io/ezccip.js/test/postman.html#endpoint=https%3A%2F%2Fapi.coinbase.com%2Fapi%2Fv1%2Fdomain%2Fresolver%2FresolveDomain%2F%7Bsender%7D%2F%7Bdata%7D&sender=0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31&proto=ens&name=raffy.base.eth&field=text-url
// only works if sender = 0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31
const Basename = await foundry.deploy(`
	import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
	import {BytesUtils} from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";
	import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
	error OffchainLookup(address, string[], bytes, bytes4, bytes);
	contract Offchain is IERC165, IExtendedResolver {
		function supportsInterface(bytes4 x) external pure returns (bool) {
			return x == type(IExtendedResolver).interfaceId;
		}
		function resolve(bytes calldata dnsname0, bytes memory data) external view returns (bytes memory) {
			bytes memory dnsname = hex"05726166667904626173650365746800";
			bytes32 namehash = BytesUtils.namehash(dnsname, 0);
			assembly { mstore(add(data, 32), namehash) }
			IExtendedResolver(0xde9049636F4a1dfE0a64d1bFe3155C0A14C54F31).resolve(dnsname, data);
		}
	}
`);
*/

async function wrapResolver(name: string, fallback: boolean | string = true) {
	const node = ethers.namehash(name);
	if (typeof fallback !== "string" && fallback) {
		const resolver = await foundry.provider.getResolver("raffy.eth");
		fallback = resolver ? resolver.address : false;
	}
	// mapping (bytes32 => Record) records;
	const slot = BigInt(
		ethers.solidityPackedKeccak256(["bytes32", "uint256"], [node, 0n])
	);
	// struct Record {
	//   address owner;    # 0
	//   address resolver; # 1
	//   uint64 ttl;
	// }
	// set owner
	await foundry.setStorageValue(ENS, slot, foundry.wallets.admin.address);
	// set resolver
	await foundry.setStorageValue(ENS, slot + 1n, L1MultiResolver.target);
	if (fallback) {
		await foundry.confirm(
			L1MultiResolver.setFallbackResolver(node, fallback)
		);
	}
	const resolver = await foundry.provider.getResolver("raffy.eth");
	if (!resolver) throw new Error("bug");
	return Object.assign(resolver, {
		async $setTextResolver(key: string, impl: any) {
			return foundry.confirm(
				L1MultiResolver.setTextResolver(node, key, impl)
			);
		},
	});
}

const resolver = await wrapResolver(
	"raffy.eth",
	"0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41" // TOR doesn't work if not current resolver
);

await resolver.$setTextResolver("chonk", ChonkOwner);
await resolver.$setTextResolver("echo", Echo);
await resolver.$setTextResolver("offchain", Offchain);
//await resolver.$setTextResolver("url", Basename);

console.log(await resolver.getAddress());
console.log(await resolver.getText("avatar"));
console.log(await resolver.getText("com.github"));
console.log(await resolver.getText("chonk"));
console.log(await resolver.getText("echo"));

ccip.http.close();
await foundry.shutdown();
