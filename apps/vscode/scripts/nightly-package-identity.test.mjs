import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NIGHTLY_PACKAGE_IDENTITY } from "./nightly-package-identity.mjs";

const manifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("nightly publisher tracks the current VS Code workspace package name", () => {
	assert.equal(NIGHTLY_PACKAGE_IDENTITY.originalName, manifest.name);
});

test("nightly package has a distinct workspace name", () => {
	assert.notEqual(NIGHTLY_PACKAGE_IDENTITY.nightlyName, manifest.name);
});
