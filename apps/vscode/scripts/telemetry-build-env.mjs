const SENSITIVE_ENV_VARS = [
	"TELEMETRY_SERVICE_API_KEY",
	"ERROR_SERVICE_API_KEY",
	"OTEL_EXPORTER_OTLP_HEADERS",
];

/**
 * Create build-time definitions for sensitive telemetry configuration.
 *
 * Compiled extensions are inspectable, so credentials are never embedded by
 * default and are always rejected in CI. PostHog keys also require an explicit
 * collector host; this fork must not silently send events to data.cline.bot.
 */
export function telemetrySecretDefineValues(env = process.env, warn = console.warn) {
	const configuredSecrets = SENSITIVE_ENV_VARS.filter((name) => Boolean(env[name]?.trim()));
	const postHogSecrets = ["TELEMETRY_SERVICE_API_KEY", "ERROR_SERVICE_API_KEY"].filter(
		(name) => Boolean(env[name]?.trim()),
	);
	const allowEmbeddedSecrets = env.CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS === "1";
	const isCiBuild = Boolean(env.CI) || env.GITHUB_ACTIONS === "true";
	const traceContentRecordingRequested = /^(1|true|yes|on)$/i.test(
		env.CLINE_TRACE_RECORD_CONTENT?.trim() ?? "",
	);
	const allowTraceContentRecording = env.CLINE_ALLOW_TRACE_CONTENT_RECORDING === "1";

	if (configuredSecrets.length > 0 && isCiBuild) {
		throw new Error(
			"Refusing to embed telemetry credentials in CI (" +
				configuredSecrets.join(", ") +
				" is set). Remove these values from the build environment.",
		);
	}

	if (configuredSecrets.length > 0 && !allowEmbeddedSecrets) {
		throw new Error(
			"Refusing to embed telemetry credentials in a compiled VS Code extension: " +
				configuredSecrets.join(", ") +
				" is set. Use a trusted runtime service or set CLINE_ALLOW_EMBEDDED_TELEMETRY_SECRETS=1 for a private local build only.",
		);
	}

	if (postHogSecrets.length > 0 && !env.CLINE_TELEMETRY_HOST?.trim()) {
		throw new Error(
			"PostHog credentials require an explicit CLINE_TELEMETRY_HOST; the fork will not default to the original project's telemetry collector.",
		);
	}

	if (
		env.OTEL_EXPORTER_OTLP_HEADERS?.trim() &&
		!env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
	) {
		throw new Error(
			"OTEL_EXPORTER_OTLP_HEADERS requires an explicit OTEL_EXPORTER_OTLP_ENDPOINT before credentials can be embedded.",
		);
	}

	if (configuredSecrets.length > 0 && allowEmbeddedSecrets) {
		warn(
			"WARNING: embedding telemetry credentials in a compiled VS Code extension (" +
				configuredSecrets.join(", ") +
				"). Anyone with the extension bundle may be able to extract them.",
		);
	}

	if (traceContentRecordingRequested && isCiBuild) {
		throw new Error(
			"Refusing to enable trace content recording in CI. Model inputs and outputs may contain private workspace data.",
		);
	}

	if (traceContentRecordingRequested && !allowTraceContentRecording) {
		throw new Error(
			"Refusing to enable trace content recording in a compiled VS Code extension by default. Set CLINE_ALLOW_TRACE_CONTENT_RECORDING=1 for a trusted local-only build.",
		);
	}

	if (traceContentRecordingRequested) {
		warn(
			"WARNING: trace content recording is enabled for this private local build. Model inputs and outputs may contain private workspace data.",
		);
	}

	return {
		"process.env.TELEMETRY_SERVICE_API_KEY": env.TELEMETRY_SERVICE_API_KEY
			? JSON.stringify(env.TELEMETRY_SERVICE_API_KEY)
			: "undefined",
		"process.env.ERROR_SERVICE_API_KEY": env.ERROR_SERVICE_API_KEY
			? JSON.stringify(env.ERROR_SERVICE_API_KEY)
			: "undefined",
		"process.env.OTEL_EXPORTER_OTLP_HEADERS": JSON.stringify(
			allowEmbeddedSecrets ? env.OTEL_EXPORTER_OTLP_HEADERS ?? "" : "",
		),
		"process.env.ENABLE_ERROR_AUTOCAPTURE": JSON.stringify(
			allowEmbeddedSecrets ? env.ENABLE_ERROR_AUTOCAPTURE ?? "" : "",
		),
		"process.env.CLINE_TELEMETRY_HOST": JSON.stringify(env.CLINE_TELEMETRY_HOST ?? ""),
		// Define this in every bundle so a runtime environment variable cannot
		// silently enable content capture in an extension built without opt-in.
		"process.env.CLINE_TRACE_RECORD_CONTENT": JSON.stringify(
			traceContentRecordingRequested && allowTraceContentRecording ? "true" : "false",
		),
	};
}
