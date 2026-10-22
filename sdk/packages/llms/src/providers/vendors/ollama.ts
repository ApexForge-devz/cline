// Ollama vendor backed by the native Ollama API (`/api/chat`) via the
// `ollama-ai-provider-v2` AI SDK provider.
//
// Ollama cannot be driven through the generic OpenAI-compatible path
// (`/v1/chat/completions`): that endpoint ignores Ollama's proprietary
// `options.num_ctx` field, so every model loads with the server default
// context window (4096) regardless of the model's actual capacity or the
// user's configured context size. The native API accepts
// `options.num_ctx` per request; this boundary maps the provider-neutral
// model `contextWindow` onto it.

import {
	OLLAMA_DEFAULT_MEDIA_BUDGET,
	OLLAMA_DEFAULT_RESPONSE_START_TIMEOUT_MS,
} from "@cline/shared";
import type {
	GatewayProviderContext,
	GatewayResolvedProviderConfig,
} from "@cline/shared";
import { wrapLanguageModel } from "ai";
// The installed package is patched (see
// `patches/ollama-ai-provider-v2@4.0.1.patch`) to preserve four native wire
// contracts the upstream 4.0.1 release breaks: an unset `think` must be
// omitted rather than sent as `false`, mid-stream `{"error": ...}` objects
// must surface as stream errors instead of being dropped before a clean
// finish, attachment-only user turns must send string `content` (not `[]`),
// and tool results must carry the documented `tool_name` field.
// `ollama.wire.test.ts` locks each contract at the real provider boundary;
// drop the patch once an upstream release covers them.
import { createOllama } from "ollama-ai-provider-v2";
import { ensureFetch, resolveApiKey } from "../http";
import { createSplitToolImagesMiddleware } from "../middleware/split-tool-images";
import type { ProviderFactoryResult } from "./types";

/**
 * Normalize a configured base URL to the native Ollama API root expected by
 * the provider (it appends endpoint paths such as `/chat`).
 *
 * Users configure hosts like `http://localhost:11434` or
 * `https://ollama.com`; configs saved by the 4.0.0 OpenAI-compatible
 * routing may carry a `/v1` suffix, and native-API configs an `/api` one.
 */
export function normalizeOllamaBaseUrl(
	baseUrl: string | undefined,
): string | undefined {
	const trimmed = baseUrl?.trim().replace(/\/+$/, "");
	if (!trimmed) {
		return undefined;
	}
	return `${trimmed.replace(/\/(?:v1|api)$/, "")}/api`;
}

/**
 * Time to wait for the response to start when no timeout is configured.
 *
 * Deliberately generous: Ollama holds `/api/chat` open while it cold-loads
 * the model and only sends response headers once loading finishes, so with a
 * large model (or a large `num_ctx`, which this vendor requests) the first
 * request of a session routinely takes minutes before the stream starts.
 * A tight budget here turns every cold load into a user-facing timeout error
 * (see cline/cline#12829 — the legacy handler's 30s default was only
 * tolerable because its retry decorator silently re-issued the request until
 * the model was loaded). Unreachable servers are not this timeout's job:
 * connection-level failures (refused, DNS) reject on their own immediately,
 * and users can always cancel a request from the UI. This only bounds the
 * accepted-but-silent case, and 5 minutes matches the header-timeout default
 * other AI SDK-based agents use.
 */
export const OLLAMA_DEFAULT_TIMEOUT_MS = OLLAMA_DEFAULT_RESPONSE_START_TIMEOUT_MS;

function summarizeOllamaChatRequest(
	input: unknown,
	body: unknown,
): Record<string, unknown> {
	let url: string | undefined;
	if (typeof input === "string") {
		url = input;
	} else if (input instanceof URL) {
		url = input.href;
	} else if (input && typeof input === "object") {
		const candidate = (input as { url?: unknown }).url;
		if (typeof candidate === "string") url = candidate;
	}
	if (typeof body !== "string") {
		return { url, bodyType: typeof body };
	}
	try {
		const parsed = JSON.parse(body) as Record<string, unknown>;
		const rawMessages = Array.isArray(parsed.messages) ? parsed.messages : [];
		const imageChars: number[] = [];
		let imageCount = 0;
		for (const message of rawMessages) {
			if (!message || typeof message !== "object") continue;
			const images = (message as { images?: unknown }).images;
			if (!Array.isArray(images)) continue;
			for (const image of images) {
				if (typeof image === "string") {
					imageCount += 1;
					imageChars.push(image.length);
				}
			}
		}
		return {
			url,
			bodyChars: body.length,
			messageCount: rawMessages.length,
			imageCount,
			imageChars,
		};
	} catch {
		return { url, bodyChars: body.length, parseError: true };
	}
}

/**
 * Read the configured request timeout (the legacy `requestTimeoutMs`
 * setting); zero/invalid values fall back to the default.
 */
export function readOllamaTimeoutMs(
	config: GatewayResolvedProviderConfig,
): number {
	const timeoutMs = config.timeoutMs;
	if (
		typeof timeoutMs === "number" &&
		Number.isFinite(timeoutMs) &&
		timeoutMs > 0
	) {
		return Math.floor(timeoutMs);
	}
	return OLLAMA_DEFAULT_TIMEOUT_MS;
}

/**
 * Wrap a fetch so the *response* must start within `timeoutMs`. Once headers
 * arrive the timer is cleared — streaming the body is never interrupted.
 * Mirrors the legacy handler, which raced the chat call (stream start)
 * against a timeout rather than bounding the whole generation.
 */
export function withOllamaResponseTimeout(
	baseFetch: typeof fetch,
	timeoutMs: number,
): typeof fetch {
	return (async (input, init) => {
		const timeoutController = new AbortController();
		const timer = setTimeout(
			() =>
				timeoutController.abort(
					new Error(
						`Ollama request timed out after ${timeoutMs / 1000} seconds`,
					),
				),
			timeoutMs,
		);
		// AbortSignal.any keeps upstream cancellation live for the entire
		// request (including body streaming after the timer is cleared) and
		// cleans up its own listeners — no manual listener management.
		const upstreamSignal = init?.signal;
		const signal = upstreamSignal
			? AbortSignal.any([upstreamSignal, timeoutController.signal])
			: timeoutController.signal;
		console.log(
			"[Cline Media Trace] ollama:fetch",
			summarizeOllamaChatRequest(input, init?.body),
		);
		try {
			const response = await baseFetch(input, { ...init, signal });
			console.log("[Cline Media Trace] ollama:response", {
				status: response.status,
				ok: response.ok,
			});
			return response;
		} finally {
			clearTimeout(timer);
		}
	}) as typeof fetch;
}

export async function createOllamaProviderModule(
	config: GatewayResolvedProviderConfig,
	_context: GatewayProviderContext,
): Promise<ProviderFactoryResult> {
	// An API key is only needed for Ollama Cloud (ollama.com); local servers
	// accept unauthenticated requests, so a missing key is not an error.
	// The provider accepts auth through headers. An explicit configured header
	// wins over the convenience API-key setting.
	const apiKey = await resolveApiKey(config);
	const baseURL = normalizeOllamaBaseUrl(config.baseUrl);
	const headers = {
		...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
		...config.headers,
	};
	const provider = createOllama({
		...(baseURL ? { baseURL } : {}),
		...(Object.keys(headers).length > 0 ? { headers } : {}),
		compatibility: "strict",
		fetch: withOllamaResponseTimeout(
			ensureFetch(config.fetch),
			readOllamaTimeoutMs(config),
		),
	});
	// Empty-response retries (a common local-backend glitch that otherwise
	// hard-fails the task) are applied centrally in `ai-sdk.ts` for every
	// vendor (see `withEmptyResponseRetry`), wrapped outside this model so
	// each retry re-runs the whole request. `splitToolImagesMiddleware` is
	// attached here, for the same reason as the OpenAI-compatible vendor:
	// the downstream converter stringifies multimodal tool-result content,
	// losing image bytes.
	return {
		operations: {
			language: (modelId) =>
				wrapLanguageModel({
					model: provider.chat(modelId),
					middleware: createSplitToolImagesMiddleware(
						config.mediaBudget ?? OLLAMA_DEFAULT_MEDIA_BUDGET,
					),
				}),
		},
	};
}
