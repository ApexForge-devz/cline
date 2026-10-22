"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SessionHudSurface({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative flex min-h-7 min-w-0 items-center justify-between gap-1 rounded-b-lg max-[560px]:gap-0.5 border-t border-border/50 bg-gradient-to-r from-background/95 via-background/88 to-background/95 px-1 py-0.5 shadow-[inset_0_1px_0_hsl(var(--border)/0.14)] backdrop-blur-sm",
				"before:pointer-events-none before:absolute before:inset-x-8 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/20 before:to-transparent",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function SessionHud({
	children,
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-0.5 text-muted-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function SessionHudDivider({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn("mx-0.5 h-3.5 w-px shrink-0 bg-border/60", className)}
		/>
	);
}

export function SessionHudButton({
	children,
	className,
	active = false,
	compact = false,
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
	active?: boolean;
	compact?: boolean;
	children: ReactNode;
}) {
	return (
		<button
			className={cn(
				"group inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-[11px] font-medium transition-[background,border-color,color,box-shadow,transform] duration-150 ease-out hover:-translate-y-px hover:border-border/60 hover:bg-surface-hover hover:text-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:translate-y-0 active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none",
				"data-[state=open]:border-border/70 data-[state=open]:bg-surface-hover data-[state=open]:text-foreground data-[state=open]:shadow-xs",
				compact && "px-1.5",
				active && "border-border/70 bg-surface-hover text-foreground shadow-xs",
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}

export function SessionHudLabel({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("truncate leading-none", className)}>{children}</span>
	);
}
