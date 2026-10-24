import { describe, expect, it } from "bun:test"
import { hasExplicitPostHogHost } from "./posthog-config"

describe("hasExplicitPostHogHost", () => {
	it("accepts explicit HTTPS collector URLs and local HTTP endpoints", () => {
		expect(hasExplicitPostHogHost("https://telemetry.example.test/v1/")).toBe(true)
		expect(hasExplicitPostHogHost("http://127.0.0.1:4318")).toBe(true)
	})

	it("rejects empty, malformed, and non-HTTP(S) endpoints", () => {
		expect(hasExplicitPostHogHost(undefined)).toBe(false)
		expect(hasExplicitPostHogHost("")).toBe(false)
		expect(hasExplicitPostHogHost("   ")).toBe(false)
		expect(hasExplicitPostHogHost("not a url")).toBe(false)
		expect(hasExplicitPostHogHost("ftp://telemetry.example.test")).toBe(false)
		expect(hasExplicitPostHogHost("data:text/plain,hello")).toBe(false)
	})
})
