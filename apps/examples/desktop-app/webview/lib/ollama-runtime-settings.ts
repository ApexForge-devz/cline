import {
	OLLAMA_DEFAULT_CONTEXT_WINDOW,
	OLLAMA_DEFAULT_MEDIA_BUDGET,
	OLLAMA_DEFAULT_RESPONSE_START_TIMEOUT_MS,
	resolveMediaBudget,
	type MediaBudgetOptions,
	type ProviderModelSettingsOverride,
} from "@cline/shared/browser";

export type OllamaProviderRuntimeInput = {
	configValues?: Record<string, string | number | boolean | null>;
	headers?: Record<string, string>;
	modelOverrides?: Record<string, ProviderModelSettingsOverride>;
	modelContextWindow?: number;
	modelId: string;
	mediaBudget?: MediaBudgetOptions;
};

export type OllamaRuntimeResolutionSource =
	| "model-override"
	| "provider-setting"
	| "model-metadata"
	| "safe-local-default";

export type OllamaRuntimeSettings = {
	providerConfig: {
		timeoutMs?: number;
		maxInputTokens: number;
		mediaBudget: ReturnType<typeof resolveMediaBudget>;
		maxOutputTokens?: number;
		maxParallelToolCalls?: number;
		headers?: Record<string, string>;
	};
	contextWindow: number;
	contextSource: OllamaRuntimeResolutionSource;
	timeoutMs?: number;
	timeoutSource: "provider-setting" | "provider-default";
	thinking?: boolean;
	reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	thinkingBudgetTokens?: number;
};

function positiveInteger(value: unknown): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
	return Math.floor(value);
}

function readReasoning(
	input: OllamaProviderRuntimeInput,
	override: ProviderModelSettingsOverride | undefined,
	path: "reasoning.enabled" | "reasoning.effort" | "reasoning.budgetTokens",
): unknown {
	if (path === "reasoning.enabled" && typeof override?.reasoning?.enabled === "boolean") return override.reasoning.enabled;
	if (path === "reasoning.effort" && override?.reasoning?.effort) return override.reasoning.effort;
	if (path === "reasoning.budgetTokens" && override?.reasoning?.budgetTokens !== undefined) return override.reasoning.budgetTokens;
	return input.configValues?.[path];
}

export function resolveOllamaRuntimeSettings(input: OllamaProviderRuntimeInput): OllamaRuntimeSettings {
	const override = input.modelOverrides?.[input.modelId];
	const providerContext = positiveInteger(input.configValues?.contextWindow);
	const overrideContext = positiveInteger(override?.contextWindow);
	const modelContext = positiveInteger(input.modelContextWindow);

	let contextWindow: number;
	let contextSource: OllamaRuntimeResolutionSource;
	if (overrideContext !== undefined) {
		contextWindow = overrideContext;
		contextSource = "model-override";
	} else if (providerContext !== undefined) {
		contextWindow = providerContext;
		contextSource = "provider-setting";
	} else if (modelContext !== undefined) {
		contextWindow = Math.min(modelContext, OLLAMA_DEFAULT_CONTEXT_WINDOW);
		contextSource = modelContext > OLLAMA_DEFAULT_CONTEXT_WINDOW ? "safe-local-default" : "model-metadata";
	} else {
		contextWindow = OLLAMA_DEFAULT_CONTEXT_WINDOW;
		contextSource = "safe-local-default";
	}

	const maxOutputTokens = positiveInteger(override?.maxTokens) ?? positiveInteger(input.configValues?.maxTokens);
	const maxParallelToolCalls = positiveInteger(input.configValues?.maxParallelToolCalls);
	const timeoutMs = positiveInteger(input.configValues?.timeout);
	const thinking = readReasoning(input, override, "reasoning.enabled");
	const effort = readReasoning(input, override, "reasoning.effort");
	const thinkingBudgetTokens = positiveInteger(readReasoning(input, override, "reasoning.budgetTokens"));
	const mediaBudget = resolveMediaBudget({ ...OLLAMA_DEFAULT_MEDIA_BUDGET, ...(input.mediaBudget ?? {}) });
	const providerConfig: OllamaRuntimeSettings["providerConfig"] = {
		maxInputTokens: contextWindow,
		...(maxParallelToolCalls !== undefined ? { maxParallelToolCalls } : {}),
		mediaBudget,
		...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
		...(timeoutMs !== undefined ? { timeoutMs } : {}),
		...(input.headers ? { headers: input.headers } : {}),
	};

	return {
		providerConfig,
		contextWindow,
		contextSource,
		...(timeoutMs !== undefined ? { timeoutMs } : {}),
		timeoutSource: timeoutMs === undefined ? "provider-default" : "provider-setting",
		...(typeof thinking === "boolean" ? { thinking } : {}),
		...(typeof effort === "string" && effort !== "none" ? { reasoningEffort: effort as OllamaRuntimeSettings["reasoningEffort"] } : {}),
		...(thinkingBudgetTokens !== undefined ? { thinkingBudgetTokens } : {}),
	};
}
