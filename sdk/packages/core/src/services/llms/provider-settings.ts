import * as Llms from "@cline/llms";
import {
	OLLAMA_DEFAULT_CONTEXT_WINDOW,
	OLLAMA_DEFAULT_MEDIA_BUDGET,
	ReasoningLevelSchema,
	type MediaBudgetOptions,
} from "@cline/shared";
import { z } from "zod";
import {
	DEFAULT_EXTERNAL_OCA_BASE_URL,
	DEFAULT_INTERNAL_OCA_BASE_URL,
} from "../../auth/oca";
import { getPersistedProviderApiKey } from "../../auth/provider-auth-registry";
import {
	OPENAI_COMPATIBLE_PROVIDERS,
	type ProviderDefaults,
} from "./provider-defaults";

export type ModelInfo = Llms.ModelInfo;
export type ProviderClient = Llms.ProviderClient;
export type ProviderProtocol = Llms.ProviderProtocol;
export type ProviderId = Llms.ProviderId;
export type ProviderCapability = Llms.ProviderCapability;
export type ProviderConfig = Llms.ProviderConfig;
export type BuiltInProviderId = Llms.BuiltInProviderId;

export const BUILT_IN_PROVIDER = Llms.BUILT_IN_PROVIDER;
export const BUILT_IN_PROVIDER_IDS = Llms.BUILT_IN_PROVIDER_IDS;
export const isBuiltInProviderId = Llms.isBuiltInProviderId;
export const normalizeProviderId = Llms.normalizeProviderId;

export type ProviderDefaultsConfig = ProviderDefaults;

export const ProviderIdSchema = z
	.string()
	.min(1)
	.regex(/^[a-z0-9][a-z0-9-]*$/i);

export const ProviderProtocolSchema = z.enum([
	"anthropic",
	"gemini",
	"openai-chat",
	"openai-responses",
	"openai-r1",
	"ai-sdk",
]);

export const ProviderClientSchema = z.enum([
	"anthropic",
	"ai-sdk",
	"ai-sdk-community",
	"openai",
	"openai-compatible",
	"openai-r1",
	"gemini",
	"bedrock",
	"custom",
	"fetch",
	"vertex",
]);

export const AuthSettingsSchema = z.object({
	apiKey: z.string().optional(),
	accessToken: z.string().optional(),
	refreshToken: z.string().optional(),
	expiresAt: z.number().int().positive().optional(),
	accountId: z.string().optional(),
	// Active organization at last account load, for telemetry attribution.
	organizationId: z.string().optional(),
	organizationName: z.string().optional(),
	memberId: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuthSettings = z.infer<typeof AuthSettingsSchema>;

export const ReasoningSettingsSchema = z.object({
	enabled: z.boolean().optional(),
	effort: ReasoningLevelSchema.optional(),
	budgetTokens: z.number().int().positive().optional(),
});

export type ReasoningSettings = z.infer<typeof ReasoningSettingsSchema>;

export const AwsSettingsSchema = z.object({
	accessKey: z.string().optional(),
	secretKey: z.string().optional(),
	sessionToken: z.string().optional(),
	region: z.string().optional(),
	profile: z.string().optional(),
	authentication: z.enum(["iam", "api-key", "apikey", "profile"]).optional(),
	usePromptCache: z.boolean().optional(),
	useCrossRegionInference: z.boolean().optional(),
	useGlobalInference: z.boolean().optional(),
	endpoint: z.string().url().optional(),
	customModelBaseId: z.string().optional(),
});

export type AwsSettings = z.infer<typeof AwsSettingsSchema>;

export const GcpSettingsSchema = z.object({
	projectId: z.string().optional(),
	region: z.string().optional(),
});

export type GcpSettings = z.infer<typeof GcpSettingsSchema>;

export const AzureSettingsSchema = z.object({
	apiVersion: z.string().optional(),
	useIdentity: z.boolean().optional(),
});

export type AzureSettings = z.infer<typeof AzureSettingsSchema>;

export const SapSettingsSchema = z.object({
	clientId: z.string().optional(),
	clientSecret: z.string().optional(),
	tokenUrl: z.string().url().optional(),
	resourceGroup: z.string().optional(),
	deploymentId: z.string().optional(),
	useOrchestrationMode: z.boolean().optional(),
	api: z.enum(["orchestration", "foundation-models"]).optional(),
	defaultSettings: z.record(z.string(), z.unknown()).optional(),
});

export type SapSettings = z.infer<typeof SapSettingsSchema>;

export const OcaSettingsSchema = z.object({
	mode: z.enum(["internal", "external"]).optional(),
	usePromptCache: z.boolean().optional(),
});

export type OcaSettings = z.infer<typeof OcaSettingsSchema>;

export const ModelCatalogSettingsSchema = z.object({
	loadLatestOnInit: z.boolean().optional(),
	includeClineCloudModels: z.boolean().optional(),
	loadPrivateOnAuth: z.boolean().optional(),
	url: z.string().url().optional(),
	cacheTtlMs: z.number().int().positive().optional(),
	failOnError: z.boolean().optional(),
});

export type ModelCatalogSettings = z.infer<typeof ModelCatalogSettingsSchema>;
export type ModelCatalogConfig = ModelCatalogSettings;

export const ProviderModelCapabilityOverridesSchema = z
	.object({
		vision: z.boolean().optional(),
		tools: z.boolean().optional(),
		reasoning: z.boolean().optional(),
	})
	.strict();

export const ProviderModelSettingsOverrideSchema = z
	.object({
		contextWindow: z.number().int().positive().optional(),
		maxTokens: z.number().int().positive().optional(),
		reasoning: ReasoningSettingsSchema.optional(),
		capabilities: ProviderModelCapabilityOverridesSchema.optional(),
	})
	.strict();

export const ProviderModelSettingsOverridesSchema = z.record(
	z.string().min(1),
	ProviderModelSettingsOverrideSchema,
);

export type ProviderModelSettingsOverride = z.infer<
	typeof ProviderModelSettingsOverrideSchema
>;
export type ProviderModelSettingsOverrides = z.infer<
	typeof ProviderModelSettingsOverridesSchema
>;

export const ProviderMediaBudgetSchema = z
	.object({
		maxImageEncodedBytes: z.number().int().positive().optional(),
		maxImageDecodedBytes: z.number().int().positive().optional(),
		maxTotalMediaBytes: z.number().int().positive().optional(),
	})
	.strict();

export type ProviderMediaBudget = z.infer<typeof ProviderMediaBudgetSchema>;

export const OllamaGenerationSettingsSchema = z
	.object({
		temperature: z.number().finite().min(0).optional(),
		topP: z.number().finite().min(0).max(1).optional(),
		topK: z.number().int().positive().optional(),
		minP: z.number().finite().min(0).max(1).optional(),
		repeatPenalty: z.number().finite().positive().optional(),
		repeatLastN: z.number().int().min(-1).optional(),
		seed: z.number().int().min(0).optional(),
		stop: z.union([z.string(), z.array(z.string())]).optional(),
		keepAlive: z.union([z.string(), z.number().finite()]).optional(),
	})
	.strict();

export type OllamaGenerationSettings = z.infer<
	typeof OllamaGenerationSettingsSchema
>;

export const ProviderSettingsSchema = z.object({
	provider: ProviderIdSchema,
	apiKey: z.string().optional(),
	auth: AuthSettingsSchema.optional(),
	model: z.string().optional(),
	protocol: ProviderProtocolSchema.optional(),
	client: ProviderClientSchema.optional(),
	routingProviderId: ProviderIdSchema.optional(),
	maxTokens: z.number().int().positive().optional(),
	contextWindow: z.number().int().positive().optional(),
	baseUrl: z.string().url().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	timeout: z.number().int().positive().optional(),
	reasoning: ReasoningSettingsSchema.optional(),
	modelOverrides: ProviderModelSettingsOverridesSchema.optional(),
	mediaBudget: ProviderMediaBudgetSchema.optional(),
	ollamaGeneration: OllamaGenerationSettingsSchema.optional(),
	aws: AwsSettingsSchema.optional(),
	gcp: GcpSettingsSchema.optional(),
	azure: AzureSettingsSchema.optional(),
	sap: SapSettingsSchema.optional(),
	oca: OcaSettingsSchema.optional(),
	region: z.string().optional(),
	apiLine: z.enum(["china", "international"]).optional(),
	capabilities: z
		.array(
			z.enum([
				"reasoning",
				"prompt-cache",
				"streaming",
				"tools",
				"vision",
				"computer-use",
				"oauth",
				"popular",
			]),
		)
		.optional(),
	modelCatalog: ModelCatalogSettingsSchema.optional(),
});

export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;

export interface ToProviderConfigOptions {
	includeKnownModels?: boolean;
	/** Selected model used to resolve per-model provider settings overrides. */
	modelId?: string;
}

export function parseSettings(input: unknown): ProviderSettings {
	return ProviderSettingsSchema.parse(input);
}

export function safeParseSettings(
	input: unknown,
): ReturnType<typeof ProviderSettingsSchema.safeParse> {
	return ProviderSettingsSchema.safeParse(input);
}

function shouldRouteThroughOpenAIResponses(
	settings: ProviderSettings,
): boolean {
	return (
		settings.protocol === "openai-responses" || settings.client === "openai"
	);
}

export function toProviderConfig(
	settings: ProviderSettings,
	options: ToProviderConfigOptions = {},
): ProviderConfig {
	const providerId = settings.provider as ProviderId;
	const normalizedProviderId = normalizeProviderId(providerId);
	const includeKnownModels = options.includeKnownModels !== false;
	const selectedModelId = options.modelId ?? settings.model;
	const modelOverride = selectedModelId
		? settings.modelOverrides?.[selectedModelId]
		: undefined;
	const effectiveReasoning = {
		...(settings.reasoning ?? {}),
		...(modelOverride?.reasoning ?? {}),
	};
	const unifiedReasoningLevel = effectiveReasoning.effort || "none";
	const reasoningEffort =
		unifiedReasoningLevel === "none" ? undefined : unifiedReasoningLevel;
	const effectiveContextWindow =
		modelOverride?.contextWindow ??
		settings.contextWindow ??
		(normalizedProviderId === "ollama"
			? OLLAMA_DEFAULT_CONTEXT_WINDOW
			: undefined);

	const providerDefaults = OPENAI_COMPATIBLE_PROVIDERS[normalizedProviderId];
	const generatedKnownModels =
		Llms.getGeneratedModelsForRuntimeProvider(normalizedProviderId);
	const generatedDefaultModelId = Object.keys(generatedKnownModels)[0];

	const apiKey = getPersistedProviderApiKey(normalizedProviderId, settings);
	// Precedence: explicit base URL > regional API line endpoint (e.g.
	// Qwen/Moonshot/Z.AI "china" vs "international") > provider default.
	const resolvedBaseUrl =
		settings.baseUrl ??
		Llms.resolveProviderApiLineBaseUrl(
			normalizedProviderId,
			settings.apiLine,
		) ??
		(normalizedProviderId === "oca"
			? settings.oca?.mode === "internal"
				? DEFAULT_INTERNAL_OCA_BASE_URL
				: DEFAULT_EXTERNAL_OCA_BASE_URL
			: providerDefaults?.baseUrl);
	const routingProviderId =
		settings.routingProviderId ??
		(shouldRouteThroughOpenAIResponses(settings) &&
		normalizedProviderId !== BUILT_IN_PROVIDER.OPENAI_NATIVE
			? BUILT_IN_PROVIDER.OPENAI_NATIVE
			: undefined);

	const knownModels = includeKnownModels
		? (providerDefaults?.knownModels ??
			(Object.keys(generatedKnownModels).length > 0
				? generatedKnownModels
				: undefined))
		: undefined;
	const ollamaGeneration: Llms.OllamaGenerationOptions | undefined = (() => {
		if (normalizedProviderId !== "ollama" || !settings.ollamaGeneration) {
			return undefined;
		}

		const { stop, ...generationOptions } = settings.ollamaGeneration;
		const normalizedStop =
			typeof stop === "string"
				? stop
						.split(/\r?\n/)
						.map((value) => value.trim())
						.filter(Boolean)
				: stop;

		return {
			...generationOptions,
			...(normalizedStop !== undefined ? { stop: normalizedStop } : {}),
		};
	})();

	const config: ProviderConfig = {
		providerId,
		clientType: settings.client,
		routingProviderId,
		modelId:
			settings.model ??
			providerDefaults?.modelId ??
			generatedDefaultModelId ??
			"default",
		...(includeKnownModels ? { knownModels } : {}),
		apiKey,
		accessToken: settings.auth?.accessToken,
		refreshToken: settings.auth?.refreshToken,
		accountId: settings.auth?.accountId,
		baseUrl: resolvedBaseUrl,
		headers: settings.headers,
		timeoutMs: settings.timeout,
		maxOutputTokens: modelOverride?.maxTokens ?? settings.maxTokens,
		mediaBudget: (normalizedProviderId === "ollama"
			? { ...OLLAMA_DEFAULT_MEDIA_BUDGET, ...(settings.mediaBudget ?? {}) }
			: settings.mediaBudget) as MediaBudgetOptions | undefined,
		maxInputTokens: effectiveContextWindow,
		ollamaGeneration,
		thinking: effectiveReasoning.enabled,
		reasoningEffort,
		thinkingBudgetTokens: effectiveReasoning.budgetTokens,
		region: settings.region ?? settings.aws?.region ?? settings.gcp?.region,
		apiLine: settings.apiLine,
		useCrossRegionInference: settings.aws?.useCrossRegionInference,
		useGlobalInference: settings.aws?.useGlobalInference,
		aws: settings.aws
			? {
					accessKey: settings.aws.accessKey,
					secretKey: settings.aws.secretKey,
					sessionToken: settings.aws.sessionToken,
					authentication: settings.aws.authentication,
					profile: settings.aws.profile,
					usePromptCache: settings.aws.usePromptCache,
					endpoint: settings.aws.endpoint,
					customModelBaseId: settings.aws.customModelBaseId,
				}
			: undefined,
		gcp: settings.gcp
			? {
					projectId: settings.gcp.projectId,
					region: settings.gcp.region,
				}
			: undefined,
		azure: settings.azure,
		sap: settings.sap,
		oca: settings.oca,
		capabilities: (settings.capabilities ?? providerDefaults?.capabilities) as
			| ProviderCapability[]
			| undefined,
		modelCatalog: settings.modelCatalog
			? {
					loadLatestOnInit: settings.modelCatalog.loadLatestOnInit,
					includeClineCloudModels:
						settings.modelCatalog.includeClineCloudModels,
					loadPrivateOnAuth: settings.modelCatalog.loadPrivateOnAuth,
					url: settings.modelCatalog.url,
					cacheTtlMs: settings.modelCatalog.cacheTtlMs,
					failOnError: settings.modelCatalog.failOnError,
				}
			: undefined,
	};

	return Object.fromEntries(
		Object.entries(config).filter(([_, value]) => value !== undefined),
	) as ProviderConfig;
}

export function createProviderConfig(input: unknown): ProviderConfig {
	const settings = parseSettings(input);
	return toProviderConfig(settings);
}

export function safeCreateProviderConfig(
	input: unknown,
):
	| { success: true; config: ProviderConfig }
	| { success: false; error: z.ZodError } {
	const result = safeParseSettings(input);
	if (result.success) {
		return { success: true, config: toProviderConfig(result.data) };
	}
	return { success: false, error: result.error };
}
