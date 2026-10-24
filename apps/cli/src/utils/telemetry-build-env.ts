const SENSITIVE_ENV_VARS = [
	"TELEMETRY_SERVICE_API_KEY",
	"ERROR_SERVICE_API_KEY",
	"OTEL_EXPORTER_OTLP_HEADERS",
] as const;

const OPTIONAL_FEATURE_ENV_VARS = ["CLINE_CODE_CLOUD_AGENTS"] as const;

// Only explicitly selected non-secret OpenTelemetry settings are inlined.
// Do not use Bun's broad env: "OTEL_*" option here: it can embed headers and
// any other matching environment variable into a public executable.
const OTEL_ENV_VARS = [
	"OTEL_TELEMETRY_ENABLED",
	"OTEL_METRICS_EXPORTER",
	"OTEL_LOGS_EXPORTER",
	"OTEL_TRACES_EXPORTER",
	"OTEL_EXPORTER_OTLP_PROTOCOL",
	"OTEL_EXPORTER_OTLP_ENDPOINT",
	"OTEL_METRIC_EXPORT_INTERVAL",
	"CLINE_TRACE_SAMPLE_PERCENT",
	"CLINE_TRACE_RECORD_CONTENT",
] as const;

export type TelemetryBuildEnv = Record<string, string | undefined>;

/**
 * Return Bun define values for the CLI build.
 *
 * Bun embeds defined values in the compiled output. Secret telemetry
 * credentials and OTLP headers are therefore refused by default, and always
 * refused in CI. Private local dogfood builds can opt in explicitly, but get a
 * warning because the resulting binary remains inspectable.
 */
export function telemetryDefineValues(
	env: TelemetryBuildEnv = process.env,
): Record<string, string> {
	const configuredSecrets = SENSITIVE_ENV_VARS.filter((name) => Boolean(env[name]));
	const allowEmbeddedSecrets =
		env.CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS === "1";
	const isCiBuild = Boolean(env.CI) || env.GITHUB_ACTIONS === "true";

	if (configuredSecrets.length > 0 && isCiBuild) {
		throw new Error(
			"Refusing to embed telemetry credentials in CI (" +
				configuredSecrets.join(", ") +
				" is set). Remove these values from the build environment and provide credentials through a trusted runtime service.",
		);
	}

	if (configuredSecrets.length > 0 && !allowEmbeddedSecrets) {
		throw new Error(
			[
				"Refusing to embed telemetry credentials in a compiled CLI binary: " +
					configuredSecrets.join(", ") +
					" is set.",
				"Compiled client binaries are inspectable. Use credentials from a trusted runtime service instead; CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS=1 is for local private dogfood builds only.",
			].join("\n"),
		);
	}

	if (configuredSecrets.length > 0 && allowEmbeddedSecrets) {
		console.warn(
			"WARNING: embedding telemetry credentials in a compiled CLI binary (" +
				configuredSecrets.join(", ") +
				"). Anyone with the binary may be able to extract them.",
		);
	}

	const defines: Record<string, string> = {};
	const define = (name: string, value: string) => {
		defines["process.env." + name] = JSON.stringify(value);
	};

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

	return defines;
}
