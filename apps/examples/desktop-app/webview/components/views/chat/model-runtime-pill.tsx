"use client";

import type { ReactNode } from "react";
import { Brain, Eye, Info, Wrench } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SessionHudButton } from "./session-hud";

export function ModelRuntimePill({
	provider,
	model,
	contextWindow,
	reasoningSupport,
	imageSupport,
	toolsEnabled,
}: {
	provider: string;
	model: string;
	contextWindow?: number;
	reasoningSupport: boolean | null;
	imageSupport: boolean | null;
	toolsEnabled: boolean;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<SessionHudButton aria-label="Model capabilities" className="max-w-48" title={`${provider} / ${model}`}>
					<Info className="size-3 shrink-0 text-muted-foreground" />
					<span className="hidden max-w-32 truncate sm:inline">{model}</span>
					<span aria-hidden="true" className="flex shrink-0 items-center gap-1 text-muted-foreground/75">
						{imageSupport === true ? <Eye className="size-3" /> : null}
						{reasoningSupport === true ? <Brain className="size-3" /> : null}
						{toolsEnabled ? <Wrench className="size-3" /> : null}
					</span>
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-0" side="top" sideOffset={8}>
				<div className="border-b px-4 py-3">
					<p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active model</p>
					<p className="mt-1 truncate text-sm font-semibold text-foreground">{model}</p>
					<p className="mt-0.5 truncate text-[11px] text-muted-foreground">{provider}</p>
				</div>
				<div className="grid grid-cols-3 gap-2 p-3">
					<Capability label="Tools" supported={toolsEnabled} icon={<Wrench className="size-3.5" />} />
					<Capability label="Vision" supported={imageSupport} icon={<Eye className="size-3.5" />} />
					<Capability label="Reasoning" supported={reasoningSupport} icon={<Brain className="size-3.5" />} />
				</div>
				{contextWindow ? (
					<div className="border-t px-4 py-3 text-xs">
						<div className="flex items-center justify-between gap-4">
							<span className="text-muted-foreground">Context window</span>
							<span className="font-mono tabular-nums text-foreground">{formatTokens(contextWindow)}</span>
						</div>
					</div>
				) : null}
			</PopoverContent>
		</Popover>
	);
}

function Capability({
	label,
	supported,
	icon,
}: {
	label: string;
	supported: boolean | null;
	icon: ReactNode;
}) {
	return (
		<div className="rounded-lg border bg-muted/20 px-2 py-2">
			<div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px]">{label}</span></div>
			<p className="mt-1 text-[11px] font-medium text-foreground">{supported === null ? "Unknown" : supported ? "Supported" : "Unavailable"}</p>
		</div>
	);
}

function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	return value.toLocaleString();
}
