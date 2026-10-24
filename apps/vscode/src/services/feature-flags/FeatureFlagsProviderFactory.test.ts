import { afterEach, describe, expect, it, vi } from "vitest";
import { isClineCloudServicesEnabled } from "@cline/shared";
import { FeatureFlagsProviderFactory } from "./FeatureFlagsProviderFactory";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("FeatureFlagsProviderFactory local-first policy", () => {
	it("uses the no-op provider by default when Cline cloud services are disabled", () => {
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "0");

		expect(isClineCloudServicesEnabled()).toBe(false);
		expect(FeatureFlagsProviderFactory.getDefaultConfig()).toEqual({ type: "no-op" });
	});

	it("permits explicitly configured feature flags when cloud services are opted in", () => {
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "1");

		expect(isClineCloudServicesEnabled()).toBe(true);
		// PostHog remains conditional on valid explicit build-time configuration.
		expect(["posthog", "no-op"]).toContain(FeatureFlagsProviderFactory.getDefaultConfig().type);
	});
});
