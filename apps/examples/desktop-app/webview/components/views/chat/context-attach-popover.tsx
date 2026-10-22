"use client";

import type { ReactNode } from "react";
import { Braces, ClipboardList, FileDiff, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatMessage } from "@/lib/chat-schema";
import type { SessionFileDiff } from "@/lib/session-diff";
import { SessionHudButton } from "./session-hud";

function buildGitChangeContext(fileDiffs: SessionFileDiff[]): string {
	const lines = fileDiffs.map(
		(file) => `- ${file.path} (+${file.additions}/-${file.deletions})`,
	);
	return [
		"Review the current workspace changes before proceeding.",
		"",
		"Changed files:",
		...lines,
	].join("\n");
}

function latestToolContext(messages: ChatMessage[]): string | null {
	const tools = messages
		.filter((message) => message.role === "tool" && message.meta?.toolName)
		.slice(-6)
		.map((message) => message.meta?.toolName?.trim())
		.filter((name): name is string => Boolean(name));
	const unique = [...new Set(tools)];
	if (unique.length === 0) return null;
	return `Recent tools used in this session:\n${unique.map((name) => `- ${name}`).join("\n")}`;
}

export function ContextAttachPopover({
	error,
	fileDiffs,
	messages,
	onInsert,
}: {
	error?: string | null;
	fileDiffs: SessionFileDiff[];
	messages: ChatMessage[];
	onInsert: (context: string) => void;
}) {
	const gitChangesAvailable = fileDiffs.length > 0;
	const errorAvailable = Boolean(error?.trim());
	const toolContext = latestToolContext(messages);
	const toolsAvailable = Boolean(toolContext);

	const insert = (context: string | null) => {
		if (!context) return;
		onInsert(context);
	};

	return (
		<Popover>
			<PopoverTrigger asChild>
				<SessionHudButton
					aria-label="Add context"
					aria-haspopup="dialog"
					className="px-1.5"
					title="Add context to your next message"
				type="button"
				>
					<Plus className="size-3.5" />
					<span className="hidden min-[850px]:inline">Context</span>
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 overflow-hidden rounded-xl p-0 shadow-xl" side="top" sideOffset={8}>
				<div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-2.5">
					<div className="flex items-center gap-2">
						<div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
							<Plus className="size-3.5" />
						</div>
						<div>
							<p className="text-xs font-semibold text-foreground">Add context</p>
							<p className="text-[10px] text-muted-foreground">Insert a compact context hint into the composer.</p>
						</div>
					</div>
				</div>
				<div className="space-y-1.5 p-2">
					<ContextOption
						disabled={!gitChangesAvailable}
						description={gitChangesAvailable ? `${fileDiffs.length} changed file${fileDiffs.length === 1 ? "" : "s"}` : "No workspace changes detected"}
						icon={<FileDiff className="size-3.5" />}
						label="Workspace changes"
						onClick={() => insert(buildGitChangeContext(fileDiffs))}
					/>
					<ContextOption
						disabled={!errorAvailable}
						description={errorAvailable ? "Insert the latest session error" : "No active error"}
						icon={<ClipboardList className="size-3.5" />}
						label="Current error"
						onClick={() => insert(error?.trim() ? `The current session error is:\n${error.trim()}` : null)}
					/>
					<ContextOption
						disabled={!toolsAvailable}
						description={toolsAvailable ? "Insert the recent tool activity" : "No recent tools"}
						icon={<Braces className="size-3.5" />}
						label="Recent tools"
						onClick={() => insert(toolContext)}
					/>
				</div>
				<div className="border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
					Use <span className="font-medium text-foreground">@</span> in the composer when you need to attach a specific workspace file.
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ContextOption({
	disabled,
	description,
	icon,
	label,
	onClick,
}: {
	disabled: boolean;
	description: string;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<button
			className="flex w-full items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border/70 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>
			<div className="min-w-0 flex-1">
				<div className="text-xs font-medium text-foreground">{label}</div>
				<div className="truncate text-[10px] text-muted-foreground">{description}</div>
			</div>
		</button>
	);
}
