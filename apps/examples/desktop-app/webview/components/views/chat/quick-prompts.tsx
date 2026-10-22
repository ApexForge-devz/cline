"use client";

import {
	BookOpenText,
	Check,
	ChevronDown,
	Copy,
	Edit3,
	GripVertical,
	Plus,
	Save,
	Search,
	Settings2,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SessionHudButton } from "./session-hud";

export type QuickPrompt = {
	id: string;
	name: string;
	prompt: string;
	category?: string;
};

const STORAGE_KEY = "cline.quick-prompts.v1";
const EMPTY: QuickPrompt[] = [];

function readQuickPrompts(): QuickPrompt[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return EMPTY;
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return EMPTY;
		return parsed.filter(
			(entry): entry is QuickPrompt =>
				entry &&
				typeof entry === "object" &&
				typeof entry.id === "string" &&
				typeof entry.name === "string" &&
				typeof entry.prompt === "string" &&
				(typeof entry.category === "string" || entry.category === undefined),
		);
	} catch {
		return EMPTY;
	}
}

function writeQuickPrompts(prompts: QuickPrompt[]) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
		window.dispatchEvent(new CustomEvent("cline:quick-prompts-changed"));
	} catch {
		// Browser storage is optional. The in-memory state remains usable.
	}
}

function newPrompt(): QuickPrompt {
	return {
		id: globalThis.crypto?.randomUUID?.() ?? `prompt-${Date.now()}`,
		name: "",
		prompt: "",
		category: "",
	};
}

function normalizePrompt(prompt: QuickPrompt): QuickPrompt {
	return {
		...prompt,
		name: prompt.name.trim(),
		prompt: prompt.prompt.trim(),
		category: prompt.category?.trim() || undefined,
	};
}

export function QuickPrompts({
	disabled = false,
	onInsert,
}: {
	disabled?: boolean;
	onInsert: (prompt: string) => void;
}) {
	const [prompts, setPrompts] = useState<QuickPrompt[]>(EMPTY);
	const [open, setOpen] = useState(false);
	const [manageOpen, setManageOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [editing, setEditing] = useState<QuickPrompt | null>(null);

	useEffect(() => {
		setPrompts(readQuickPrompts());
		const onChange = () => setPrompts(readQuickPrompts());
		window.addEventListener("cline:quick-prompts-changed", onChange);
		return () => window.removeEventListener("cline:quick-prompts-changed", onChange);
	}, []);

	const categories = useMemo(
		() =>
			Array.from(
				new Set(
					prompts
						.map((prompt) => prompt.category?.trim())
						.filter((category): category is string => Boolean(category)),
				),
			),
		[prompts],
	);
	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return prompts;
		return prompts.filter((prompt) =>
			`${prompt.name} ${prompt.prompt} ${prompt.category ?? ""}`.toLowerCase().includes(query),
		);
	}, [prompts, search]);

	const insertPrompt = (prompt: QuickPrompt) => {
		onInsert(prompt.prompt);
		setOpen(false);
		setSearch("");
	};

	const savePrompt = (draft: QuickPrompt) => {
		const normalized = normalizePrompt(draft);
		if (!normalized.name || !normalized.prompt) {
			toast({ title: "Add a name and prompt", description: "Both fields are required." });
			return;
		}
		setPrompts((current) => {
			const next = current.some((prompt) => prompt.id === normalized.id)
				? current.map((prompt) => (prompt.id === normalized.id ? normalized : prompt))
				: [...current, normalized];
			writeQuickPrompts(next);
			return next;
		});
		setEditing(null);
		toast({ title: "Quick prompt saved" });
	};

	const deletePrompt = (id: string) => {
		setPrompts((current) => {
			const next = current.filter((prompt) => prompt.id !== id);
			writeQuickPrompts(next);
			return next;
		});
	};

	const movePrompt = (id: string, direction: -1 | 1) => {
		setPrompts((current) => {
			const index = current.findIndex((prompt) => prompt.id === id);
			const target = index + direction;
			if (index < 0 || target < 0 || target >= current.length) return current;
			const next = [...current];
			[next[index], next[target]] = [next[target], next[index]];
			writeQuickPrompts(next);
			return next;
		});
	};

	return (
		<>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<SessionHudButton
						aria-expanded={open}
						aria-haspopup="dialog"
						aria-label="Quick prompts"
						disabled={disabled}
						title="Quick prompts"
					>
						<BookOpenText className="size-3.5 shrink-0 text-primary/85" />
						<span className="hidden sm:inline">Quick Prompts</span>
						<ChevronDown className={cn("size-3 opacity-60 transition-transform", open && "rotate-180")} />
					</SessionHudButton>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-[min(30rem,calc(100vw-1rem))] overflow-hidden p-0" side="top" sideOffset={8}>
					<div className="border-b px-3 py-2.5">
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0">
								<div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
									<BookOpenText className="size-3.5 text-primary" />
									Quick Prompts
								</div>
								<p className="mt-0.5 text-[11px] text-muted-foreground">Insert reusable instructions without leaving the composer.</p>
							</div>
							<Button aria-label="Manage quick prompts" onClick={() => { setManageOpen(true); setOpen(false); }} size="icon-sm" title="Manage quick prompts" type="button" variant="ghost">
								<Settings2 className="size-3.5" />
							</Button>
						</div>
						<div className="relative mt-2">
							<Search className="absolute top-2.5 left-2.5 size-3.5 text-muted-foreground" />
							<Input aria-label="Search quick prompts" className="h-8 pl-8 text-xs" onChange={(event) => setSearch(event.target.value)} placeholder="Search prompts..." value={search} />
						</div>
						{categories.length > 0 ? (
							<div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
								{categories.map((category) => <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" key={category}>{category}</span>)}
							</div>
						) : null}
					</div>
					{filtered.length > 0 ? (
						<ScrollArea className="max-h-72">
							<div className="space-y-1 p-2">
								{filtered.map((prompt) => (
									<button className="group w-full rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-border/70 hover:bg-surface-hover" key={prompt.id} onClick={() => insertPrompt(prompt)} type="button">
										<div className="flex items-start gap-2">
											<div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
												<Copy className="size-3" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex items-center gap-2">
													<span className="truncate text-xs font-medium text-foreground">{prompt.name}</span>
													{prompt.category ? <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{prompt.category}</span> : null}
												</div>
												<p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">{prompt.prompt}</p>
											</div>
										</div>
									</button>
								))}
							</div>
						</ScrollArea>
					) : (
						<div className="px-5 py-8 text-center">
							<div className="mx-auto flex size-9 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground"><BookOpenText className="size-4" /></div>
							<p className="mt-2 text-xs font-medium text-foreground">{prompts.length === 0 ? "No prompts configured yet" : "No matching prompts"}</p>
							<p className="mt-1 text-[11px] text-muted-foreground">{prompts.length === 0 ? "Open the settings icon to add your own reusable prompts." : "Try a different search."}</p>
						</div>
					)}
					<div className="border-t bg-muted/20 p-2">
						<Button className="h-8 w-full justify-start text-xs" onClick={() => { setEditing(newPrompt()); setOpen(false); setManageOpen(true); }} type="button" variant="ghost">
							<Plus className="size-3.5" /> Add prompt
						</Button>
					</div>
				</PopoverContent>
			</Popover>

			<Dialog open={manageOpen} onOpenChange={setManageOpen}>
				<DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
					<DialogHeader className="border-b px-5 py-4">
						<DialogTitle>Quick Prompts</DialogTitle>
						<DialogDescription>Configure the reusable prompts shown beside the Session composer. Nothing is preloaded.</DialogDescription>
					</DialogHeader>
					<div className="grid min-h-0 md:grid-cols-[1.15fr_0.85fr]">
						<div className="min-h-0 border-b md:border-r md:border-b-0">
							{prompts.length > 0 ? (
								<ScrollArea className="h-[23rem]">
									<div className="space-y-1.5 p-3">
										{prompts.map((prompt, index) => (
											<div className="group flex items-start gap-2 rounded-lg border border-transparent p-2 hover:border-border/70 hover:bg-muted/30" key={prompt.id}>
												<GripVertical className="mt-1 size-3.5 shrink-0 cursor-grab text-muted-foreground/50" />
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-2">
														<span className="truncate text-xs font-medium">{prompt.name}</span>
														{prompt.category ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{prompt.category}</span> : null}
													</div>
													<p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{prompt.prompt}</p>
												</div>
												<div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
													<Button aria-label={`Move ${prompt.name} up`} disabled={index === 0} onClick={() => movePrompt(prompt.id, -1)} size="icon-sm" title="Move up" type="button" variant="ghost">↑</Button>
													<Button aria-label={`Move ${prompt.name} down`} disabled={index === prompts.length - 1} onClick={() => movePrompt(prompt.id, 1)} size="icon-sm" title="Move down" type="button" variant="ghost">↓</Button>
													<Button aria-label={`Edit ${prompt.name}`} onClick={() => setEditing(prompt)} size="icon-sm" title="Edit" type="button" variant="ghost"><Edit3 className="size-3" /></Button>
													<Button aria-label={`Delete ${prompt.name}`} onClick={() => deletePrompt(prompt.id)} size="icon-sm" title="Delete" type="button" variant="ghost"><Trash2 className="size-3 text-destructive" /></Button>
												</div>
											</div>
										))}
									</div>
								</ScrollArea>
							) : (
								<div className="flex h-[23rem] items-center justify-center p-8 text-center"><div><div className="mx-auto flex size-10 items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground"><BookOpenText className="size-4" /></div><p className="mt-3 text-xs font-medium">Your prompt shelf is empty</p><p className="mt-1 text-[11px] text-muted-foreground">Add the reusable instructions you use often.</p></div></div>
							)}
							<div className="border-t p-3">
								<Button className="w-full" onClick={() => setEditing(newPrompt())} type="button"><Plus className="size-3.5" /> Add prompt</Button>
							</div>
						</div>
						<div className="p-4">
							{editing ? <QuickPromptEditor draft={editing} onChange={setEditing} onSave={savePrompt} onCancel={() => setEditing(null)} /> : <div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">Select a prompt to edit, or create a new one.</div>}
						</div>
					</div>
					<DialogFooter className="border-t px-5 py-3">
						<div className="flex w-full items-center justify-between gap-3"><span className="text-[10px] text-muted-foreground">Stored locally in this desktop app.</span><Button onClick={() => setManageOpen(false)} type="button">Done <Check className="size-3.5" /></Button></div>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function QuickPromptEditor({
	draft,
	onChange,
	onSave,
	onCancel,
}: {
	draft: QuickPrompt;
	onChange: (prompt: QuickPrompt) => void;
	onSave: (prompt: QuickPrompt) => void;
	onCancel: () => void;
}) {
	return (
		<div className="flex min-h-72 flex-col gap-3">
			<div>
				<h3 className="text-sm font-semibold text-foreground">Prompt details</h3>
				<p className="mt-0.5 text-[11px] text-muted-foreground">Keep the name short; the prompt can be as detailed as needed.</p>
			</div>
			<div className="space-y-1.5">
				<label className="text-[11px] font-medium" htmlFor="quick-prompt-name">Name</label>
				<Input id="quick-prompt-name" onChange={(event) => onChange({ ...draft, name: event.target.value })} placeholder="e.g. Review implementation" value={draft.name} />
			</div>
			<div className="space-y-1.5">
				<label className="text-[11px] font-medium" htmlFor="quick-prompt-category">Category</label>
				<Input id="quick-prompt-category" onChange={(event) => onChange({ ...draft, category: event.target.value })} placeholder="Optional" value={draft.category ?? ""} />
			</div>
			<div className="flex min-h-0 flex-1 flex-col space-y-1.5">
				<label className="text-[11px] font-medium" htmlFor="quick-prompt-body">Prompt</label>
				<Textarea className="min-h-40 flex-1 resize-none text-xs leading-5" id="quick-prompt-body" onChange={(event) => onChange({ ...draft, prompt: event.target.value })} placeholder="Write the reusable instruction..." value={draft.prompt} />
			</div>
			<div className="flex justify-end gap-2 pt-1">
				<Button onClick={onCancel} type="button" variant="ghost">Cancel</Button>
				<Button onClick={() => onSave(draft)} type="button"><Save className="size-3.5" /> Save prompt</Button>
			</div>
		</div>
	);
}
