"use client";

import { AgentContextUsage, type AgentContextUsageData } from "@cline/ui";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { formatCostUsd } from "@/hooks/use-session-history";

/** Native popover, trigger styling, and cost formatting remain desktop-owned. */
export function TokenUsageRing({
	usage,
	contextWindow,
	lastCompaction,
}: {
	usage: AgentContextUsageData & { totalCost?: number };
	contextWindow?: number;
	lastCompaction?: { reason: string; at: number; thresholdRatio?: number } | null;
}) {
	const compactionLabel =
		lastCompaction?.reason === "auto_compaction"
			? "Automatic"
			: lastCompaction?.reason === "manual_compaction"
				? "Manual"
				: lastCompaction?.reason === "overflow_recovery_compaction"
					? "Overflow recovery"
					: undefined;
	return (
		<AgentContextUsage usage={usage} costLabel={formatCostUsd(usage.totalCost)}>
			{({ triggerLabel, ring, details }) => (
				<Popover>
					<PopoverTrigger asChild>
						<Button
							aria-label={triggerLabel}
							className="size-7 shrink-0 p-0 text-muted-foreground data-[state=open]:bg-surface-hover opacity-65 hover:opacity-100"
							id="token-usage"
							size="icon-sm"
							type="button"
							variant="text"
						>
							{ring}
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						className="w-80 p-0"
						id="token-usage-panel"
						side="top"
						sideOffset={8}
					>
						{details}
						{contextWindow ? (
							<div className="border-t px-4 py-3 text-xs text-muted-foreground">
								<div className="flex items-center justify-between gap-4">
									<span>Effective context</span>
									<span className="font-mono tabular-nums text-foreground">{contextWindow.toLocaleString()}</span>
								</div>
								<div className="flex items-center justify-between gap-4">
									<span>Auto-compaction threshold</span>
									<span className="font-mono tabular-nums text-foreground">{Math.round((lastCompaction?.thresholdRatio ?? 0.9) * 100)}%</span>
								</div>
								{compactionLabel && lastCompaction ? (
									<div className="mt-1 flex items-center justify-between gap-4">
										<span>Last compaction</span>
										<span className="text-foreground" title={new Date(lastCompaction.at).toLocaleString()}>{compactionLabel}</span>
									</div>
								) : null}
							</div>
						) : null}
					</PopoverContent>
				</Popover>
			)}
		</AgentContextUsage>
	);
}
