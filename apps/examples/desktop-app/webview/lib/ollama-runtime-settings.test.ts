import { describe, expect, it } from "vitest";
import { OLLAMA_DEFAULT_CONTEXT_WINDOW } from "@cline/shared/browser";
import { resolveOllamaRuntimeSettings } from "./ollama-runtime-settings";

describe("resolveOllamaRuntimeSettings", () => {
	it("prefers a per-model context and generation override over provider defaults", () => {
		const resolved = resolveOllamaRuntimeSettings({
			configValues: { contextWindow: 65_536, maxTokens: 8192, timeout: 600_000 },
			modelOverrides: {
				"vision-model": {
					contextWindow: 32_768,
					maxTokens: 4096,
					reasoning: { enabled: false, effort: "low", budgetTokens: 1024 },
				},
			},
			modelContextWindow: 131_072,
			modelId: "vision-model",
		});

		expect(resolved.contextWindow).toBe(32_768);
		expect(resolved.contextSource).toBe("model-override");
		expect(resolved.providerConfig).toMatchObject({
			maxInputTokens: 32_768,
			maxOutputTokens: 4096,
			timeoutMs: 600_000,
		});
		expect(resolved.thinking).toBe(false);
		expect(resolved.reasoningEffort).toBe("low");
		expect(resolved.thinkingBudgetTokens).toBe(1024);
	});

	it("uses a safe local context default rather than the model maximum", () => {
		const resolved = resolveOllamaRuntimeSettings({
			modelContextWindow: 131_072,
			modelId: "large-context-model",
		});

		expect(resolved.contextWindow).toBe(OLLAMA_DEFAULT_CONTEXT_WINDOW);
		expect(resolved.contextSource).toBe("safe-local-default");
		expect(resolved.providerConfig.maxInputTokens).toBe(32_768);
	});

	it("falls back to model metadata when it is already within the safe local default", () => {
		const resolved = resolveOllamaRuntimeSettings({
			modelContextWindow: 16_384,
			modelId: "small-model",
		});

		expect(resolved.contextWindow).toBe(16_384);
		expect(resolved.contextSource).toBe("model-metadata");
	});
});


describe("Ollama media budget", () => {
	it("uses the safe local defaults", () => {
		const result = resolveOllamaRuntimeSettings({ modelId: "vision-model" });
		expect(result.providerConfig.mediaBudget).toMatchObject({
			maxImageEncodedBytes: 12 * 1024 * 1024,
			maxImageDecodedBytes: 8 * 1024 * 1024,
			maxTotalMediaBytes: 24 * 1024 * 1024,
		});
	});

	it("ignores invalid media budget values instead of propagating NaN", () => {
		const result = resolveOllamaRuntimeSettings({
			modelId: "vision-model",
			mediaBudget: {
				maxImageEncodedBytes: Number.NaN,
				maxImageDecodedBytes: Number.POSITIVE_INFINITY,
				maxTotalMediaBytes: 0,
			},
		});

		expect(result.providerConfig.mediaBudget).toEqual({
			maxImageEncodedBytes: 12 * 1024 * 1024,
			maxImageDecodedBytes: 8 * 1024 * 1024,
			maxTotalMediaBytes: 24 * 1024 * 1024,
		});
	});

	it("uses configured local media limits", () => {
		const result = resolveOllamaRuntimeSettings({
			modelId: "vision-model",
			configValues: {
				"mediaBudget.maxImageEncodedBytes": 7 * 1024 * 1024,
				"mediaBudget.maxImageDecodedBytes": 5 * 1024 * 1024,
				"mediaBudget.maxTotalMediaBytes": 14 * 1024 * 1024,
			},
		});
		expect(result.providerConfig.mediaBudget).toEqual({
			maxImageEncodedBytes: 7 * 1024 * 1024,
			maxImageDecodedBytes: 5 * 1024 * 1024,
			maxTotalMediaBytes: 14 * 1024 * 1024,
		});
	});
});
