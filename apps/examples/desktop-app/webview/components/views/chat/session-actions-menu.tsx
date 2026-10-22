"use client";

import {
	ArrowUpRight,
	CopyPlus,
	MoreHorizontal,
	RotateCcw,
	Settings2,
	Sparkles,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SessionHudButton } from "./session-hud";

export function SessionActionsMenu({
	canCreateSession,
	canFork,
	canCompact,
	compacting = false,
	onCompact,
	onFork,
	onNewSession,
	onOpenModelSettings,
}: {
	canCreateSession: boolean;
	canFork: boolean;
	canCompact: boolean;
	compacting?: boolean;
	onCompact?: () => Promise<void> | void;
	onFork?: () => Promise<void> | void;
	onNewSession?: () => void;
	onOpenModelSettings?: () => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<SessionHudButton
					aria-label="Session actions"
					className="px-1.5"
					title="Session actions"
					type="button"
				>
					<MoreHorizontal className="size-3.5" />
				</SessionHudButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64 rounded-xl p-1.5" side="top" sideOffset={8}>
				<DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
					Session actions
				</DropdownMenuLabel>
				<DropdownMenuItem disabled={!canCreateSession} onSelect={() => onNewSession?.()}>
					<Sparkles className="size-3.5" />
					<span>New session</span>
				</DropdownMenuItem>
				<DropdownMenuItem disabled={!canFork} onSelect={() => void onFork?.()}>
					<CopyPlus className="size-3.5" />
					<span>Fork session</span>
				</DropdownMenuItem>
				<DropdownMenuItem disabled={!canCompact || compacting} onSelect={() => void onCompact?.()}>
					<RotateCcw className="size-3.5" />
					<span>{compacting ? "Compacting conversation…" : "Compact conversation"}</span>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem disabled={!onOpenModelSettings} onSelect={() => onOpenModelSettings?.()}>
					<Settings2 className="size-3.5" />
					<span>Model settings</span>
					<ArrowUpRight className="ml-auto size-3 text-muted-foreground" />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
