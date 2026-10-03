import { describe, expect, it } from "vitest";
import { safeParseSettings, toProviderConfig } from "./provider-settings";

describe("provider settings", () => {
	it("formats Cline OAuth access tokens for runtime API keys", () => {
		const config = toProviderConfig({
			provider: "cline",
			model: "anthropic/claude-sonnet-4.6",
			auth: {
				accessToken: "oauth-access-token",
			},
		});

		expect(config.apiKey).toBe("workos:oauth-access-token");
		expect(config.accessToken).toBe("oauth-access-token");
	});

	it("accepts the Bedrock apikey authentication alias", () => {
		const result = safeParseSettings({
			provider: "bedrock",
			model: "anthropic.claude-sonnet-4-5-20250929-v1:0",
			aws: {
				authentication: "apikey",
				region: "us-east-1",
			},
		});

		expect(result.success).toBe(true);
		if (!result.success) {
			throw new Error("expected Bedrock apikey settings to parse");
		}

		expect(toProviderConfig(result.data).aws).toEqual(
			expect.objectContaining({
				authentication: "apikey",
			}),
		);
	});

	it("resolves the regional endpoint from apiLine when no base URL is set", () => {
		expect(
			toProviderConfig({ provider: "zai", apiLine: "china" }),
		).toMatchObject({
			apiLine: "china",
			baseUrl: "https://open.bigmodel.cn/api/paas/v4",
		});

		expect(
			toProviderConfig({ provider: "moonshot", apiLine: "china" }),
		).toMatchObject({
			baseUrl: "https://api.moonshot.cn/v1",
		});

		expect(
			toProviderConfig({ provider: "qwen", apiLine: "international" }),
		).toMatchObject({
			baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
		});
	});

	it("lets an explicit base URL win over apiLine", () => {
		expect(
			toProviderConfig({
				provider: "zai",
				apiLine: "china",
				baseUrl: "https://proxy.example.com/v4",
			}),
		).toMatchObject({
			baseUrl: "https://proxy.example.com/v4",
		});
	});

	it("limits ChatGPT subscription known models to the Codex catalog", () => {
		const knownModels = toProviderConfig({
			provider: "openai-codex",
		}).knownModels;
		const modelIds = Object.keys(knownModels ?? {});

		expect(modelIds).toEqual(
			expect.arrayContaining(["gpt-5.5", "gpt-5.6-terra"]),
		);
		expect(modelIds).not.toContain("gpt-4o");
		expect(modelIds).not.toContain("gpt-4.1");
		expect(modelIds).not.toContain("chatgpt-image-latest");
		expect(modelIds).not.toContain("gpt-5.4-nano");
		expect(knownModels?.["gpt-5.5"]).toMatchObject({
			contextWindow: 400_000,
			maxInputTokens: 272_000 * 0.95,
		});
	});


	it("resolves Ollama model overrides over provider defaults", () => {
		const config = toProviderConfig(
			{
				provider: "ollama",
				model: "vision-model",
				contextWindow: 65_536,
				maxTokens: 8192,
				timeout: 120_000,
				reasoning: { enabled: true, effort: "medium", budgetTokens: 4096 },
				modelOverrides: {
					"vision-model": {
						contextWindow: 32_768,
						maxTokens: 4096,
						reasoning: { enabled: false, effort: "low", budgetTokens: 1024 },
					},
				},
			},
			{ modelId: "vision-model" },
		);

		expect(config).toMatchObject({
			modelId: "vision-model",
			maxInputTokens: 32_768,
			maxOutputTokens: 4096,
			timeoutMs: 120_000,
			thinking: false,
			reasoningEffort: "low",
			thinkingBudgetTokens: 1024,
		});
	});

	it("uses the safe Ollama context default when no explicit context exists", () => {
		expect(toProviderConfig({ provider: "ollama", model: "local-model" })).toMatchObject({
			maxInputTokens: 32_768,
		});
	});

	it("preserves validated Ollama generation settings and normalizes stop sequences", () => {
		const result = safeParseSettings({
			provider: "ollama",
			model: "local-model",
			ollamaGeneration: {
				temperature: 0.2,
				topP: 0.95,
				topK: 40,
				minP: 0.05,
				repeatPenalty: 1.1,
				repeatLastN: -1,
				seed: 42,
				stop: "<tool_call>\n<|end|>",
				keepAlive: "5m",
			},
		});
		expect(result.success).toBe(true);
		const config = toProviderConfig(result.success ? result.data : { provider: "ollama" });
		expect(config.ollamaGeneration).toEqual({
			temperature: 0.2,
			topP: 0.95,
			topK: 40,
			minP: 0.05,
			repeatPenalty: 1.1,
			repeatLastN: -1,
			seed: 42,
			stop: ["<tool_call>", "<|end|>"],
			keepAlive: "5m",
		});
	});

	it("rejects invalid Ollama generation ranges", () => {
		const result = safeParseSettings({
			provider: "ollama",
			ollamaGeneration: { topP: 1.2, minP: -0.1, topK: 0 },
		});
		expect(result.success).toBe(false);
	});

	it("accepts per-model local provider overrides with explicit capability enable/disable", () => {
		const result = safeParseSettings({
			provider: "ollama",
			modelOverrides: {
				"vision-model": {
					contextWindow: 32768,
					maxTokens: 4096,
					reasoning: { enabled: false, effort: "high", budgetTokens: 2048 },
					capabilities: { vision: true, tools: false, reasoning: false },
				},
			},
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected Ollama model overrides to parse");
		expect(result.data.modelOverrides?.["vision-model"]).toEqual({
			contextWindow: 32768,
			maxTokens: 4096,
			reasoning: { enabled: false, effort: "high", budgetTokens: 2048 },
			capabilities: { vision: true, tools: false, reasoning: false },
		});
	});

	it("rejects unknown fields in per-model overrides", () => {
		const result = safeParseSettings({
			provider: "ollama",
			modelOverrides: {
				model: { unsupported: true },
			},
		});

		expect(result.success).toBe(false);
	});

	it("keeps the provider default base URL when no apiLine is set", () => {
		expect(toProviderConfig({ provider: "zai" })).toMatchObject({
			baseUrl: "https://api.z.ai/api/paas/v4",
		});
		expect(toProviderConfig({ provider: "moonshot" })).toMatchObject({
			baseUrl: "https://api.moonshot.ai/v1",
		});
	});
});
