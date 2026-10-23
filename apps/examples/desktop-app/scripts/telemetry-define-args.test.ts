import { afterEach, describe, expect, it, vi } from "vitest";
import { telemetryDefineArgs } from "./telemetry-define-args";

function defineMap(args: string[]): Record<string, string> {
	const map: Record<string, string> = {};
	for (let index = 0; index < args.length; index += 2) {
		expect(args[index]).toBe("--define");
		const pair = args[index + 1];
		const separator = pair.indexOf("=");
		map[pair.slice(0, separator)] = pair.slice(separator + 1);
	}
	return map;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("telemetryDefineArgs", () => {
	it("inlines non-secret OTEL configuration and empty defaults", () => {
		const defines = defineMap(
			telemetryDefineArgs({
				OTEL_TELEMETRY_ENABLED: "1",
				OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com:4318",
				OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
				OTEL_LOGS_EXPORTER: "otlp",
				OTEL_METRICS_EXPORTER: "otlp",
				OTEL_TRACES_EXPORTER: "otlp",
				OTEL_METRIC_EXPORT_INTERVAL: "60000",
			}),
		);
		expect(defines["process.env.OTEL_TELEMETRY_ENABLED"]).toBe('"1"');
		expect(defines["process.env.OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe(
			'"https://otel.example.com:4318"',
		);
		expect(defines["process.env.OTEL_EXPORTER_OTLP_PROTOCOL"]).toBe('"http/json"');
		expect(defines["process.env.OTEL_LOGS_EXPORTER"]).toBe('"otlp"');
		expect(defines["process.env.OTEL_METRICS_EXPORTER"]).toBe('"otlp"');
		expect(defines["process.env.OTEL_TRACES_EXPORTER"]).toBe('"otlp"');
		expect(defines["process.env.OTEL_METRIC_EXPORT_INTERVAL"]).toBe('"60000"');
		expect(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"]).toBe('""');
	});

	it("refuses to embed service API keys by default", () => {
		expect(() =>
			telemetryDefineArgs({ TELEMETRY_SERVICE_API_KEY: "tk" }),
		).toThrow(/Refusing to embed telemetry credentials/);
		expect(() =>
			telemetryDefineArgs({ ERROR_SERVICE_API_KEY: "ek" }),
		).toThrow(/CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS=1/);
	});

	it("refuses to embed OTLP headers that may contain credentials by default", () => {
		expect(() =>
			telemetryDefineArgs({ OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=secret" }),
		).toThrow(/OTEL_EXPORTER_OTLP_HEADERS/);
	});

	it("rejects credential embedding in CI even when the local opt-in is set", () => {
		expect(() =>
			telemetryDefineArgs({
				CI: "true",
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				TELEMETRY_SERVICE_API_KEY: "tk",
			}),
		).toThrow(/Refusing to embed telemetry credentials in CI/);
	});
	it("allows explicit secret embedding only with a warning for private dogfood builds", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const defines = defineMap(
			telemetryDefineArgs({
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				TELEMETRY_SERVICE_API_KEY: "tk",
				ERROR_SERVICE_API_KEY: "ek",
				OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=secret",
			}),
		);
		expect(defines["process.env.TELEMETRY_SERVICE_API_KEY"]).toBe('"tk"');
		expect(defines["process.env.ERROR_SERVICE_API_KEY"]).toBe('"ek"');
		expect(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"]).toBe('"x-api-key=secret"');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("Anyone with the binary"));
	});

	it("inlines the cloud-agents toggle only when set at build time", () => {
		const withoutToggle = defineMap(telemetryDefineArgs({}));
		expect(withoutToggle).not.toHaveProperty("process.env.CLINE_CODE_CLOUD_AGENTS");

		const withToggle = defineMap(
			telemetryDefineArgs({ CLINE_CODE_CLOUD_AGENTS: "1" }),
		);
		expect(withToggle["process.env.CLINE_CODE_CLOUD_AGENTS"]).toBe('"1"');
	});

	it("JSON-escapes header values when private-build opt-in is enabled", () => {
		const value = 'x-quote="quoted",y=2';
		const defines = defineMap(
			telemetryDefineArgs({
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				OTEL_EXPORTER_OTLP_HEADERS: value,
			}),
		);
		expect(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"]).toBe(JSON.stringify(value));
		expect(JSON.parse(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"])).toBe(value);
	});
});
