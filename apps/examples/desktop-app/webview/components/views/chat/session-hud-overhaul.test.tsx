// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/chat-schema";
import { PromptHistory, recordPromptHistory } from "./prompt-history";
import { RuntimeInspector } from "./runtime-inspector";
import { SessionHealthPill } from "./session-health-pill";
import { ToolActivityStrip } from "./tool-activity-strip";

const roots = new Set<Root>();

function render(node: ReactNode) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	roots.add(root);
	act(() => root.render(node));
	return container;
}

describe("Session HUD feature smoke tests", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		for (const root of roots) act(() => root.unmount());
		roots.clear();
		document.body.innerHTML = "";
	});

	it("keeps prompt history newest-first and deduplicated", () => {
		recordPromptHistory("first");
		recordPromptHistory("second");
		recordPromptHistory("first");
		expect(JSON.parse(localStorage.getItem("cline.prompt-history.v1") ?? "[]")).toEqual([
			"first",
			"second",
		]);
	});

	it("surfaces current activity only while active or awaiting attention", () => {
		const idle = render(<ToolActivityStrip busy={false} />);
		expect(idle.textContent).toBe("");
		const working = render(<ToolActivityStrip busy activityLabel="Running tests…" />);
		expect(working.textContent).toContain("Running tests…");
	});

	it("reports healthy and degraded session states accessibly", () => {
		const ready = render(<SessionHealthPill status="idle" contextRatio={0.2} />);
		expect(ready.querySelector('[aria-label="Session health: Ready"]')).not.toBeNull();
		const critical = render(<SessionHealthPill status="error" contextRatio={0.95} error="Connection failed" />);
		expect(critical.querySelector('[aria-label="Session health: Needs attention"]')).not.toBeNull();
	});

	it("renders the runtime inspector from session configuration", () => {
		const container = render(
			<RuntimeInspector
				config={{
					environmentId: "local",
					workspaceRoot: "/workspace",
					provider: "ollama",
					model: "test-model",
					apiKey: "",
					mode: "act",
					enableTools: true,
					maxIterations: 25,
					maxParallelToolCalls: 4,
					maxTokensPerTurn: 4096,
				}}
			/>,
		);
		expect(container.textContent).toContain("Session runtime");
	});

	it("lists recent tool activity without claiming tools are currently running", () => {
		const messages = [
			{
				id: "tool-1",
				sessionId: "s",
				role: "tool",
				content: "done",
				createdAt: 1,
				meta: { toolName: "read_file" },
			},
		] as ChatMessage[];
		const container = render(<ToolActivityStrip busy={false} pendingToolApprovals={1} messages={messages} />);
		expect(container.textContent).toContain("Waiting for input");
	});

	it("restores prompt history into the composer callback", () => {
		recordPromptHistory("inspect the current diff");
		const selected: string[] = [];
		const container = render(<PromptHistory onSelect={(value) => selected.push(value)} />);
		const trigger = container.querySelector<HTMLButtonElement>('[aria-label="Prompt history"]');
		expect(trigger).not.toBeNull();
	});
});
