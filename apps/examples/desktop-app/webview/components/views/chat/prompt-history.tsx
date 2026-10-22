"use client";

import { Clock3, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SessionHudButton } from "./session-hud";

const STORAGE_KEY = "cline.prompt-history.v1";
const MAX_HISTORY = 20;

function readHistory(): string[] {
	try {
		const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, MAX_HISTORY);
	} catch {
		return [];
	}
}

export function recordPromptHistory(prompt: string) {
	const normalized = prompt.trim();
	if (!normalized) return;
	try {
		const next = [normalized, ...readHistory().filter((item) => item !== normalized)].slice(0, MAX_HISTORY);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		window.dispatchEvent(new Event("cline:prompt-history-changed"));
	} catch {
		// Storage can be unavailable in privacy-restricted webviews.
	}
}

export function PromptHistory({ onSelect }: { onSelect: (prompt: string) => void }) {
	const [open, setOpen] = useState(false);
	const [history, setHistory] = useState<string[]>([]);
	const refresh = useCallback(() => setHistory(readHistory()), []);

	useEffect(() => {
		refresh();
		window.addEventListener("cline:prompt-history-changed", refresh);
		return () => window.removeEventListener("cline:prompt-history-changed", refresh);
	}, [refresh]);

	const clear = () => {
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore storage failures.
		}
		setHistory([]);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<SessionHudButton aria-expanded={open} aria-haspopup="dialog" aria-label="Prompt history" className="px-1.5" title="Prompt history" type="button">
					<Clock3 className="size-3.5" />
					<span className="sr-only">Prompt history</span>
				</SessionHudButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 overflow-hidden rounded-xl p-0 shadow-xl" side="top" sideOffset={8}>
				<div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-3 py-2.5">
					<div>
						<p className="text-xs font-semibold text-foreground">Prompt history</p>
						<p className="mt-0.5 text-[10px] text-muted-foreground">Your most recently sent prompts</p>
					</div>
					<button aria-label="Clear prompt history" className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground" onClick={clear} title="Clear history" type="button">
						<Trash2 className="size-3.5" />
					</button>
				</div>
				<div className="max-h-72 overflow-y-auto p-1.5">
					{history.length === 0 ? (
						<div className="px-3 py-6 text-center text-xs text-muted-foreground">No prompt history yet.</div>
					) : (
						history.map((prompt, index) => (
							<button
								className="block w-full rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover hover:text-foreground"
								key={`${prompt}-${index}`}
								onClick={() => {
									onSelect(prompt);
									setOpen(false);
								}}
								type="button"
							>
								<span className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">{prompt}</span>
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
