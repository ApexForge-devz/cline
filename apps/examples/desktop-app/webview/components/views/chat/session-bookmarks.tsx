"use client";

import { Bookmark, Clock3, GitBranch, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatMessage } from "@/lib/chat-schema";
import { SessionHudButton } from "./session-hud";

const STORAGE_KEY = "cline.session-bookmarks.v1";

type BookmarkItem = {
	id: string;
	sessionId: string;
	runCount?: number;
	messageCount: number;
	createdAt: number;
};

function readBookmarks(): BookmarkItem[] {
	try {
		const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
		if (!Array.isArray(value)) return [];
		return value.filter(
			(item): item is BookmarkItem =>
				item &&
				typeof item === "object" &&
				typeof item.id === "string" &&
				typeof item.sessionId === "string" &&
				Number.isInteger(item.messageCount) &&
				Number.isFinite(item.createdAt) &&
				(item.runCount === undefined || (Number.isInteger(item.runCount) && item.runCount > 0)),
		);
	} catch {
		return [];
	}
}

function writeBookmarks(items: BookmarkItem[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 100)));
		window.dispatchEvent(new Event("cline:session-bookmarks-changed"));
	} catch {
		// Bookmarks are a convenience feature; session functionality must not depend on storage.
	}
}

function latestRunCount(messages: ChatMessage[]): number | undefined {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const runCount = messages[index]?.meta?.runCount;
		if (runCount && runCount > 0) return runCount;
	}
	return undefined;
}

export function SessionBookmarks({
	sessionId,
	messages,
	onForkFromRunCount,
}: {
	sessionId?: string | null;
	messages: ChatMessage[];
	onForkFromRunCount?: (runCount: number) => Promise<void> | void;
}) {
	const [open, setOpen] = useState(false);
	const [items, setItems] = useState<BookmarkItem[]>([]);
	const refresh = useCallback(() => setItems(readBookmarks()), []);
	const current = useMemo(
		() => (sessionId ? items.filter((item) => item.sessionId === sessionId).sort((a, b) => b.createdAt - a.createdAt) : []),
		[items, sessionId],
	);
	const currentRunCount = useMemo(() => latestRunCount(messages), [messages]);

	useEffect(() => {
		refresh();
		window.addEventListener("cline:session-bookmarks-changed", refresh);
		return () => window.removeEventListener("cline:session-bookmarks-changed", refresh);
	}, [refresh]);

	const addBookmark = () => {
		if (!sessionId) return;
		const all = readBookmarks();
		const next: BookmarkItem = {
			id: globalThis.crypto?.randomUUID?.() ?? `bookmark-${Date.now()}`,
			sessionId,
			...(currentRunCount !== undefined ? { runCount: currentRunCount } : {}),
			messageCount: messages.length,
			createdAt: Date.now(),
		};
		writeBookmarks([next, ...all]);
		setItems((existing) => [next, ...existing]);
	};

	const removeBookmark = (id: string) => {
		const next = readBookmarks().filter((item) => item.id !== id);
		writeBookmarks(next);
		setItems(next);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<SessionHudButton aria-expanded={open} aria-haspopup="dialog" aria-label="Session bookmarks" className="px-1.5" disabled={!sessionId} title="Session bookmarks" type="button">
					<Bookmark className="size-3.5" />
					<span className="hidden min-[980px]:inline">Bookmarks</span>
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 overflow-hidden rounded-xl p-0 shadow-xl" side="top" sideOffset={8}>
				<div className="border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-2.5">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<Bookmark className="size-3.5 text-primary" />
							<div>
								<p className="text-xs font-semibold text-foreground">Session bookmarks</p>
								<p className="text-[10px] text-muted-foreground">Save useful conversation points.</p>
							</div>
						</div>
						<button aria-label="Bookmark current point" className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground transition-transform active:scale-95 disabled:opacity-50" disabled={!sessionId} onClick={addBookmark} type="button">
							Add
						</button>
					</div>
				</div>
				<div className="max-h-72 overflow-y-auto p-2">
					{current.length === 0 ? (
						<div className="px-3 py-7 text-center text-xs text-muted-foreground">No bookmarks in this session.</div>
					) : (
						<div className="space-y-1">
							{current.map((item, index) => (
								<div className="group flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 hover:border-border/60 hover:bg-muted/30" key={item.id}>
									<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
										{item.runCount ? <GitBranch className="size-3.5" /> : <Clock3 className="size-3.5" />}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs font-medium text-foreground">Point {current.length - index}</p>
										<p className="text-[10px] text-muted-foreground">{item.runCount ? `Run ${item.runCount}` : `${item.messageCount} messages`} · {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
									</div>
									{item.runCount && onForkFromRunCount ? (
										<button aria-label={`Fork from run ${item.runCount}`} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground group-hover:opacity-100" onClick={() => { void onForkFromRunCount(item.runCount!); setOpen(false); }} title={`Fork from run ${item.runCount}`} type="button">
											<GitBranch className="size-3.5" />
										</button>
									) : null}
									<button aria-label={`Delete bookmark ${index + 1}`} className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground group-hover:opacity-100" onClick={() => removeBookmark(item.id)} title="Delete bookmark" type="button">
										<Trash2 className="size-3.5" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
