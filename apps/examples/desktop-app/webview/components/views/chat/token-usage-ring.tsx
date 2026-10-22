"use client";

import { AgentContextUsage, type AgentContextUsageData } from "@cline/ui";
import { Activity, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCostUsd } from "@/hooks/use-session-history";
import { cn } from "@/lib/utils";

/** Context HUD with compact used/max text and a detailed inspector popover. */
export function TokenUsageRing({
	usage,
	contextWindow,
	lastCompaction,
	onCompact,
	canCompact = false,
	compacting = false,
}: {
	usage: AgentContextUsageData & { totalCost?: number };
	contextWindow?: number;
	lastCompaction?: { reason: string; at: number; thresholdRatio?: number } | null;
	onCompact?: () => Promise<void> | void;
	canCompact?: boolean;
	compacting?: boolean;
}) {
	const totalTokens = usage.tokensIn + usage.tokensOut;
	if (totalTokens <= 0 || !contextWindow || contextWindow <= 0) return null;

	const ratio = Math.min(totalTokens / Math.max(contextWindow, 1), 1);
	const percent = Math.round(ratio * 100);
	const tone = ratio >= 0.9 ? "text-destructive" : ratio >= 0.75 ? "text-amber-500" : "text-muted-foreground";
	const barTone = ratio >= 0.9 ? "bg-destructive" : ratio >= 0.75 ? "bg-amber-500" : "bg-primary";
	const compactionLabel = lastCompaction?.reason === "auto_compaction" ? "Automatic" : lastCompaction?.reason === "manual_compaction" ? "Manual" : lastCompaction?.reason === "overflow_recovery_compaction" ? "Overflow recovery" : undefined;

	return (
		<AgentContextUsage usage={usage} costLabel={formatCostUsd(usage.totalCost)}>
			{({ triggerLabel, ring, details }) => (
				<Popover>
					<PopoverTrigger asChild>
						<Button
							aria-label={triggerLabel}
							className={cn("group h-7 min-w-0 gap-1.5 rounded-md border border-transparent px-2 text-[10px] font-mono tabular-nums text-muted-foreground hover:border-border/60 hover:bg-surface-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:border-border/70 data-[state=open]:bg-surface-hover", tone)}
							id="token-usage"
							type="button"
							variant="text"
						>
							<span className="relative flex size-3.5 shrink-0 items-center justify-center overflow-hidden rounded-full">
								<span className={cn("absolute inset-0.5 rounded-full opacity-15", barTone)} />
								{ring}
							</span>
							<span className="hidden min-[620px]:inline">{formatCompactTokens(totalTokens)} / {formatCompactTokens(contextWindow)}</span>
							<span className="min-[620px]:hidden">{percent}%</span>
							{ratio >= 0.75 ? <span className="hidden font-sans text-[9px] min-[720px]:inline">{ratio >= 0.9 ? "High" : "Warm"}</span> : null}
							<Activity className="hidden size-3 opacity-50 min-[720px]:inline" />
						</Button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-80 overflow-hidden p-0" id="token-usage-panel" side="top" sideOffset={8}>
						<div className="border-b px-4 py-3">
							<div className="flex items-end justify-between gap-4">
								<div><p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Context</p><p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">{totalTokens.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">/ {contextWindow.toLocaleString()}</span></p></div>
								<span className={cn("font-mono text-xs font-medium tabular-nums", tone)}>{percent}%</span>
							</div>
							<div
								aria-label="Context window usage"
								aria-valuemax={contextWindow}
								aria-valuemin={0}
								aria-valuenow={totalTokens}
								className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
								role="progressbar"
							>
								<div className={cn("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", barTone)} style={{ width: `${ratio * 100}%` }} />
							</div>
							<div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground"><span>{Math.max(contextWindow - totalTokens, 0).toLocaleString()} remaining</span><span>Auto compact {Math.round((lastCompaction?.thresholdRatio ?? 0.9) * 100)}%</span></div>
						</div>
						{details}
						{compactionLabel && lastCompaction ? <div className="border-t px-4 py-2.5 text-[11px] text-muted-foreground"><div className="flex items-center justify-between gap-4"><span>Last compaction</span><span className="font-medium text-foreground" title={new Date(lastCompaction.at).toLocaleString()}>{compactionLabel}</span></div></div> : null}
						{onCompact ? <div className="border-t bg-muted/20 p-2.5"><Button className="h-8 w-full justify-center gap-1.5 text-xs" disabled={!canCompact || compacting} onClick={() => void onCompact()} type="button" variant={ratio >= 0.85 ? "default" : "ghost"}><span className="flex items-center gap-1.5">{compacting ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}{compacting ? "Compacting…" : "Compact conversation"}</span><span className="ml-auto text-[10px] text-muted-foreground">90%</span></Button></div> : null}
					</PopoverContent>
				</Popover>
			)}
		</AgentContextUsage>
	);
}

function formatCompactTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	return value.toLocaleString();
}
