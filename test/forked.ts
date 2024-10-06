import { Foundry } from "@adraffy/blocksmith";
import { ethers } from "ethers";

const ABI_CODER = ethers.AbiCoder.defaultAbiCoder();

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

const A = await foundry.deploy(`
	import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
	import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
	contract A is IERC165, IExtendedResolver {
		function supportsInterface(bytes4 x) external pure returns (bool) {
			return  x == type(IExtendedResolver).interfaceId;
		}
		function resolve(bytes calldata, bytes calldata) external pure returns (bytes memory) {
			return abi.encode("chonk");
		}
	}
`)

const B = await foundry.deploy(`
	import {ITextResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/ITextResolver.sol";
	contract B is ITextResolver {
		function text(bytes32 node, string memory key) external view returns (string memory) {
			return key;
		}
	}
`);


async function wrapResolver(name: string) {
	const node = ethers.namehash(name);
	const resolver0 = await foundry.provider.getResolver('raffy.eth');
	const slot = BigInt(
		ethers.solidityPackedKeccak256(
			["bytes32", "uint256"],
			[node, 0n]
		)
	);
	// set owner
	await foundry.setStorageValue(
		ENS,
		slot,
		ABI_CODER.encode(["address"], [foundry.wallets.admin.address])
	);
	// set resolver
	await foundry.setStorageValue(
		ENS,
		slot + 1n,
		ABI_CODER.encode(["address"], [L1MultiResolver.target])
	);
	if (resolver0) {
		await foundry.confirm(L1MultiResolver.setFallbackResolver(node, resolver0.address));
	}
	const resolver = await foundry.provider.getResolver('raffy.eth');
	if (!resolver) {
		throw new Error('bug');
	}
	return Object.assign(resolver, {
		async $setTextResolver(key: string, impl: any) {
			return foundry.confirm(L1MultiResolver.setTextResolver(node, key, impl));
		}
	});
}

const resolver = await wrapResolver('raffy.eth');

await resolver.$setTextResolver('chonk', A);
await resolver.$setTextResolver('echo', B);

console.log(await resolver.getAddress());
console.log(await resolver.getText('avatar'));
console.log(await resolver.getText('chonk'));
console.log(await resolver.getText('echo'));

await foundry.shutdown();
