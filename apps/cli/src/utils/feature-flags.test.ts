import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	buildClinePostHogClient: vi.fn(() => ({ kind: "posthog-client" })),
	PostHogFeatureFlagsProvider: vi.fn(function PostHogFeatureFlagsProvider(
		this: Record<string, unknown>,
		options: unknown,
	) {
		this.kind = "posthog";
		this.options = options;
	}),
	NoOpFeatureFlagsProvider: vi.fn(function NoOpFeatureFlagsProvider(
		this: Record<string, unknown>,
	) {
		this.kind = "noop";
	}),
	resolveCoreDistinctId: vi.fn(() => "machine-distinct-id"),
	poll: vi.fn(async () => {}),
	dispose: vi.fn(async () => {}),
	setContext: vi.fn(),
	featureFlagsServiceOptions: vi.fn((_options?: Record<string, unknown>) => {}),
}));

vi.mock("@cline/core", async () => {
	const actual =
		await vi.importActual<typeof import("@cline/core")>("@cline/core");
	return {
		...actual,
		NoOpFeatureFlagsProvider: mocks.NoOpFeatureFlagsProvider,
		resolveCoreDistinctId: mocks.resolveCoreDistinctId,
		FeatureFlagsService: class {
			options: Record<string, unknown>;
			constructor(options: Record<string, unknown>) {
				this.options = options;
				mocks.featureFlagsServiceOptions(options);
			}
			poll = mocks.poll;
			dispose = mocks.dispose;
			setContext = mocks.setContext;
		},
	};
});

vi.mock("@cline/core/services/feature-flags/posthog", () => ({
	buildClinePostHogClient: mocks.buildClinePostHogClient,
	PostHogFeatureFlagsProvider: mocks.PostHogFeatureFlagsProvider,
}));

import {
	disposeCliFeatureFlagsService,
	getCliFeatureFlagsContext,
	getCliFeatureFlagsService,
	identifyFeatureFlagsAccount,
} from "./feature-flags";

describe("CLI feature flags policy", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "0");
		vi.stubEnv("TELEMETRY_SERVICE_API_KEY", "");
	});

	afterEach(async () => {
		await disposeCliFeatureFlagsService();
		vi.unstubAllEnvs();
	});

	it("recreates the singleton after disposal", async () => {
		const service = getCliFeatureFlagsService();

		await disposeCliFeatureFlagsService();

		expect(getCliFeatureFlagsService()).not.toBe(service);
	});

	it("does not initialize PostHog or hydrate cached rollout values when cloud services are disabled", () => {
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "0");
		vi.stubEnv("TELEMETRY_SERVICE_API_KEY", "phc_key");

		getCliFeatureFlagsService();

		expect(mocks.NoOpFeatureFlagsProvider).toHaveBeenCalledTimes(1);
		expect(mocks.PostHogFeatureFlagsProvider).not.toHaveBeenCalled();
		expect(mocks.buildClinePostHogClient).not.toHaveBeenCalled();
		expect(mocks.featureFlagsServiceOptions).toHaveBeenCalledWith(
			expect.objectContaining({ cacheFilePath: undefined }),
		);
	});

	it("ignores account identity and polling when cloud services are disabled", async () => {
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "0");
		const service = getCliFeatureFlagsService();

		await identifyFeatureFlagsAccount({
			id: "saved-account",
			email: "saved@example.com",
		});

		expect(getCliFeatureFlagsContext().userId).toBeUndefined();
		expect(service.poll).not.toHaveBeenCalled();
	});

	it("preserves explicit PostHog configuration when cloud services are opted in", () => {
		vi.stubEnv("CLINE_ENABLE_CLOUD_SERVICES", "1");
		vi.stubEnv("TELEMETRY_SERVICE_API_KEY", "phc_key");

		getCliFeatureFlagsService();

		expect(mocks.PostHogFeatureFlagsProvider).toHaveBeenCalledTimes(1);
		expect(mocks.buildClinePostHogClient).toHaveBeenCalledWith("phc_key");
		expect(mocks.featureFlagsServiceOptions).toHaveBeenCalledWith(
			expect.objectContaining({ cacheFilePath: expect.any(String) }),
		);
	});
});
