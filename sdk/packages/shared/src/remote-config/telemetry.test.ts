import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RemoteConfigBundle } from "./bundle";
import {
	DefaultRemoteConfigTelemetryAdapter,
	REMOTE_TELEMETRY_OPT_IN_ENV,
	normalizeBundleTelemetry,
	resolveOpenTelemetryConfigFromRemoteConfig,
} from "./telemetry";

const previousOptIn = process.env[REMOTE_TELEMETRY_OPT_IN_ENV];

const remoteConfig = {
	version: "v1",
	openTelemetryEnabled: true,
	openTelemetryOtlpEndpoint: "https://collector.example.test/v1",
	openTelemetryOtlpHeaders: { authorization: "Bearer remote-secret" },
};

const bundle: RemoteConfigBundle = {
	source: "test-control-plane",
	version: "1",
	remoteConfig,
	telemetry: {
		enabled: true,
		otlpEndpoint: "https://collector.example.test/v1",
		otlpHeaders: { authorization: "Bearer remote-secret" },
	},
};

describe("remote-config telemetry opt-in", () => {
	beforeEach(() => {
		delete process.env[REMOTE_TELEMETRY_OPT_IN_ENV];
	});

	afterEach(() => {
		if (previousOptIn === undefined) {
			delete process.env[REMOTE_TELEMETRY_OPT_IN_ENV];
		} else {
			process.env[REMOTE_TELEMETRY_OPT_IN_ENV] = previousOptIn;
		}
	});

	it("ignores remote collector configuration by default", () => {
		expect(resolveOpenTelemetryConfigFromRemoteConfig(remoteConfig)).toBeUndefined();
		expect(normalizeBundleTelemetry(bundle.telemetry)).toBeUndefined();
		expect(new DefaultRemoteConfigTelemetryAdapter().resolveTelemetry(
			bundle,
			{ workspacePath: "/tmp/remote-telemetry-test" },
		)).toBeUndefined();
	});

	it("requires the exact explicit opt-in value", () => {
		process.env[REMOTE_TELEMETRY_OPT_IN_ENV] = "true";
		expect(resolveOpenTelemetryConfigFromRemoteConfig(remoteConfig)).toBeUndefined();
	});

	it("accepts remote telemetry settings when explicitly opted in", () => {
		process.env[REMOTE_TELEMETRY_OPT_IN_ENV] = "1";
		expect(resolveOpenTelemetryConfigFromRemoteConfig(remoteConfig)).toMatchObject({
			enabled: true,
			otlpEndpoint: "https://collector.example.test/v1",
			otlpHeaders: { authorization: "Bearer remote-secret" },
		});
		expect(normalizeBundleTelemetry(bundle.telemetry)).toMatchObject({
			enabled: true,
			otlpEndpoint: "https://collector.example.test/v1",
			otlpHeaders: { authorization: "Bearer remote-secret" },
		});
		expect(new DefaultRemoteConfigTelemetryAdapter().resolveTelemetry(
			bundle,
			{ workspacePath: "/tmp/remote-telemetry-test" },
		)).toMatchObject({ enabled: true });
	});
});
