import assert from "node:assert/strict";
import test from "node:test";
import { isHubDiscoveryShieldEnabled } from "./hub-discovery-shield.mjs";

test("does not enable shared hub-record mutation when fork updates are not configured", () => {
	assert.equal(isHubDiscoveryShieldEnabled({}), false);
	assert.equal(isHubDiscoveryShieldEnabled({ CLINE_UPDATE_PACKAGE_NAME: "" }), false);
	assert.equal(isHubDiscoveryShieldEnabled({ CLINE_UPDATE_PACKAGE_NAME: "   " }), false);
});

test("enables hub protection only for an explicitly configured update package", () => {
	assert.equal(
		isHubDiscoveryShieldEnabled({ CLINE_UPDATE_PACKAGE_NAME: "@apexforge/cline-cli" }),
		true,
	);
});
