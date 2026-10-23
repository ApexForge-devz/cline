/**
 * Build-time inlining of telemetry configuration for compiled desktop sidecars.
 * Unset values inline as empty strings because packaged apps do not inherit the
 * build shell environment.
 */

const SENSITIVE_ENV_VARS = [
	"TELEMETRY_SERVICE_API_KEY",
	"ERROR_SERVICE_API_KEY",
	"OTEL_EXPORTER_OTLP_HEADERS",
] as const;

/** Optional build-time feature flag for private dogfood builds. */
const OPTIONAL_FEATURE_ENV_VARS = ["CLINE_CODE_CLOUD_AGENTS"] as const;

/**
 * Non-secret env vars consumed by getTelemetryBuildTimeConfig.
 * OTEL headers are handled separately because they commonly contain credentials.
 */
const OTEL_ENV_VARS = [
	"OTEL_TELEMETRY_ENABLED",
	"OTEL_METRICS_EXPORTER",
	"OTEL_LOGS_EXPORTER",
	"OTEL_TRACES_EXPORTER",
	"OTEL_EXPORTER_OTLP_PROTOCOL",
	"OTEL_EXPORTER_OTLP_ENDPOINT",
	"OTEL_METRIC_EXPORT_INTERVAL",
] as const;

/**
 * `--define` argument pairs for `bun build`.
 *
 * Secret telemetry credentials and OTLP headers are refused by default: Bun
 * embeds defined values in the compiled binary, where they can be extracted.
 * For private, access-controlled dogfood builds only, set
 * CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS=1 explicitly.
 */
export function telemetryDefineArgs(
	env: Record<string, string | undefined> = process.env,
): string[] {
	const args: string[] = [];
	const define = (name: string, value: string) => {
		args.push("--define", `process.env.${name}=${JSON.stringify(value)}`);
	};
	const configuredSecrets = SENSITIVE_ENV_VARS.filter((name) => Boolean(env[name]));
	const allowEmbeddedSecrets = env.CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS === "1";
	const isCiBuild = Boolean(env.CI) || env.GITHUB_ACTIONS === "true";
	if (configuredSecrets.length > 0 && isCiBuild) {
		throw new Error(
			`Refusing to embed telemetry credentials in CI (${configuredSecrets.join(", ")} is set). Remove these values from the build environment and provide credentials through a trusted runtime service.`,
		);
	}
	if (configuredSecrets.length > 0 && !allowEmbeddedSecrets) {
		throw new Error(
			[
				`Refusing to embed telemetry credentials in a compiled desktop binary: ${configuredSecrets.join(", ")} is set.`,
				"Compiled client binaries are inspectable. Use credentials from a trusted runtime service instead; the explicit CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS=1 opt-in is for local private dogfood builds only.",
			].join("\n"),
		);
	}
	if (configuredSecrets.length > 0 && allowEmbeddedSecrets) {
		console.warn(
			`WARNING: embedding telemetry credentials in a compiled desktop binary (${configuredSecrets.join(", ")}). Anyone with the binary may be able to extract them.`,
		);
	}
	for (const name of [
		"TELEMETRY_SERVICE_API_KEY",
		"ERROR_SERVICE_API_KEY",
		...OPTIONAL_FEATURE_ENV_VARS,
	]) {
		const value = env[name];
		if (value) define(name, value);
	}
	for (const name of OTEL_ENV_VARS) {
		define(name, env[name] ?? "");
	}
	define("OTEL_EXPORTER_OTLP_HEADERS", env.OTEL_EXPORTER_OTLP_HEADERS ?? "");
	return args;
}
