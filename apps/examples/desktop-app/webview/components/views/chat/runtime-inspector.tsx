"use client";

import { Cpu, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatSessionConfig } from "@/lib/chat-schema";
import { SessionHudButton } from "./session-hud";

export function RuntimeInspector({ config }: { config: ChatSessionConfig }) {
	const loopDetection = config.loopDetection;
	const loopLabel =
		loopDetection === false
			? "Off"
			: loopDetection
				? `${loopDetection.softThreshold ?? "default"}/${loopDetection.hardThreshold ?? "default"}`
				: "Default";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<SessionHudButton aria-haspopup="dialog" aria-label="Session runtime details" className="px-1.5" title="Session runtime details" type="button">
					<SlidersHorizontal className="size-3.5" />
					<span className="hidden min-[1020px]:inline">Runtime</span>
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 overflow-hidden rounded-xl p-0 shadow-xl" side="top" sideOffset={8}>
				<div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-2.5">
					<div className="flex items-center gap-2">
						<div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><Cpu className="size-3.5" /></div>
						<div>
							<p className="text-xs font-semibold text-foreground">Session runtime</p>
							<p className="text-[10px] text-muted-foreground">Current limits and execution strategy</p>
						</div>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-2 p-3">
					<RuntimeValue label="Max iterations" value={formatNumber(config.maxIterations)} />
					<RuntimeValue label="Parallel tools" value={formatNumber(config.maxParallelToolCalls)} />
					<RuntimeValue label="Max output / turn" value={formatNumber(config.maxTokensPerTurn)} />
					<RuntimeValue label="Mistake limit" value={formatNumber(config.maxConsecutiveMistakes)} />
					<RuntimeValue label="Thinking" value={config.thinking === false ? "Off" : config.reasoningEffort ?? "Default"} />
					<RuntimeValue label="Thinking budget" value={formatNumber(config.thinkingBudgetTokens)} />
					<RuntimeValue label="Loop detection" value={loopLabel} />
					<RuntimeValue label="Tools" value={config.enableTools ? "Enabled" : "Disabled"} />
				</div>
				<div className="border-t bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
					Provider-specific generation settings remain under Model Settings so the Session HUD stays compact.
				</div>
			</PopoverContent>
		</Popover>
	);
}

function RuntimeValue({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border bg-muted/20 px-2.5 py-2">
			<p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="mt-1 truncate font-mono text-[11px] tabular-nums text-foreground">{value}</p>
		</div>
	);
}

function formatNumber(value: number | undefined): string {
	return value === undefined ? "Default" : value.toLocaleString();
}
