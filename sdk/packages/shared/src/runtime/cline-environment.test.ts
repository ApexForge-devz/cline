import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	CLINE_CLOUD_SERVICES_ENABLED_ENV,
	CLINE_ENVIRONMENT_ENV,
	CLINE_ENVIRONMENT_OVERRIDE_ENV,
	CLINE_ENVIRONMENTS,
	DEFAULT_CLINE_ENVIRONMENT,
	getClineEnvironmentConfig,
	resolveClineEnvironment,
} from "./cline-environment";

const ENV_KEYS = [
	CLINE_ENVIRONMENT_ENV,
	CLINE_ENVIRONMENT_OVERRIDE_ENV,
	CLINE_CLOUD_SERVICES_ENABLED_ENV,
	"CLINE_API_BASE_URL",
] as const;

const originalEnvValues = Object.fromEntries(
	ENV_KEYS.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
	vi.unstubAllGlobals();
	for (const key of ENV_KEYS) {
		delete process.env[key];
	}
});

afterEach(() => {
	vi.unstubAllGlobals();
	for (const key of ENV_KEYS) {
		const value = originalEnvValues[key];
		if (typeof value === "string") {
			process.env[key] = value;
		} else {
			delete process.env[key];
		}
	}
});

describe("resolveClineEnvironment", () => {
	it("defaults to local and never selects a cloud environment without opt-in", () => {
		expect(DEFAULT_CLINE_ENVIRONMENT).toBe("local");
		expect(resolveClineEnvironment()).toBe("local");
		process.env[CLINE_ENVIRONMENT_ENV] = "production";
		expect(resolveClineEnvironment()).toBe("local");
	});

	it("allows cloud environments only with explicit opt-in", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		expect(resolveClineEnvironment()).toBe("production");
	});

	it("reads CLINE_ENVIRONMENT from process.env when cloud services are enabled", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		process.env[CLINE_ENVIRONMENT_ENV] = "staging";
		expect(resolveClineEnvironment()).toBe("staging");

		process.env[CLINE_ENVIRONMENT_ENV] = "local";
		expect(resolveClineEnvironment()).toBe("local");
	});

	it("prefers CLINE_ENVIRONMENT_OVERRIDE over CLINE_ENVIRONMENT when enabled", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		process.env[CLINE_ENVIRONMENT_OVERRIDE_ENV] = "local";
		process.env[CLINE_ENVIRONMENT_ENV] = "staging";

		expect(resolveClineEnvironment()).toBe("local");
	});

	it("normalizes case and surrounding whitespace", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		process.env[CLINE_ENVIRONMENT_ENV] = "  STAGING  ";

		expect(resolveClineEnvironment()).toBe("staging");
	});

	it("ignores unknown values and falls through to the next source", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		process.env[CLINE_ENVIRONMENT_OVERRIDE_ENV] = "qa";
		process.env[CLINE_ENVIRONMENT_ENV] = "staging";
		expect(resolveClineEnvironment()).toBe("staging");

		delete process.env[CLINE_ENVIRONMENT_OVERRIDE_ENV];
		process.env[CLINE_ENVIRONMENT_ENV] = "qa";
		expect(resolveClineEnvironment()).toBe(DEFAULT_CLINE_ENVIRONMENT);
	});

	it("defaults to local when process is unavailable", () => {
		vi.stubGlobal("process", undefined);

		expect(resolveClineEnvironment()).toBe("local");
	});
});

describe("getClineEnvironmentConfig", () => {
	it("returns the config for an explicit environment when cloud services are enabled", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		expect(getClineEnvironmentConfig("staging")).toBe(
			CLINE_ENVIRONMENTS.staging,
		);
		expect(getClineEnvironmentConfig("local")).toBe(CLINE_ENVIRONMENTS.local);
		expect(getClineEnvironmentConfig("production")).toBe(
			CLINE_ENVIRONMENTS.production,
		);
	});

	it("falls back to local by default", () => {
		expect(getClineEnvironmentConfig()).toBe(CLINE_ENVIRONMENTS.local);
	});

	it("uses the resolved process.env environment when cloud services are enabled", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		process.env[CLINE_ENVIRONMENT_ENV] = "staging";

		expect(getClineEnvironmentConfig()).toBe(CLINE_ENVIRONMENTS.staging);
	});

	it("applies CLINE_API_BASE_URL only when cloud services are explicitly enabled", () => {
		process.env[CLINE_CLOUD_SERVICES_ENABLED_ENV] = "1";
		process.env.CLINE_API_BASE_URL = "http://127.0.0.1:3000";

		expect(getClineEnvironmentConfig("local")).toEqual({
			...CLINE_ENVIRONMENTS.local,
			apiBaseUrl: "http://127.0.0.1:3000",
			mcpBaseUrl: "http://127.0.0.1:3000/v1/mcp",
		});
		expect(CLINE_ENVIRONMENTS.local.apiBaseUrl).toBe("http://localhost:7777");
	});

	it("defaults to local when process is unavailable", () => {
		vi.stubGlobal("process", undefined);

		expect(getClineEnvironmentConfig()).toBe(CLINE_ENVIRONMENTS.local);
	});
});

describe("CLINE_ENVIRONMENTS catalog", () => {
	it("exposes an environment field that matches its key", () => {
		for (const [key, config] of Object.entries(CLINE_ENVIRONMENTS)) {
			expect(config.environment).toBe(key);
		}
	});

	it("populates appBaseUrl, apiBaseUrl, and mcpBaseUrl for every environment", () => {
		for (const config of Object.values(CLINE_ENVIRONMENTS)) {
			expect(config.appBaseUrl).toMatch(/^https?:\/\//);
			expect(config.apiBaseUrl).toMatch(/^https?:\/\//);
			expect(config.mcpBaseUrl).toMatch(/^https?:\/\//);
		}
	});
});
