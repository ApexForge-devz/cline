import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-schema";
import {
	canReplaceFailedTurn,
	mergeUserAttachmentPresentation,
} from "./history-reconciliation";

const row = (
	id: string,
	role: ChatMessage["role"],
	runCount?: number,
): ChatMessage => ({
	id,
	role,
	sessionId: "s",
	content: "same text",
	createdAt: 1,
	meta: runCount ? { runCount } : undefined,
});

describe("failed turn history reconciliation", () => {
	it("rejects an earlier error while a repeated prompt has a new live failure", () => {
		const old = [row("u1", "user", 4), row("e1", "error", 4)];
		const current = [
			...old,
			row("u2", "user"),
			row("partial", "assistant"),
			row("tool", "tool"),
			row("live", "error"),
		];
		expect(canReplaceFailedTurn(current, old)).toBe(false);
		expect(canReplaceFailedTurn(current, [...old, row("u2", "user", 5)])).toBe(
			false,
		);
		expect(
			canReplaceFailedTurn(current, [
				...old,
				row("u2", "user", 5),
				row("e2", "error", 5),
			]),
		).toBe(true);
	});
	it("rejects an earlier error ID even for a continuation in the same user run", () => {
		const old = [row("u1", "user"), row("e1", "error")];
		expect(canReplaceFailedTurn([...old, row("live", "error")], old)).toBe(
			false,
		);
	});
});


describe("user attachment presentation reconciliation", () => {
	it("restores the optimistic image and metadata onto matching canonical user rows", () => {
		const current: ChatMessage[] = [
			{
				id: "live-old",
				sessionId: "s",
				role: "user",
				content: "same text",
				createdAt: 100,
			},
			{
				id: "live-new",
				sessionId: "s",
				role: "user",
				content: "same text",
				createdAt: 200,
				images: [{ id: "image-1", mediaType: "image/png", data: "aGk=" }],
				meta: {
					attachments: [
						{ name: "picture.png", kind: "image", mediaType: "image/png", sizeBytes: 2 },
					],
				},
			},
		];
		const history: ChatMessage[] = [
			{ id: "history-old", sessionId: "s", role: "user", content: "same text", createdAt: 100 },
			{ id: "history-new", sessionId: "s", role: "user", content: "same text", createdAt: 200 },
		];

		const merged = mergeUserAttachmentPresentation(current, history);
		expect(merged[0]?.images).toBeUndefined();
		expect(merged[1]?.images?.[0]?.data).toBe("aGk=");
		expect(merged[1]?.meta?.attachments?.[0]?.name).toBe("picture.png");
	});

	it("strips the UI-only attached-file suffix when matching canonical content", () => {
		const current: ChatMessage[] = [
			{
				id: "live",
				sessionId: "s",
				role: "user",
				content: "Review these\n\n[attached 1 file]",
				createdAt: 50,
				meta: { attachments: [{ name: "MyScript.cs", kind: "file", sizeBytes: 12 }] },
			},
		];
		const history: ChatMessage[] = [
			{ id: "history", sessionId: "s", role: "user", content: "Review these", createdAt: 50 },
		];

		const merged = mergeUserAttachmentPresentation(current, history);
		expect(merged[0]?.meta?.attachments?.[0]?.name).toBe("MyScript.cs");
	});
});
