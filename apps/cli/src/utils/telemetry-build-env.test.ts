import { afterEach, describe, expect, it, vi } from "vitest";
import { telemetryDefineValues } from "./telemetry-build-env";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("telemetryDefineValues", () => {
	it("inlines non-secret telemetry settings and empty defaults", () => {
		const defines = telemetryDefineValues({
			OTEL_TELEMETRY_ENABLED: "1",
			OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com:4318",
			OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
			OTEL_LOGS_EXPORTER: "otlp",
			OTEL_METRICS_EXPORTER: "otlp",
			OTEL_TRACES_EXPORTER: "otlp",
			CLINE_TRACE_SAMPLE_PERCENT: "25",
			OTEL_EXTRA_SECRET: "must-not-be-inlined",
		});

		expect(defines["process.env.OTEL_TELEMETRY_ENABLED"]).toBe('"1"');
		expect(defines["process.env.OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe(
			'"https://otel.example.com:4318"',
		);
		expect(defines["process.env.OTEL_EXPORTER_OTLP_PROTOCOL"]).toBe('"http/json"');
		expect(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"]).toBe('""');
		expect(defines["process.env.CLINE_TRACE_SAMPLE_PERCENT"]).toBe('"25"');
		expect(defines["process.env.CLINE_TRACE_RECORD_CONTENT"]).toBe('"false"');
		expect(defines).not.toHaveProperty("process.env.OTEL_EXTRA_SECRET");
	});

 	it("refuses trace content recording without a dedicated opt-in", () => {
		expect(() =>
			telemetryDefineValues({ CLINE_TRACE_RECORD_CONTENT: "true" }),
		).toThrow(/Refusing to enable trace content recording/);
		expect(
			telemetryDefineValues({ CLINE_TRACE_RECORD_CONTENT: "false" })[
				"process.env.CLINE_TRACE_RECORD_CONTENT"
			],
		).toBe('"false"');
	});

	it("refuses trace content recording in CI even with local opt-in", () => {
		expect(() =>
			telemetryDefineValues({
				CI: "true",
				CLINE_ALLOW_TRACE_CONTENT_RECORDING: "1",
				CLINE_TRACE_RECORD_CONTENT: "true",
			}),
		).toThrow(/Refusing to enable trace content recording in CI/);
	});

	it("allows trace content recording only in an opted-in private build", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const defines = telemetryDefineValues({
			CLINE_ALLOW_TRACE_CONTENT_RECORDING: "1",
			CLINE_TRACE_RECORD_CONTENT: "true",
		});
		expect(defines["process.env.CLINE_TRACE_RECORD_CONTENT"]).toBe('"true"');
		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("trace content recording is enabled"),
		);
	});

	it.each([
		"TELEMETRY_SERVICE_API_KEY",
		"ERROR_SERVICE_API_KEY",
		"OTEL_EXPORTER_OTLP_HEADERS",
	])("refuses to embed %s by default", (name) => {
		expect(() =>
			telemetryDefineValues({ [name]: "secret-value" }),
		).toThrow(/Refusing to embed telemetry credentials/);
	});

	it("refuses credential embedding in CI even with explicit opt-in", () => {
		expect(() =>
			telemetryDefineValues({
				CI: "true",
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				TELEMETRY_SERVICE_API_KEY: "secret-value",
			}),
		).toThrow(/Refusing to embed telemetry credentials in CI/);
	});

	it("allows explicit private-build opt-in with a warning", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const defines = telemetryDefineValues({
			CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
			TELEMETRY_SERVICE_API_KEY: "private-key",
			OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=private-header",
		});

		expect(warn).toHaveBeenCalledWith(
			expect.stringContaining("compiled CLI binary"),
		);
		expect(defines["process.env.TELEMETRY_SERVICE_API_KEY"]).toBe(
			'"private-key"',
		);
		expect(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"]).toBe(
			'"x-api-key=private-header"',
		);
	});
});
