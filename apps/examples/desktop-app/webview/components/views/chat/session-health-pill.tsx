"use client";

import { AlertTriangle, CheckCircle2, HeartPulse, LoaderCircle, MessageCircleQuestion, ShieldAlert, XCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatSessionStatus } from "@/lib/chat-schema";
import { cn } from "@/lib/utils";
import { SessionHudButton } from "./session-hud";

type HealthTone = "good" | "busy" | "attention" | "critical";

export function SessionHealthPill({
	status,
	contextRatio,
	error,
	hasRunningAgents = false,
	pendingToolApprovals = 0,
	pendingAskQuestions = 0,
}: {
	status: ChatSessionStatus;
	contextRatio?: number;
	error?: string | null;
	hasRunningAgents?: boolean;
	pendingToolApprovals?: number;
	pendingAskQuestions?: number;
}) {
	const hasError = Boolean(error?.trim()) || status === "failed" || status === "error";
	const waitingForInput = pendingToolApprovals > 0 || pendingAskQuestions > 0;
	const highContext = (contextRatio ?? 0) >= 0.9;
	const warmContext = (contextRatio ?? 0) >= 0.75;
	const busy = status === "starting" || status === "running" || status === "stopping";

	const tone: HealthTone = hasError ? "critical" : waitingForInput || highContext ? "attention" : busy || hasRunningAgents ? "busy" : "good";
	const label = hasError ? "Needs attention" : waitingForInput ? "Waiting for input" : highContext ? "Compact soon" : busy ? "Working" : warmContext ? "Context warming" : "Ready";
	const icon = hasError ? <XCircle className="size-3" /> : waitingForInput ? <MessageCircleQuestion className="size-3" /> : highContext || warmContext ? <AlertTriangle className="size-3" /> : busy ? <LoaderCircle className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />;
	const toneClass = tone === "critical" ? "text-destructive" : tone === "attention" ? "text-amber-500" : tone === "busy" ? "text-primary" : "text-emerald-500";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<SessionHudButton aria-label={`Session health: ${label}`} className={cn("px-1.5", toneClass)} title={label} type="button">
					<HeartPulse className="size-3" />
					<span className="hidden min-[900px]:inline text-muted-foreground">{label}</span>
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 overflow-hidden rounded-xl p-0 shadow-xl" side="top" sideOffset={8}>
				<div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-2.5">
					<div className="flex items-center gap-2">
						<div className={cn("flex size-7 items-center justify-center rounded-lg bg-muted", toneClass)}>{icon}</div>
						<div>
							<p className="text-xs font-semibold text-foreground">Session health</p>
							<p className={cn("text-[10px]", toneClass)}>{label}</p>
						</div>
					</div>
				</div>
				<div className="space-y-2 p-3 text-xs">
					<HealthRow label="Session" value={formatStatus(status)} good={!hasError} />
					<HealthRow label="Context" value={`${Math.round((contextRatio ?? 0) * 100)}% used`} good={!highContext} />
					<HealthRow label="Background agents" value={hasRunningAgents ? "Active" : "Idle"} good />
					<HealthRow label="Approvals" value={pendingToolApprovals > 0 ? `${pendingToolApprovals} waiting` : "Clear"} good={pendingToolApprovals === 0} />
					<HealthRow label="Questions" value={pendingAskQuestions > 0 ? `${pendingAskQuestions} waiting` : "Clear"} good={pendingAskQuestions === 0} />
					{error?.trim() ? <div className="border-t border-border/50 pt-2 text-[10px] leading-4 text-destructive">{error.trim()}</div> : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function HealthRow({ label, value, good }: { label: string; value: string; good: boolean }) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-muted-foreground">{label}</span>
			<span className={cn("font-medium", good ? "text-foreground" : "text-amber-500")}>{value}</span>
		</div>
	);
}

function formatStatus(status: ChatSessionStatus): string {
	return status.charAt(0).toUpperCase() + status.slice(1);
}
