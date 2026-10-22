import type { ChatMessage } from "@/lib/chat-schema";

function comparableAttachmentContent(content: string): string {
	return content
		.trim()
		.replace(/\n+\[attached \d+ files?\]$/i, "")
		.trim();
}

export function mergeUserAttachmentPresentation(
	current: ChatMessage[],
	history: ChatMessage[],
): ChatMessage[] {
	const candidatesByContent = new Map<
		string,
		Array<{ message: ChatMessage; consumed: boolean }>
	>();

	for (const message of current) {
		if (message.role !== "user") continue;
		if (!message.images?.length && !message.meta?.attachments?.length) continue;
		const key = comparableAttachmentContent(message.content);
		const candidates = candidatesByContent.get(key) ?? [];
		candidates.push({ message, consumed: false });
		candidatesByContent.set(key, candidates);
	}

	return history.map((message) => {
		if (message.role !== "user") return message;
		const candidates = candidatesByContent.get(
			comparableAttachmentContent(message.content),
		);
		if (!candidates?.length) return message;

		let best: (typeof candidates)[number] | undefined;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const candidate of candidates) {
			if (candidate.consumed) continue;
			if (
				candidate.message.sessionId &&
				message.sessionId &&
				candidate.message.sessionId !== message.sessionId
			) {
				continue;
			}
			const distance = Math.abs(
				candidate.message.createdAt - message.createdAt,
			);
			if (distance < bestDistance) {
				best = candidate;
				bestDistance = distance;
			}
		}
		if (!best) return message;
		best.consumed = true;

		const images = message.images?.length
			? message.images
			: best.message.images;
		const attachments = message.meta?.attachments?.length
			? message.meta.attachments
			: best.message.meta?.attachments;
		if (!images?.length && !attachments?.length) return message;

		return {
			...message,
			...(images?.length ? { images } : {}),
			...(attachments?.length
				? { meta: { ...(message.meta ?? {}), attachments } }
				: {}),
		};
	});
}

function latestRunCount(messages: ChatMessage[]): number {
	let count = 0;
	for (const message of messages) {
		const stored = message.meta?.runCount ?? message.meta?.checkpoint?.runCount;
		if (stored !== undefined) {
			count = Math.max(count, stored);
		} else if (message.role === "user") {
			count += message.meta?.userRunSpan ?? 1;
		}
	}
	return count;
}

/** A prior run's persisted failure is not evidence that this run has flushed. */
export function canReplaceFailedTurn(
	current: ChatMessage[],
	history: ChatMessage[],
): boolean {
	const liveError = current.at(-1);
	if (liveError?.role !== "error") return true;
	const savedError = history.at(-1);
	if (savedError?.role !== "error") return false;
	if (latestRunCount(history) < latestRunCount(current)) return false;
	// An earlier failure can share the same text and user-run count (e.g. a
	// continuation without a new prompt). Its stable ID still identifies it.
	return !current.slice(0, -1).some((message) => message.id === savedError.id);
}
