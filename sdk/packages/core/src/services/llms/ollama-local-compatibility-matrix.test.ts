import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearPrivateModelsCatalogCache,
	clearPublicModelsCatalogCache,
	resolveProviderConfig,
} from "./provider-defaults";
import { toProviderConfig } from "./provider-settings";
import { composeAiSdkProviderOptions } from "@cline/llms/providers/routing/provider-options";
import type { GatewayProviderContext, GatewayStreamRequest } from "@cline/shared";

const FIXTURES = [
	{ id: "fixture-text", capabilities: ["completion"] },
	{ id: "fixture-tools", capabilities: ["completion", "tools"] },
	{ id: "fixture-thinking", capabilities: ["completion", "thinking"] },
	{ id: "fixture-vision", capabilities: ["completion", "vision"] },
	{ id: "fixture-vision-tools", capabilities: ["completion", "vision", "tools"] },
	{ id: "fixture-vision-thinking", capabilities: ["completion", "vision", "thinking"] },
	{ id: "fixture-all", capabilities: ["completion", "vision", "tools", "thinking"] },
	{ id: "fixture-embedding", capabilities: ["embedding"] },
] as const;

function ollamaConfig(modelId = "fixture-text") {
	return {
		providerId: "ollama" as const,
		modelId,
		baseUrl: "http://127.0.0.1:11434",
	};
}

function requestFixtureServer() {
	const showById = new Map(
		FIXTURES.map((fixture, index) => [
			fixture.id,
			{
				capabilities: [...fixture.capabilities],
				model_info: { "fixture.context_length": 16_384 + index * 1_024 },
				...(fixture.capabilities.includes("thinking")
					? { thinking: { values: ["low", "high"] } }
					: {}),
			},
		]),
	);
	const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.endsWith("/api/tags")) {
			return Response.json({
				models: FIXTURES.map((fixture) => ({
					name: fixture.id,
					model: fixture.id,
					digest: `digest-${fixture.id}`,
				})),
			});
		}
		if (url.endsWith("/api/show")) {
			const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
			const show = showById.get(body.model ?? "");
			if (!show) return new Response("not found", { status: 404 });
			return Response.json(show);
		}
		return new Response("not found", { status: 404 });
	});
	return fetchMock;
}

describe("local Ollama compatibility matrix", () => {
	afterEach(() => {
		clearPublicModelsCatalogCache();
		clearPrivateModelsCatalogCache();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each(FIXTURES.slice(0, -1))("classifies $id from native capabilities", async (fixture) => {
		const fetchMock = requestFixtureServer();
		vi.stubGlobal("fetch", fetchMock);
		const resolved = await resolveProviderConfig(
			"ollama",
			{ failOnError: true, cacheTtlMs: 60_000 },
			ollamaConfig(fixture.id),
		);
		const model = resolved?.knownModels?.[fixture.id];
		expect(model).toBeDefined();
		expect(model?.modalities?.input).toEqual(
		fixture.capabilities.includes("vision") ? ["text", "image"] : ["text"],
		);
		expect(model?.capabilities).toContain("streaming");
		expect(model?.capabilities?.includes("images")).toBe(
			fixture.capabilities.includes("vision"),
		);
		expect(model?.capabilities?.includes("tools")).toBe(
			fixture.capabilities.includes("tools"),
		);
		expect(model?.capabilities?.includes("reasoning")).toBe(
			fixture.capabilities.includes("thinking"),
		);
	});

	it("filters embedding-only models without affecting generation models", async () => {
		const fetchMock = requestFixtureServer();
		vi.stubGlobal("fetch", fetchMock);
		const resolved = await resolveProviderConfig(
			"ollama",
			{ failOnError: true, cacheTtlMs: 60_000 },
			ollamaConfig(),
		);
		expect(resolved?.knownModels?.["fixture-embedding"]).toBeUndefined();
		expect(Object.keys(resolved?.knownModels ?? {})).toHaveLength(7);
	});

	it("retains unknown capability state when /api/show does not provide a contract", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL) => {
				const url = String(input);
				if (url.endsWith("/api/tags")) {
					return Response.json({ models: [{ name: "fixture-unknown", digest: "unknown-digest" }] });
				}
				return Response.json({ model_info: { "fixture.context_length": 24_576 } });
			}),
		);
		const resolved = await resolveProviderConfig(
			"ollama",
			{ failOnError: true, cacheTtlMs: 60_000 },
			ollamaConfig("fixture-unknown"),
		);
		const model = resolved?.knownModels?.["fixture-unknown"];
		expect(model?.capabilities).toBeUndefined();
		expect(model?.contextWindow).toBe(24_576);
	});

	it("reuses /api/show results for unchanged model digests", async () => {
		const fetchMock = requestFixtureServer();
		vi.stubGlobal("fetch", fetchMock);
		await resolveProviderConfig("ollama", { failOnError: true, cacheTtlMs: 60_000 }, ollamaConfig());
		const firstCalls = fetchMock.mock.calls.length;
		await resolveProviderConfig("ollama", { failOnError: true, cacheTtlMs: 60_000 }, ollamaConfig());
		expect(fetchMock.mock.calls.length).toBe(firstCalls);
	});

	it("propagates local context and native generation settings without changing provider-neutral semantics", () => {
		const providerConfig = toProviderConfig({
			provider: "ollama",
			model: "fixture-all",
			contextWindow: 32_768,
			timeout: 600_000,
			ollamaGeneration: {
				temperature: 0.2,
				topP: 0.95,
				topK: 40,
				minP: 0.05,
				repeatPenalty: 1.1,
				repeatLastN: 128,
				seed: 42,
				stop: ["<end>"],
				keepAlive: "5m",
			},
		});
		const request = {
			providerId: "ollama",
			model: "fixture-all",
			contextWindow: 32_768,
			maxTokens: 4_096,
		} as GatewayStreamRequest;
		const context = {
			provider: { id: "ollama", name: "Ollama", models: [] },
			model: { id: "fixture-all", name: "fixture-all", providerId: "ollama" },
			config: providerConfig,
		} as unknown as GatewayProviderContext;
		const options = composeAiSdkProviderOptions(request, context);
		expect(options.ollama).toMatchObject({
			options: {
				num_ctx: 32_768,
				temperature: 0.2,
				top_p: 0.95,
				top_k: 40,
				min_p: 0.05,
				repeat_penalty: 1.1,
				repeat_last_n: 128,
				seed: 42,
				stop: ["<end>"],
				keep_alive: "5m",
			},
		});
	});
});
