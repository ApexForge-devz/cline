import { describe, expect, it, vi } from "vitest"
import { telemetrySecretDefineValues } from "./telemetry-build-env.mjs"

describe("telemetrySecretDefineValues", () => {
	it("disables upstream PostHog credentials and collector defaults in ordinary builds", () => {
		const defines = telemetrySecretDefineValues({})
		expect(defines["process.env.TELEMETRY_SERVICE_API_KEY"]).toBe("undefined")
		expect(defines["process.env.ERROR_SERVICE_API_KEY"]).toBe("undefined")
		expect(defines["process.env.OTEL_EXPORTER_OTLP_HEADERS"]).toBe('""')
		expect(defines["process.env.ENABLE_ERROR_AUTOCAPTURE"]).toBe('""')
		expect(defines["process.env.CLINE_TELEMETRY_HOST"]).toBe('""')
	})

	it.each(["TELEMETRY_SERVICE_API_KEY", "ERROR_SERVICE_API_KEY", "OTEL_EXPORTER_OTLP_HEADERS"])(
		"rejects embedding %s by default",
		(name) => {
			expect(() => telemetrySecretDefineValues({ [name]: "secret-value" })).toThrow(
				/Refusing to embed telemetry credentials/,
			)
		},
	)

	it("refuses telemetry credentials in CI even with explicit opt-in", () => {
		expect(() =>
			telemetrySecretDefineValues({
				CI: "true",
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				CLINE_TELEMETRY_HOST: "https://telemetry.example.test",
				TELEMETRY_SERVICE_API_KEY: "private-key",
			}),
		).toThrow(/Refusing to embed telemetry credentials in CI/)
	})

	it("requires an explicit collector and warns for a private local PostHog build", () => {
		const warn = vi.fn()
		expect(() =>
			telemetrySecretDefineValues({
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				TELEMETRY_SERVICE_API_KEY: "private-key",
			}),
		).toThrow(/explicit CLINE_TELEMETRY_HOST/)

		const defines = telemetrySecretDefineValues(
			{
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				CLINE_TELEMETRY_HOST: "https://telemetry.example.test",
				TELEMETRY_SERVICE_API_KEY: "private-key",
			},
			warn,
		)
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("compiled VS Code extension"))
		expect(defines["process.env.TELEMETRY_SERVICE_API_KEY"]).toBe('"private-key"')
		expect(defines["process.env.CLINE_TELEMETRY_HOST"]).toBe('"https://telemetry.example.test"')
	})

	it("requires an explicit OTLP endpoint before embedding OTLP headers", () => {
		expect(() =>
			telemetrySecretDefineValues({
				CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS: "1",
				OTEL_EXPORTER_OTLP_HEADERS: "x-api-key=private-header",
			}),
		).toThrow(/requires an explicit OTEL_EXPORTER_OTLP_ENDPOINT/)
	})
})
