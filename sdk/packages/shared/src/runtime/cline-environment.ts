export const CLINE_ENVIRONMENT_ENV = "CLINE_ENVIRONMENT";
export const CLINE_ENVIRONMENT_OVERRIDE_ENV = "CLINE_ENVIRONMENT_OVERRIDE";
export const CLINE_CLOUD_SERVICES_ENABLED_ENV = "CLINE_ENABLE_CLOUD_SERVICES";

export type ClineEnvironment = "production" | "staging" | "local";

export interface ClineEnvironmentConfig {
	readonly environment: ClineEnvironment;
	readonly appBaseUrl: string;
	readonly apiBaseUrl: string;
	readonly mcpBaseUrl: string;
	readonly workOsClientId: string;
}

export const CLINE_ENVIRONMENTS: Readonly<
	Record<ClineEnvironment, ClineEnvironmentConfig>
> = {
	production: {
		environment: "production",
		appBaseUrl: "https://app.cline.bot",
		apiBaseUrl: "https://api.cline.bot",
		mcpBaseUrl: "https://api.cline.bot/v1/mcp",
		workOsClientId: "client_01K3A541FN8TA3EPPHTD2325AR",
	},
	staging: {
		environment: "staging",
		appBaseUrl: "https://staging-app.cline.bot",
		apiBaseUrl: "https://core-api.staging.int.cline.bot",
		mcpBaseUrl: "https://core-api.staging.int.cline.bot/v1/mcp",
		workOsClientId: "client_01K3A5415VF6QBQBG3XYCW91G6",
	},
	local: {
		environment: "local",
		appBaseUrl: "http://localhost:3000",
		apiBaseUrl: "http://localhost:7777",
		mcpBaseUrl: "http://localhost:7777/v1/mcp",
		workOsClientId: "client_01K6XQAY7JK6T5HXVSZW2S5VYK",
	},
};

/** Safe default: upstream Cline-hosted services are disabled unless explicitly enabled. */
export const DEFAULT_CLINE_ENVIRONMENT: ClineEnvironment = "local";

export interface ResolveClineEnvironmentOptions {
	env?: Partial<NodeJS.ProcessEnv>;
}

function normalizeClineEnvironment(
	value: string | undefined,
): ClineEnvironment | undefined {
	const normalized = value?.trim().toLowerCase();
	if (
		normalized === "production" ||
		normalized === "staging" ||
		normalized === "local"
	) {
		return normalized;
	}
	return undefined;
}

function readProcessEnv(): NodeJS.ProcessEnv {
	// `process` may be absent in browser-style runtimes (this module ships
	// from the browser entry of `@cline/shared`). Treat its absence as "no
	// env vars set" so callers always get a deterministic default.
	if (typeof process === "undefined" || !process?.env) {
		return {};
	}
	return process.env;
}

export function isClineCloudServicesEnabled(
	env: Partial<NodeJS.ProcessEnv> = readProcessEnv(),
): boolean {
	return env[CLINE_CLOUD_SERVICES_ENABLED_ENV] === "1";
}

export function resolveClineEnvironment(): ClineEnvironment {
	const env = readProcessEnv();
	// Local inference and user-configured provider APIs must not implicitly
	// enable account, organization, or other Cline-hosted services.
	if (!isClineCloudServicesEnabled(env)) {
		return "local";
	}
	return (
		normalizeClineEnvironment(env[CLINE_ENVIRONMENT_OVERRIDE_ENV]) ??
		normalizeClineEnvironment(env[CLINE_ENVIRONMENT_ENV]) ??
		"production"
	);
}

function getEnvConfig(env?: ClineEnvironment) {
	if (typeof env === "string") {
		return CLINE_ENVIRONMENTS[env];
	}
	return CLINE_ENVIRONMENTS[resolveClineEnvironment()];
}

function applyConfigOverrides(
	config: ClineEnvironmentConfig,
	env: NodeJS.ProcessEnv,
): ClineEnvironmentConfig {
	if (env.CLINE_API_BASE_URL) {
		config = {
			...config,
			apiBaseUrl: env.CLINE_API_BASE_URL,
			mcpBaseUrl: `${env.CLINE_API_BASE_URL}/v1/mcp`,
		};
	}

	return config;
}

export function getClineEnvironmentConfig(
	env?: ClineEnvironment,
): ClineEnvironmentConfig {
	const processEnv = readProcessEnv();
	if (!isClineCloudServicesEnabled(processEnv)) {
		return CLINE_ENVIRONMENTS.local;
	}
	const config = getEnvConfig(env);

	return applyConfigOverrides(config, processEnv);
}
