import { afterEach, describe, expect, it, vi } from "vitest";
import {
	disposeCliFeatureFlagsService,
	getCliFeatureFlagsContext,
	getCliFeatureFlagsService,
	identifyFeatureFlagsAccount,
} from "./feature-flags";

describe("CLI feature flags singleton", () => {
	afterEach(async () => {
		await disposeCliFeatureFlagsService();
	});

	it("recreates the singleton after disposal", async () => {
		const service = getCliFeatureFlagsService();

		await disposeCliFeatureFlagsService();

		expect(getCliFeatureFlagsService()).not.toBe(service);
	});

	it("ignores account identity and polling when Cline cloud services are disabled", async () => {
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "0");
		const service = getCliFeatureFlagsService();
		const poll = vi.spyOn(service, "poll");

		await identifyFeatureFlagsAccount({ id: "saved-account", email: "saved@example.com" });

		expect(getCliFeatureFlagsContext().userId).toBeUndefined();
		expect(poll).not.toHaveBeenCalled();
	});
});
