"use client";

import { Activity, ChevronDown, CircleCheck, CircleX, LoaderCircle, ShieldAlert, Wrench } from "lucide-react";
import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatMessage } from "@/lib/chat-schema";
import { cn } from "@/lib/utils";
import { SessionHudButton } from "./session-hud";

type ToolActivityStripProps = {
	busy: boolean;
	activityLabel?: string | null;
	hasRunningAgents?: boolean;
	pendingToolApprovals?: number;
	pendingAskQuestions?: number;
	messages?: ChatMessage[];
};

function recentTools(messages: ChatMessage[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (let index = messages.length - 1; index >= 0 && result.length < 5; index -= 1) {
		const message = messages[index];
		if (message.role !== "tool") continue;
		const toolName = message.meta?.toolName?.trim();
		if (!toolName || seen.has(toolName)) continue;
		seen.add(toolName);
		result.push(toolName);
	}
	return result;
}

export function ToolActivityStrip({
	busy,
	activityLabel,
	hasRunningAgents = false,
	pendingToolApprovals = 0,
	pendingAskQuestions = 0,
	messages = [],
}: ToolActivityStripProps) {
	const tools = useMemo(() => recentTools(messages), [messages]);
	const hasAttention = pendingToolApprovals > 0 || pendingAskQuestions > 0;
	if (!busy && !hasAttention) return null;

	const label =
		activityLabel?.trim() ||
		(hasAttention ? "Waiting for your input" : "Agent working");

	return (
		<Popover>
			<PopoverTrigger asChild>
				<SessionHudButton
					aria-label={`Session activity: ${label}`}
					aria-live="polite"
					className={cn(
						"max-w-56 px-1.5 motion-reduce:transition-none",
						busy ? "text-foreground" : "text-amber-600 dark:text-amber-400",
					)}
					title={label}
					type="button"
				>
					{hasAttention ? (
						<ShieldAlert className="size-3" />
					) : busy ? (
						<LoaderCircle className="size-3 animate-spin" />
					) : (
						<Activity className="size-3" />
					)}
					<span className="max-w-40 truncate max-[760px]:max-w-24">{label}</span>
					<ChevronDown className="size-3 opacity-60" />
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-72 overflow-hidden rounded-xl border-border/70 bg-popover/95 p-0 shadow-xl backdrop-blur"
				offset={6}
			>
				<div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-2.5">
					<div className="flex items-center gap-2">
						{hasAttention ? (
							<ShieldAlert className="size-3.5 text-amber-500" />
						) : (
							<Activity className="size-3.5 text-primary" />
						)}
						<div className="min-w-0">
							<div className="text-xs font-semibold text-foreground">Session activity</div>
							<div className="truncate text-[10px] text-muted-foreground">{label}</div>
						</div>
					</div>
				</div>
				<div className="space-y-3 p-3">
					{busy ? (
						<div className="flex items-center gap-2 text-xs text-foreground">
							<LoaderCircle className="size-3.5 animate-spin text-primary" />
							<span>Agent is processing the current turn.</span>
						</div>
					) : null}

					{hasRunningAgents ? (
						<div className="flex items-center gap-2 text-xs text-foreground">
							<Activity className="size-3.5 text-primary" />
							<span>Background agent activity is running.</span>
						</div>
					) : null}

					{tools.length > 0 ? (
						<div>
							<div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
								<Wrench className="size-3" /> Recent tools
							</div>
							<div className="space-y-1">
								{tools.map((tool) => (
									<div
										className="flex items-center gap-2 rounded-md bg-muted/45 px-2 py-1.5 text-xs"
										key={tool}
									>
										<CircleCheck className="size-3 text-emerald-500" />
										<span className="truncate">{tool}</span>
									</div>
								))}
							</div>
						</div>
					) : null}

					{pendingToolApprovals > 0 || pendingAskQuestions > 0 ? (
						<div className="space-y-1.5 border-t border-border/50 pt-2">
							{pendingToolApprovals > 0 ? (
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Tool approvals</span>
									<span className="font-medium text-foreground">{pendingToolApprovals}</span>
								</div>
							) : null}
							{pendingAskQuestions > 0 ? (
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground">Questions awaiting answer</span>
									<span className="font-medium text-foreground">{pendingAskQuestions}</span>
								</div>
							) : null}
						</div>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}
