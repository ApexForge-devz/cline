import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const cliManifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const vscodeManifest = JSON.parse(
	readFileSync(new URL("../../vscode/package.json", import.meta.url), "utf8"),
);

test("CLI and VS Code package manifests identify the fork maintainer", () => {
	assert.equal(cliManifest.author?.name, "ApexForge-devz");
	assert.equal(vscodeManifest.author?.name, "ApexForge-devz");
});

test("published extension metadata links to the fork repository and publisher", () => {
	assert.equal(
		cliManifest.repository?.url,
		"git+https://github.com/ApexForge-devz/cline.git",
	);
	assert.equal(
		vscodeManifest.repository?.url,
		"https://github.com/ApexForge-devz/cline",
	);
	assert.equal(vscodeManifest.publisher, "apexforge-devz");
});
