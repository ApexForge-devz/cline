export interface OllamaRuntimeModelDiagnostics {
	name?: string;
	model?: string;
	size?: number;
	digest?: string;
	expiresAt?: string;
	sizeVram?: number;
	contextLength?: number;
	details?: Record<string, unknown>;
}

export interface OllamaRuntimeDiagnostics {
	baseUrl: string;
	version: string | null;
	models: OllamaRuntimeModelDiagnostics[];
	checkedAt: string;
	unsupportedControls: string[];
}

const DEFAULT_TIMEOUT_MS = 2500;

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "");
}

function sanitizeDiagnosticBaseUrl(baseUrl: string): string {
	try {
		const url = new URL(baseUrl);
		url.username = "";
		url.password = "";
		url.search = "";
		url.hash = "";
		return url.toString().replace(/\/$/, "");
	} catch {
		return baseUrl;
	}
}

async function fetchJson(
	url: string,
	fetchImpl: typeof fetch,
	timeoutMs: number,
): Promise<unknown> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetchImpl(url, {
			method: "GET",
			headers: { Accept: "application/json" },
			signal: controller.signal,
		});
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	} finally {
		clearTimeout(timer);
	}
}

function parseRunningModels(value: unknown): OllamaRuntimeModelDiagnostics[] {
	if (!value || typeof value !== "object") return [];
	const models = (value as { models?: unknown }).models;
	if (!Array.isArray(models)) return [];
	return models
		.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
		.map((item) => ({
			name: typeof item.name === "string" ? item.name : undefined,
			model: typeof item.model === "string" ? item.model : undefined,
			size: typeof item.size === "number" ? item.size : undefined,
			digest: typeof item.digest === "string" ? item.digest : undefined,
			expiresAt: typeof item.expires_at === "string" ? item.expires_at : undefined,
			sizeVram: typeof item.size_vram === "number" ? item.size_vram : undefined,
			contextLength:
				typeof item.context_length === "number" ? item.context_length : undefined,
			details:
				item.details && typeof item.details === "object" && !Array.isArray(item.details)
					? (item.details as Record<string, unknown>)
					: undefined,
		}));
}

export async function getOllamaRuntimeDiagnostics(
	baseUrl: string,
	options: {
		fetchImpl?: typeof fetch;
		timeoutMs?: number;
	} = {},
): Promise<OllamaRuntimeDiagnostics> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
	const [psResult, versionResult] = await Promise.allSettled([
		fetchJson(`${normalizedBaseUrl}/api/ps`, fetchImpl, timeoutMs),
		fetchJson(`${normalizedBaseUrl}/api/version`, fetchImpl, timeoutMs),
	]);
	const version =
		versionResult.status === "fulfilled" &&
		versionResult.value &&
		typeof versionResult.value === "object" &&
		typeof (versionResult.value as { version?: unknown }).version === "string"
			? (versionResult.value as { version: string }).version
			: null;
	return {
		baseUrl: sanitizeDiagnosticBaseUrl(normalizedBaseUrl),
		version,
		models: psResult.status === "fulfilled" ? parseRunningModels(psResult.value) : [],
		checkedAt: new Date().toISOString(),
		unsupportedControls: [
			"num_batch",
			"num_thread",
			"num_gpu",
			"main_gpu",
			"low-VRAM mode",
			"memory mapping / locking",
		],
	};
}
