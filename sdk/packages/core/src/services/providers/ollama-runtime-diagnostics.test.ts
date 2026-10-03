import { describe, expect, it, vi } from "vitest";
import { getOllamaRuntimeDiagnostics } from "./ollama-runtime-diagnostics";

describe("getOllamaRuntimeDiagnostics", () => {
	it("reads version and running-model memory/context data concurrently", async () => {
		const calls: string[] = [];
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			calls.push(url);
			if (url.endsWith("/api/version")) {
				return new Response(JSON.stringify({ version: "0.12.3" }), { status: 200 });
			}
			return new Response(
				JSON.stringify({
					models: [
						{
							name: "example:latest",
							size: 8_000_000_000,
							size_vram: 6_000_000_000,
							context_length: 32_768,
							digest: "sha256:test",
						},
					],
				}),
				{ status: 200 },
			);
		});
		const result = await getOllamaRuntimeDiagnostics("http://localhost:11434/", {
			fetchImpl: fetchImpl as typeof fetch,
		});
			expect(result.baseUrl).toBe("http://localhost:11434");
		expect(result.version).toBe("0.12.3");
		expect(result.models[0]).toMatchObject({
		name: "example:latest",
		sizeVram: 6_000_000_000,
		contextLength: 32_768,
	});
		expect(calls).toHaveLength(2);
	});

	it("does not fail when one diagnostics endpoint is unavailable", async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.endsWith("/api/version")) throw new Error("version unavailable");
			return new Response(JSON.stringify({ models: [] }), { status: 200 });
		});
		const result = await getOllamaRuntimeDiagnostics("http://127.0.0.1:11434", {
			fetchImpl: fetchImpl as typeof fetch,
		});
		expect(result.version).toBeNull();
		expect(result.models).toEqual([]);
	});
});
