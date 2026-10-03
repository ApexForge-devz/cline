import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clearLiveModelsCatalogCache,
	clearPrivateModelsCatalogCache,
	clearPublicModelsCatalogCache,
	getLiveModelsCatalog,
	getProviderConfig,
	isPrivateModelCatalogProvider,
	resolveProviderConfig,
} from "./provider-defaults";

afterEach(() => {
	clearLiveModelsCatalogCache();
	clearPrivateModelsCatalogCache();
	clearPublicModelsCatalogCache();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("isPrivateModelCatalogProvider", () => {
	it.each([
		"baseten",
		"hicap",
		"litellm",
		"poolside",
	])("recognizes %s as an endpoint-specific catalog provider", (providerId) => {
		expect(isPrivateModelCatalogProvider(providerId)).toBe(true);
	});

	it.each([
		"openrouter",
		"requesty",
		"anthropic",
	])("does not classify %s as endpoint-specific", (providerId) => {
		expect(isPrivateModelCatalogProvider(providerId)).toBe(false);
	});
});

describe("live catalog request bounds", () => {
	it("aborts stalled sources and returns a fallback catalog", async () => {
		const controllers: AbortController[] = [];
		const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
			const controller = new AbortController();
			controllers.push(controller);
			return controller.signal;
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_input, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener(
							"abort",
							() => reject(init.signal?.reason),
							{ once: true },
						);
					}),
			),
		);
		const pending = getLiveModelsCatalog();
		expect(controllers.length).toBeGreaterThan(0);
		expect(timeout).toHaveBeenCalledWith(5_000);
		for (const controller of controllers) controller.abort();
		await expect(pending).resolves.toEqual({});
	});

	it("refreshes the shared feed after its cache expires", async () => {
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
		const fetchMock = vi.fn(async () => Response.json({}));
		vi.stubGlobal("fetch", fetchMock);
		await getLiveModelsCatalog({ cacheTtlMs: 100 });
		await getLiveModelsCatalog({ cacheTtlMs: 100 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		now.mockReturnValue(1_101);
		await getLiveModelsCatalog({ cacheTtlMs: 100 });
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});
});

describe("resolveProviderConfig", () => {
	it("returns bundled models for built-in providers without a base URL", async () => {
		const resolved = await resolveProviderConfig("bedrock");

		expect(resolved?.baseUrl).toBeUndefined();
		expect(resolved?.modelId).toBe("minimax.minimax-m2.5");
		expect(resolved?.knownModels?.["amazon.nova-2-lite-v1:0"]?.name).toBe(
			"Nova 2 Lite",
		);
		expect(Object.keys(resolved?.knownModels ?? {}).length).toBeGreaterThan(0);
	});

	it("uses catalog aliases when loading live models", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(
					JSON.stringify({
						openrouter: {
							models: {
								"vendor/live-only-model": {
									name: "Live Only Model",
									tool_call: true,
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}),
		);

		const resolved = await resolveProviderConfig("cline", {
			loadLatestOnInit: true,
			failOnError: false,
			cacheTtlMs: 0,
		});

		expect(resolved?.knownModels?.["vendor/live-only-model"]?.name).toBe(
			"Live Only Model",
		);
	});

	it("includes Cline Cloud models only for explicit cloud callers", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string | URL | Request) => {
				if (String(input) === "https://models.dev/api.json") {
					return new Response(JSON.stringify({}), { status: 200 });
				}
				return new Response(
					JSON.stringify({
						clineCloud: [
							{
								id: "cline-cloud/cloud-only",
								name: "Cloud Only",
							},
						],
					}),
					{ status: 200 },
				);
			}),
		);

		const local = await resolveProviderConfig("cline", {
			loadLatestOnInit: true,
			failOnError: false,
		});
		const cloud = await resolveProviderConfig("cline", {
			loadLatestOnInit: true,
			includeClineCloudModels: true,
			failOnError: false,
		});

		expect(local?.knownModels).not.toHaveProperty("cline-cloud/cloud-only");
		expect(cloud?.knownModels).toHaveProperty("cline-cloud/cloud-only");
	});

	it("filters image-output models from the merged Cline catalog", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(
					JSON.stringify({
						openrouter: {
							models: {
								"vendor/live-chat-model": {
									name: "Live Chat Model",
									tool_call: true,
								},
								"vendor/live-image-model": {
									name: "Live Image Model",
									tool_call: true,
									modalities: {
										input: ["text", "image"],
										output: ["text", "image"],
									},
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}),
		);

		const resolved = await resolveProviderConfig(
			"cline",
			{
				loadLatestOnInit: true,
				failOnError: false,
				cacheTtlMs: 0,
			},
			{
				providerId: "cline",
				modelId: "vendor/live-chat-model",
				knownModels: {
					"vendor/custom-image-model": {
						id: "vendor/custom-image-model",
						name: "Custom Image Model",
						modalities: {
							input: ["text"],
							output: ["image"],
						},
					},
					"vendor/custom-image-operation-model": {
						id: "vendor/custom-image-operation-model",
						name: "Custom Image Operation Model",
						operation: "image-generation",
					},
				},
			},
		);

		expect(resolved?.knownModels?.["vendor/live-chat-model"]?.name).toBe(
			"Live Chat Model",
		);
		expect(resolved?.knownModels?.["vendor/live-image-model"]).toBeUndefined();
		expect(
			resolved?.knownModels?.["vendor/custom-image-model"],
		).toBeUndefined();
		expect(
			resolved?.knownModels?.["vendor/custom-image-operation-model"],
		).toBeUndefined();
	});

	it("uses only live Cline recommended models for ClinePass when live models are found", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url === "https://models.test/api.json") {
				return new Response(
					JSON.stringify({
						openrouter: {
							models: {
								"vendor/live-pass-model": {
									name: "Live Pass Model",
									tool_call: true,
									reasoning: true,
									limit: { context: 256_000, input: 200_000, output: 32_000 },
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			return new Response(
				JSON.stringify({
					clinePass: [
						{
							id: "cline-pass/live-pass-model",
							name: "vendor/live-pass-model",
						},
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig("cline-pass", {
			loadLatestOnInit: true,
			failOnError: false,
			cacheTtlMs: 0,
			url: "https://models.test/api.json",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(resolved?.knownModels?.["cline-pass/live-pass-model"]).toMatchObject(
			{
				id: "cline-pass/live-pass-model",
				name: "Live Pass Model",
				contextWindow: 256_000,
				maxInputTokens: 200_000,
				maxTokens: 32_000,
			},
		);
		expect(resolved?.knownModels?.["cline-pass/mimo-v2.5-pro"]).toBeUndefined();
	});

	it("keeps ClinePass models ahead of newer free models in the served catalog", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url === "https://models.test/api.json") {
				return new Response(
					JSON.stringify({
						openrouter: {
							models: {
								"vendor/live-pass-model": {
									name: "Live Pass Model",
									tool_call: true,
									release_date: "2024-01-01",
								},
								"vendor/live-free-model": {
									name: "Live Free Model",
									tool_call: true,
									release_date: "2026-01-01",
									cost: {
										input: 1,
										output: 2,
										cache_read: 0.1,
										cache_write: 0.2,
									},
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			return new Response(
				JSON.stringify({
					clinePass: [
						{
							id: "cline-pass/live-pass-model",
							name: "vendor/live-pass-model",
						},
					],
					free: [{ id: "cline-free/live-free-model" }],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig("cline-pass", {
			loadLatestOnInit: true,
			failOnError: false,
			cacheTtlMs: 0,
			url: "https://models.test/api.json",
		});

		// The first live model is the fallback default when the bundled default
		// id is not in the live list, so a subscription model must stay first
		// even when a free model has a newer release date.
		expect(Object.keys(resolved?.knownModels ?? {})).toEqual([
			"cline-pass/live-pass-model",
			"cline-free/live-free-model",
		]);
		expect(resolved?.knownModels?.["cline-free/live-free-model"]).toMatchObject(
			{
				id: "cline-free/live-free-model",
				name: "Live Free Model (free)",
			},
		);
		expect(
			resolved?.knownModels?.["cline-free/live-free-model"]?.pricing,
		).toEqual({
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
		});
	});

	it("adds cline-free models from the recommended endpoint to the Cline catalog", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url === "https://models.test/api.json") {
				return new Response(
					JSON.stringify({
						openrouter: {
							models: {
								"vendor/live-free-model": {
									name: "Live Free Model",
									tool_call: true,
									reasoning: true,
									limit: { context: 300_000, input: 250_000, output: 64_000 },
									cost: {
										input: 1,
										output: 2,
										cache_read: 0.1,
										cache_write: 0.2,
									},
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			return new Response(
				JSON.stringify({
					free: [
						{
							id: "cline-free/live-free-model",
						},
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig("cline", {
			loadLatestOnInit: true,
			failOnError: false,
			cacheTtlMs: 0,
			url: "https://models.test/api.json",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(resolved?.knownModels?.["cline-free/live-free-model"]).toMatchObject(
			{
				id: "cline-free/live-free-model",
				name: "Live Free Model (free)",
				contextWindow: 300_000,
				maxInputTokens: 250_000,
				maxTokens: 64_000,
				pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			},
		);
	});

	it("falls back to generated ClinePass models when no live ClinePass models are found", async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (url === "https://models.test/api.json") {
				return new Response(
					JSON.stringify({
						openrouter: {
							models: {
								"vendor/live-openrouter-model": {
									name: "Live OpenRouter Model",
									tool_call: true,
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}

			return new Response(JSON.stringify({ clinePass: [] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig("cline-pass", {
			loadLatestOnInit: true,
			failOnError: false,
			cacheTtlMs: 0,
			url: "https://models.test/api.json",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(resolved?.knownModels?.["cline-pass/mimo-v2.5-pro"]?.name).toBe(
			"MiMo-V2.5-Pro",
		);
		expect(
			resolved?.knownModels?.["vendor/live-openrouter-model"],
		).toBeUndefined();
	});

	it("prefers Vercel-style Z.ai ids in Cline known models", async () => {
		const resolved = await resolveProviderConfig("cline");

		expect(resolved?.knownModels?.["zai/glm-5.2"]).toMatchObject({
			id: "zai/glm-5.2",
			name: "GLM 5.2",
			contextWindow: 1_000_000,
			maxInputTokens: 1_000_000,
		});
		expect(resolved?.knownModels?.["z-ai/glm-5.2"]).toBeUndefined();
	});

	it("preserves explicit Cline known model overrides for alias ids", async () => {
		const resolved = await resolveProviderConfig("cline", undefined, {
			providerId: "cline",
			modelId: "z-ai/glm-5.2",
			knownModels: {
				"z-ai/glm-5.2": {
					id: "z-ai/glm-5.2",
					name: "Custom GLM 5.2",
					contextWindow: 123_456,
					maxInputTokens: 123_456,
				},
			},
		});

		expect(resolved?.knownModels?.["z-ai/glm-5.2"]).toMatchObject({
			id: "z-ai/glm-5.2",
			name: "Custom GLM 5.2",
			contextWindow: 123_456,
			maxInputTokens: 123_456,
		});
		expect(resolved?.knownModels?.["zai/glm-5.2"]).toMatchObject({
			id: "zai/glm-5.2",
			contextWindow: 1_000_000,
			maxInputTokens: 1_000_000,
		});
	});

	it("uses the live OpenAI catalog for ChatGPT subscription models", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				return new Response(
					JSON.stringify({
						openai: {
							models: {
								"gpt-5.6-live": {
									name: "GPT-5.6 Live",
									tool_call: true,
									reasoning: true,
									family: "gpt",
									release_date: "2027-01-01",
								},
								"gpt-5.3-live": {
									name: "GPT-5.3 Live",
									tool_call: true,
									reasoning: true,
									family: "gpt",
									release_date: "2027-01-02",
								},
								"gpt-5.4-nano": {
									name: "GPT-5.4 nano",
									tool_call: true,
									reasoning: true,
									family: "gpt-nano",
									release_date: "2027-01-03",
								},
								"o-live": {
									name: "o live",
									tool_call: true,
									reasoning: true,
									family: "o",
									release_date: "2027-01-04",
								},
							},
						},
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}),
		);

		const resolved = await resolveProviderConfig("openai-codex", {
			loadLatestOnInit: true,
			failOnError: false,
			cacheTtlMs: 0,
			url: "https://models.test/api.json",
		});

		expect(resolved?.knownModels?.["gpt-5.6-live"]?.name).toBe("GPT-5.6 Live");
		expect(resolved?.knownModels?.["gpt-5.3-live"]).toBeUndefined();
		expect(resolved?.knownModels?.["gpt-5.4-nano"]).toBeUndefined();
		expect(resolved?.knownModels?.["o-live"]).toBeUndefined();
	});

	it("authenticates live model sources and isolates cached catalogs by credentials", async () => {
		const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
			const headers = new Headers(init.headers);
			return new Response(
				JSON.stringify({
					models: [
						{
							name: `${headers.get("authorization")}:${headers.get("x-tenant")}`,
						},
					],
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);
		for (const [apiKey, tenant] of [
			["first", "a"],
			["second", "a"],
			["second", "b"],
		]) {
			const resolved = await resolveProviderConfig(
				"ollama",
				{ cacheTtlMs: 60_000 },
				{
					providerId: "ollama",
					modelId: "",
					baseUrl: "https://local.example/v1",
					apiKey,
					headers: { "X-Tenant": tenant },
				},
			);
			expect(Object.keys(resolved?.knownModels ?? {})).toEqual([
				`Bearer ${apiKey}:${tenant}`,
			]);
		}
		expect(fetchMock).toHaveBeenCalledTimes(6);
		const showCalls = fetchMock.mock.calls.filter(([input]) =>
			String(input).endsWith("/api/show"),
		);
		expect(showCalls).toHaveLength(3);
		expect(
			showCalls.map(([, init]) => {
				const headers = new Headers(init?.headers);
				return `${headers.get("authorization")}:${headers.get("x-tenant")}`;
			}),
		).toEqual(["Bearer first:a", "Bearer second:a", "Bearer second:b"]);
	});

	describe("Ollama model capability discovery", () => {
		it("does not advertise model-specific tools at provider level", () => {
			expect(getProviderConfig("ollama")?.capabilities).toBeUndefined();
		});

		it("derives model capabilities and limits from /api/show", async () => {
			const showPayloads: Record<string, Record<string, unknown>> = {
				"vision-tools-thinking": {
					capabilities: ["completion", "tools", "vision", "thinking"],
					thinking: { values: ["low", "high"] },
					model_info: { "llama.context_length": 65_536 },
				},
				"text-only": { capabilities: ["completion"] },
				"text-tools": { capabilities: ["completion", "tools"] },
				"vision-only": { capabilities: ["completion", "vision"] },
				"vision-thinking": {
					capabilities: ["completion", "vision", "thinking"],
				},
				embedding: { capabilities: ["embedding"] },
			};
			const tags = [
				{ name: "vision-tools-thinking", digest: "sha256:a" },
				{ name: "text-only", digest: "sha256:b" },
				{ model: "text-tools", digest: "sha256:c" },
				{ name: "vision-only", digest: "sha256:d" },
				{ name: "vision-thinking", digest: "sha256:e" },
				{ name: "embedding", digest: "sha256:f" },
			];
			const fetchMock = vi.fn(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const url = String(input);
					if (url.endsWith("/api/tags")) {
						return new Response(JSON.stringify({ models: tags }), { status: 200 });
					}
					const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
					return new Response(
						JSON.stringify(showPayloads[body.model ?? ""] ?? {}),
						{ status: 200 },
					);
				},
			);
			vi.stubGlobal("fetch", fetchMock);

			const resolved = await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{
					providerId: "ollama",
					modelId: "",
					baseUrl: "http://localhost:11434/v1",
				},
			);

			expect(fetchMock).toHaveBeenCalledTimes(7);
			const firstShowCall = fetchMock.mock.calls.find(([input]) =>
				String(input).endsWith("/api/show"),
			);
			expect(firstShowCall?.[1]?.method).toBe("POST");
			expect(
				new Headers(firstShowCall?.[1]?.headers).get("content-type"),
			).toBe("application/json");
			expect(
				JSON.parse(String(firstShowCall?.[1]?.body ?? "{}")),
			).toEqual(expect.objectContaining({ model: expect.any(String) }));
			expect(
				resolved?.knownModels?.["vision-tools-thinking"]?.capabilities,
			).toEqual(["streaming", "tools", "images", "reasoning"]);
			expect(
				resolved?.knownModels?.["vision-tools-thinking"]?.thinkingConfig,
			).toEqual({ thinkingLevel: "high" });
			expect(
				resolved?.knownModels?.["vision-tools-thinking"]?.modalities?.input,
			).toEqual(["text", "image"]);
			expect(
				resolved?.knownModels?.["vision-tools-thinking"]?.contextWindow,
			).toBe(65_536);
			expect(resolved?.knownModels?.["text-only"]?.capabilities).toEqual(["streaming"]);
			expect(resolved?.knownModels?.["text-tools"]?.capabilities).toEqual([
				"streaming",
				"tools",
			]);
			expect(resolved?.knownModels?.["vision-only"]?.capabilities).toEqual([
				"streaming",
				"images",
			]);
			expect(resolved?.knownModels?.["vision-thinking"]?.capabilities).toEqual([
				"streaming",
				"images",
				"reasoning",
			]);
			expect(resolved?.knownModels?.embedding).toBeUndefined();
		});

		it("does not trust incomplete /api/tags capabilities", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							models: [
								{
									name: "model",
									digest: "sha256:model",
									capabilities: ["completion"],
								},
							],
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							capabilities: ["completion", "vision", "tools"],
						}),
						{ status: 200 },
					),
				);
			vi.stubGlobal("fetch", fetchMock);

			const resolved = await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{
					providerId: "ollama",
					modelId: "",
					baseUrl: "http://localhost:11434/v1",
				},
			);

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(resolved?.knownModels?.model?.capabilities).toEqual([
				"streaming",
				"tools",
				"images",
			]);
		});

		it("handles malformed /api/show JSON without losing the installed model", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							models: [{ name: "malformed-model", digest: "sha256:bad-json" }],
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
			vi.stubGlobal("fetch", fetchMock);

			const resolved = await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{ providerId: "ollama", modelId: "", baseUrl: "http://localhost:11434" },
			);

			expect(
				resolved?.knownModels?.["malformed-model"]?.capabilities,
			).toBeUndefined();
		});

		it("applies the per-model /api/show timeout without failing the whole catalog", async () => {
			vi.useFakeTimers();
			const fetchMock = vi.fn(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const url = String(input);
					if (url.endsWith("/api/tags")) {
						return new Response(
							JSON.stringify({
								models: [{ name: "slow-model", digest: "sha256:slow" }],
							}),
							{ status: 200 },
						);
					}
					return new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener(
							"abort",
							() => reject(init.signal?.reason),
							{ once: true },
						);
					});
				},
			);
			vi.stubGlobal("fetch", fetchMock);

			const pending = resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{ providerId: "ollama", modelId: "", baseUrl: "http://localhost:11434" },
			);
			await vi.advanceTimersByTimeAsync(5_001);
			const resolved = await pending;

			expect(
				resolved?.knownModels?.["slow-model"]?.capabilities,
			).toBeUndefined();
		});

		it("keeps unknown capabilities unknown when /api/show is unavailable", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							models: [{ name: "unknown-model", digest: "sha256:unknown" }],
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(new Response("gateway timeout", { status: 504 }));
			vi.stubGlobal("fetch", fetchMock);

			const resolved = await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{ providerId: "ollama", modelId: "", baseUrl: "http://localhost:11434" },
			);

			expect(resolved?.knownModels?.["unknown-model"]).toEqual(
				expect.objectContaining({ id: "unknown-model", name: "unknown-model" }),
			);
			expect(
				resolved?.knownModels?.["unknown-model"]?.capabilities,
			).toBeUndefined();
			expect(
				resolved?.knownModels?.["unknown-model"]?.modalities,
			).toBeUndefined();
		});

		it("allows one model metadata request to fail without losing other models", async () => {
			const tags = [
				{ name: "good-vision", digest: "sha256:good" },
				{ name: "bad-model", digest: "sha256:bad" },
				{ name: "good-tools", digest: "sha256:tools" },
			];
			const fetchMock = vi.fn(
				async (input: RequestInfo | URL, init?: RequestInit) => {
					const url = String(input);
					if (url.endsWith("/api/tags")) {
						return new Response(JSON.stringify({ models: tags }), { status: 200 });
					}
					const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
					if (body.model === "bad-model") {
						return new Response("broken model", { status: 500 });
					}
					return new Response(
						JSON.stringify({
							capabilities:
								body.model === "good-vision"
									? ["completion", "vision", "thinking"]
									: ["completion", "tools"],
						}),
						{ status: 200 },
					);
				},
			);
			vi.stubGlobal("fetch", fetchMock);

			const resolved = await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{ providerId: "ollama", modelId: "", baseUrl: "http://localhost:11434" },
			);

			expect(resolved?.knownModels?.["good-vision"]?.capabilities).toEqual([
				"streaming",
				"images",
				"reasoning",
			]);
			expect(resolved?.knownModels?.["good-tools"]?.capabilities).toEqual([
				"streaming",
				"tools",
			]);
			expect(
				resolved?.knownModels?.["bad-model"]?.capabilities,
			).toBeUndefined();
		});

		it("limits concurrent /api/show requests", async () => {
			const tags = Array.from({ length: 9 }, (_, index) => ({
				name: `model-${index}`,
				digest: `sha256:${index}`,
			}));
			let active = 0;
			let maxActive = 0;
			const fetchMock = vi.fn(
				async (input: RequestInfo | URL) => {
					const url = String(input);
					if (url.endsWith("/api/tags")) {
						return new Response(JSON.stringify({ models: tags }), { status: 200 });
					}
					active += 1;
					maxActive = Math.max(maxActive, active);
					await new Promise((resolve) => setTimeout(resolve, 5));
					active -= 1;
					return new Response(
						JSON.stringify({ capabilities: ["completion"] }),
						{ status: 200 },
					);
				},
			);
			vi.stubGlobal("fetch", fetchMock);

			await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{ providerId: "ollama", modelId: "", baseUrl: "http://localhost:11434" },
			);

			expect(maxActive).toBeLessThanOrEqual(6);
			expect(maxActive).toBeGreaterThan(1);
		});

		it("preserves explicit model overrides over discovered metadata", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({
							models: [{ name: "model", digest: "sha256:model" }],
						}),
						{ status: 200 },
					),
				)
				.mockResolvedValueOnce(
					new Response(
						JSON.stringify({ capabilities: ["completion", "vision"] }),
						{ status: 200 },
					),
				);
			vi.stubGlobal("fetch", fetchMock);

			const resolved = await resolveProviderConfig(
				"ollama",
				{ failOnError: true, cacheTtlMs: 0 },
				{
					providerId: "ollama",
					modelId: "model",
					baseUrl: "http://localhost:11434",
					knownModels: {
						model: { id: "model", capabilities: ["streaming", "tools"] },
					},
				},
			);

			expect(resolved?.knownModels?.model?.capabilities).toEqual([
				"streaming",
				"tools",
			]);
		});

		it("reuses cached model details until the installed digest changes", async () => {
			let digest = "sha256:a";
			let capabilities = ["completion"];
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.endsWith("/api/tags")) {
					return new Response(
						JSON.stringify({ models: [{ name: "model", digest }] }),
						{ status: 200 },
					);
				}
				return new Response(JSON.stringify({ capabilities }), { status: 200 });
			});
			vi.stubGlobal("fetch", fetchMock);

			const config = {
				providerId: "ollama",
				modelId: "",
				baseUrl: "http://localhost:11434/v1",
			} as const;
			const catalog = { failOnError: true, cacheTtlMs: 0 } as const;

			await resolveProviderConfig("ollama", catalog, config);
			await resolveProviderConfig("ollama", catalog, config);
			expect(fetchMock).toHaveBeenCalledTimes(3);

			digest = "sha256:b";
			capabilities = ["completion", "vision"];
			const resolved = await resolveProviderConfig("ollama", catalog, config);
			expect(fetchMock).toHaveBeenCalledTimes(5);
			expect(resolved?.knownModels?.model?.capabilities).toEqual([
				"streaming",
				"images",
			]);
		});
	});

	it("uses built-in modelsSourceUrl for keyless local provider models", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ models: [{ name: "local-llama" }] }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ capabilities: ["completion", "tools"] }),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				),
			);
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig(
			"ollama",
			{ failOnError: false, cacheTtlMs: 0 },
			{
				providerId: "ollama",
				modelId: "",
				baseUrl: "http://tailscale-host:11434/v1",
			},
		);

		expect(fetchMock.mock.calls[0][0]).toBe(
			"http://tailscale-host:11434/api/tags",
		);
		expect(fetchMock.mock.calls[1][0]).toBe(
			"http://tailscale-host:11434/api/show",
		);
		expect(Object.keys(resolved?.knownModels ?? {})).toEqual(["local-llama"]);
		expect(resolved?.knownModels?.["local-llama"]?.capabilities).toEqual([
			"streaming",
			"tools",
		]);
	});

	it("loads Poolside models from the authenticated models endpoint", async () => {
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					data: [
						{
							id: "poolside/laguna-xs.2",
							name: "Poolside: Laguna XS.2",
							description: "Poolside coding model",
							context_length: 131_072,
							max_completion_tokens: 8192,
							supported_features: ["tools", "reasoning"],
							supported_sampling_parameters: ["temperature"],
							input_modalities: ["text"],
							pricing: { prompt: "0", completion: "0" },
						},
					],
				}),
				{
					status: 200,
					headers: { "content-type": "application/json" },
				},
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig(
			"poolside",
			{ failOnError: true, cacheTtlMs: 0 },
			{
				providerId: "poolside",
				modelId: "poolside/laguna-m.1",
				apiKey: "poolside-key",
				baseUrl: "https://inference.poolside.ai/v1",
			},
		);

		expect(fetchMock).toHaveBeenCalledWith(
			"https://inference.poolside.ai/v1/models",
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer poolside-key",
				}),
			}),
		);
		expect(resolved?.knownModels?.["poolside/laguna-xs.2"]).toEqual(
			expect.objectContaining({
				name: "Poolside: Laguna XS.2",
				contextWindow: 131_072,
				maxInputTokens: 131_072,
				maxTokens: 8192,
				capabilities: expect.arrayContaining([
					"streaming",
					"tools",
					"reasoning",
					"temperature",
				]),
				pricing: { input: 0, output: 0 },
				status: "active",
			}),
		);
	});

	it("falls back to /model/info for LiteLLM private models", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("no v1 route", { status: 404 }))
			.mockResolvedValueOnce(new Response("no v1 route", { status: 404 }))
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						data: [
							{
								model_name: "private-proxy-model",
								litellm_params: { model: "openai/gpt-4o-mini" },
								model_info: {
									max_output_tokens: 64_000,
									max_input_tokens: 500_000,
									supports_vision: true,
									supports_reasoning: true,
								},
							},
						],
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				),
			);
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig(
			"litellm",
			{ failOnError: true, cacheTtlMs: 0 },
			{
				providerId: "litellm",
				modelId: "",
				apiKey: "litellm-key",
				baseUrl: "http://localhost:4000/v1/",
			},
		);

		expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
			"http://localhost:4000/v1/model/info",
			"http://localhost:4000/v1/model/info",
			"http://localhost:4000/model/info",
		]);
		expect(resolved?.knownModels?.["openai/gpt-4o-mini"]).toEqual(
			expect.objectContaining({
				name: "private-proxy-model",
				maxTokens: 64_000,
				maxInputTokens: 500_000,
				capabilities: expect.arrayContaining(["images", "reasoning"]),
			}),
		);
		expect(resolved?.knownModels?.["private-proxy-model"]).toEqual(
			expect.objectContaining({
				name: "private-proxy-model",
				maxTokens: 64_000,
				maxInputTokens: 500_000,
				capabilities: expect.arrayContaining(["images", "reasoning"]),
			}),
		);
		expect(Object.keys(resolved?.knownModels ?? {}).sort()).toEqual([
			"openai/gpt-4o-mini",
			"private-proxy-model",
		]);
		expect(resolved?.knownModels?.["gpt-5.4"]).toBeUndefined();
	});

	it("returns an empty authoritative LiteLLM model list without auth", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig(
			"litellm",
			{ failOnError: true, cacheTtlMs: 0 },
			{
				providerId: "litellm",
				modelId: "",
				baseUrl: "http://localhost:4000/v1/",
			},
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(resolved?.knownModels).toEqual({});
		expect(resolved?.knownModels?.["gpt-5.4"]).toBeUndefined();
	});

	it("does not fall back to bundled LiteLLM models when private model fetch fails non-strictly", async () => {
		const fetchMock = vi.fn(
			async () => new Response('{"error":"unauthorized"}', { status: 401 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		const resolved = await resolveProviderConfig(
			"litellm",
			{ failOnError: false, cacheTtlMs: 0 },
			{
				providerId: "litellm",
				modelId: "",
				apiKey: "litellm-key",
				baseUrl: "http://localhost:4000",
			},
		);

		expect(fetchMock).toHaveBeenCalled();
		expect(resolved?.knownModels).toEqual({});
		expect(resolved?.knownModels?.["gpt-5.4"]).toBeUndefined();
	});

	it("reports attempted path, auth header, status, and body for LiteLLM model fetch failures", async () => {
		const fetchMock = vi.fn(
			async () => new Response('{"error":"unauthorized"}', { status: 401 }),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			resolveProviderConfig(
				"litellm",
				{ failOnError: true, cacheTtlMs: 0 },
				{
					providerId: "litellm",
					modelId: "",
					apiKey: "litellm-key",
					baseUrl: "http://localhost:4000",
				},
			),
		).rejects.toThrow(
			'/model/info (Authorization): HTTP 401: {"error":"unauthorized"}',
		);
	});

	it("derives ChatGPT subscription models from the generated OpenAI catalog", async () => {
		const resolved = await resolveProviderConfig("openai-codex");
		const openAiResolved = await resolveProviderConfig("openai-native");
		const modelIds = Object.keys(resolved?.knownModels ?? {});

		expect(modelIds).toEqual(
			expect.arrayContaining(["gpt-5.5", "gpt-5.6-terra", "gpt-6-astra"]),
		);
		expect(modelIds).not.toContain("gpt-5.5-pro");
		expect(modelIds).not.toContain("gpt-5.1-codex-max");
		expect(modelIds).not.toContain("gpt-5.2-codex");
		expect(modelIds).not.toContain("gpt-5.4");
		expect(modelIds).not.toContain("gpt-5.4-mini");
		expect(modelIds).not.toContain("gpt-5.4-nano");
		expect(modelIds).not.toContain("gpt-5.6");
		expect(modelIds).not.toContain("o3");
		expect(resolved?.knownModels?.["gpt-5.5"]).toEqual(
			expect.objectContaining({
				...openAiResolved?.knownModels?.["gpt-5.5"],
				// ChatGPT/Codex backend caps: 272K input at the 95% effective budget
				maxInputTokens: 272_000 * 0.95,
				contextWindow: 400_000,
				maxTokens: 128_000,
			}),
		);
	});

	it("resolves ChatGPT OAuth models from the filtered catalog", async () => {
		const resolved = await resolveProviderConfig(
			"openai-codex",
			{ cacheTtlMs: 1 },
			{
				providerId: "openai-codex",
				modelId: "gpt-5.6-terra",
				apiKey: "oauth-token",
				accountId: "acct_123",
			},
		);

		expect(Object.keys(resolved?.knownModels ?? {})).toEqual(
			expect.arrayContaining(["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]),
		);
		expect(resolved?.knownModels?.["gpt-5.6-luna"]).toEqual(
			expect.objectContaining({
				name: "GPT-5.6 Luna",
				// Codex backend caps, scaled to the 95% effective budget
				maxInputTokens: 272_000 * 0.95,
				contextWindow: 400_000,
			}),
		);
		expect(resolved?.knownModels?.["gpt-5.4"]).toBeUndefined();
		expect(resolved?.knownModels?.["gpt-5.4-nano"]).toBeUndefined();
	});
});
