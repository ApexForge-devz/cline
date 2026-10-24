import assert from "node:assert/strict";
import test from "node:test";
import { telemetrySecretDefineValues } from "./telemetry-build-env.mjs";

test("ordinary builds do not configure upstream telemetry credentials or hosts", () => {
	const defines = telemetrySecretDefineValues({});
	assert.equal(defines["process.env.TELEMETRY_SERVICE_API_KEY"], "undefined");
	assert.equal(defines["process.env.ERROR_SERVICE_API_KEY"], "undefined");
	assert.equal(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"], '""');
	assert.equal(defines["process.env.ENABLE_ERROR_AUTOCAPTURE"], '""');
	assert.equal(defines["process.env.CLINE_TELEMETRY_HOST"], '""');
});

test("credentials are rejected by default", () => {
	for (const name of [
		"TELEMETRY_SERVICE_API_KEY",
		"ERROR_SERVICE_API_KEY",
		"OTEL_EXPORTER_OTLP_HEADERS",
	]) {
		assert.throws(() => telemetrySecretDefineValues({ [name]: "secret-value" }), /Refusing to embed telemetry credentials/);
	}
});

test("CI refuses embedded credentials even with explicit opt-in", () => {
	assert.throws(
		() => telemetrySecretDefineValues({
			CI: "true",
			CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
			CLINE_TELEMETRY_HOST: "https://telemetry.example.test",
			TELEMETRY_SERVICE_API_KEY: "private-key",
		}),
		/Refusing to embed telemetry credentials in CI/,
	);
});

test("private PostHog builds require an explicit host and warn on opt-in", () => {
	assert.throws(
		() => telemetrySecretDefineValues({
			CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
			TELEMETRY_SERVICE_API_KEY: "private-key",
		}),
		/explicit CLINE_TELEMETRY_HOST/,
	);
	const warnings = [];
	const defines = telemetrySecretDefineValues({
		CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
		CLINE_TELEMETRY_HOST: "https://telemetry.example.test",
		TELEMETRY_SERVICE_API_KEY: "private-key",
	}, (message) => warnings.push(message));
	assert.match(warnings[0], /compiled VS Code extension/);
	assert.equal(defines["process.env.TELEMETRY_SERVICE_API_KEY"], '"private-key"');
	assert.equal(defines["process.env.CLINE_TELEMETRY_HOST"], '"https://telemetry.example.test"');
});

test("OTLP headers require an explicit endpoint", () => {
	assert.throws(
		() => telemetrySecretDefineValues({
			CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
			OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=private-header",
		}),
		/explicit OTEL_EXPORTER_OTLP_ENDPOINT/,
	);
});
