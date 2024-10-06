import { Foundry } from "@adraffy/blocksmith";


const foundry = await Foundry.launch({
	infoLog: true
});

const L1MultiResolver = await foundry.deploy({
	file: "L1MultiResolver",
	args: [
		"0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // ENS
		"0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401", // NameWrapper
	],
});

await foundry.shutdown();
