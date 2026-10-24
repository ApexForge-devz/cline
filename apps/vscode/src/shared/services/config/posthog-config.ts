import { BUILD_CONSTANTS } from "../../constants"

export interface PostHogClientConfig {
	/**
	 * The main API key for PostHog telemetry service.
	 */
	apiKey?: string | undefined
	/**
	 * The API key for PostHog used only for error tracking service.
	 */
	errorTrackingApiKey?: string | undefined
	enableErrorAutocapture?: boolean
	host: string
	uiHost: string
}

/**
 * Helper type for a valid PostHog client configuration.
 * Must contains api keys for both telemetry and error tracking.
 */
export interface PostHogClientValidConfig extends PostHogClientConfig {
	apiKey: string
	errorTrackingApiKey: string
}

/**
 * NOTE: Ensure that dev environment is not used in production.
 * process.env.CI will always be true in the CI environment, during both testing and publishing step,
 * so it is not a reliable indicator of the environment.
 */
const useDevEnv = process.env.IS_DEV === "true" || process.env.CLINE_ENVIRONMENT === "local"

/**
 * PostHog configuration is opt-in in this fork. Do not default to the original
 * project's collector: builds must provide a fork-controlled host and
 * intentionally configured credentials to enable PostHog telemetry.
 */
export const posthogConfig: PostHogClientConfig = {
	apiKey: BUILD_CONSTANTS.TELEMETRY_SERVICE_API_KEY,
	errorTrackingApiKey: BUILD_CONSTANTS.ERROR_SERVICE_API_KEY,
	host: BUILD_CONSTANTS.TELEMETRY_SERVICE_HOST || "",
	uiHost: useDevEnv ? "https://us.i.posthog.com" : "https://us.posthog.com",
	enableErrorAutocapture: BUILD_CONSTANTS.ENABLE_ERROR_AUTOCAPTURE === "true",
}

const isTestEnv = process.env.E2E_TEST === "true" || process.env.IS_TEST === "true"

/**
 * PostHog clients must use an explicitly configured HTTP(S) endpoint.
 * An empty host can make SDKs fall back to their public default collector.
 */
export function hasExplicitPostHogHost(host: unknown): host is string {
	if (typeof host !== "string" || !host.trim()) {
		return false
	}

	try {
		const url = new URL(host.trim())
		return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0
	} catch {
		return false
	}
}

export function isPostHogConfigValid(config: PostHogClientConfig): config is PostHogClientValidConfig {
	// Allow invalid config in test environment to enable mocking and stubbing
	if (isTestEnv) {
		return false
	}
	return (
		typeof config.apiKey === "string" &&
		config.apiKey.trim().length > 0 &&
		typeof config.errorTrackingApiKey === "string" &&
		config.errorTrackingApiKey.trim().length > 0 &&
		hasExplicitPostHogHost(config.host) &&
		hasExplicitPostHogHost(config.uiHost)
	)
}
