// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	APP_FONT_SIZE_STORAGE_KEY,
	applyAppZoomAction,
} from "@/lib/app-font-size";
import { SettingsView } from "./settings-view";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke },
	isTauriAvailable: vi.fn(() => false),
	openExternalUrl: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

class ResizeObserverStub {
	disconnect() {}
	observe() {}
	unobserve() {}
}

beforeEach(() => {
	Object.assign(globalThis, {
		IS_REACT_ACT_ENVIRONMENT: true,
		ResizeObserver: ResizeObserverStub,
	});
	if (typeof window.localStorage.clear !== "function") {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			value: window.sessionStorage,
		});
	}
	window.localStorage.clear();
	document.documentElement.style.removeProperty("font-size");
	delete document.documentElement.dataset.clineFontSize;
	invoke.mockReset();
	invoke.mockResolvedValue({
		telemetryOptOut: false,
		autoUpdateEnabled: true,
	});
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});

describe("SettingsView font size", () => {
	it("loads the saved size and updates it from the General settings controls", async () => {
		window.localStorage.setItem(APP_FONT_SIZE_STORAGE_KEY, "17");

		await act(async () => {
			root.render(
				<SettingsView
					onExportDiagnostics={vi.fn()}
					onNavigateSection={vi.fn()}
					section="General"
				/>,
			);
		});

		const slider = container.querySelector<HTMLElement>(
			'[role="slider"][aria-label="Font size"]',
		);
		const increaseButton = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Increase font size"]',
		);
		expect(slider?.getAttribute("aria-valuenow")).toBe("17");
		expect(increaseButton).not.toBeNull();
		expect(increaseButton?.disabled).toBe(false);
		expect(container.textContent).toContain("17px");

		await act(async () => {
			increaseButton?.click();
		});

		expect(window.localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY)).toBe("18");
		expect(document.documentElement.style.fontSize).toBe("18px");
		const updatedSlider = container.querySelector<HTMLElement>(
			'[role="slider"][aria-label="Font size"]',
		);
		expect(updatedSlider).toBe(slider);
		expect(updatedSlider?.getAttribute("aria-valuenow")).toBe("18");

		await act(async () => {
			updatedSlider?.focus();
			updatedSlider?.dispatchEvent(
				new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
			);
		});

		expect(window.localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY)).toBe("19");
		expect(document.documentElement.style.fontSize).toBe("19px");
		expect(updatedSlider?.getAttribute("aria-valuenow")).toBe("19");

		await act(async () => {
			applyAppZoomAction("zoom-in");
		});

		expect(window.localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY)).toBe("20");
		expect(container.textContent).toContain("20px");
		expect(updatedSlider?.getAttribute("aria-valuenow")).toBe("20");
		expect(increaseButton?.disabled).toBe(true);
	});
});

describe("SettingsView compaction settings", () => {
	it("loads the persisted compaction mode and writes changes", async () => {
		invoke.mockImplementation(async (command: string) => {
			if (command === "get_feature_flags") return { cloudAgents: false, cloudAgentsAvailable: false };
			if (command === "get_desktop_settings") return { cloudSessionsEnabled: false };
			if (command === "get_global_settings") {
				return { telemetryOptOut: false, autoUpdateEnabled: true, compactionEnabled: true, compactionStrategy: "basic", toolAutoApprove: true };
			}
			if (command === "set_compaction_mode") {
				return { telemetryOptOut: false, autoUpdateEnabled: true, compactionEnabled: false, compactionStrategy: "basic", toolAutoApprove: true };
			}
			return { telemetryOptOut: false, autoUpdateEnabled: true };
		});

		await act(async () => {
			root.render(<SettingsView onExportDiagnostics={vi.fn()} onNavigateSection={vi.fn()} section="General" />);
		});

		await vi.waitFor(() => {
			const select = container.querySelector('[aria-label="Context compaction mode"]') as HTMLSelectElement | null;
			expect(select?.value).toBe("basic");
		});

		await act(async () => {
			const select = container.querySelector('[aria-label="Context compaction mode"]') as HTMLSelectElement;
			select.value = "off";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		await vi.waitFor(() => {
			expect(invoke).toHaveBeenCalledWith("set_compaction_mode", { mode: "off" });
		});
	});
});

describe("SettingsView local agent defaults", () => {
	it("loads and renders persisted local autonomy controls", async () => {
		invoke.mockImplementation(async (command: string) => {
			if (command === "get_feature_flags") {
				return { cloudAgents: false, cloudAgentsAvailable: false };
			}
			if (command === "get_desktop_settings") {
				return { cloudSessionsEnabled: false };
			}
			if (command === "get_global_settings") {
				return {
					telemetryOptOut: false,
					autoUpdateEnabled: true,
					toolAutoApprove: false,
					localAgent: {
						maxIterations: 12,
						maxParallelToolCalls: 2,
						maxTokensPerTurn: 4096,
						maxConsecutiveMistakes: 4,
						loopDetection: { softThreshold: 3, hardThreshold: 5 },
						autonomyRule: "Inspect, act, verify.",
					},
				};
			}
			return { telemetryOptOut: false, autoUpdateEnabled: true };
		});

		await act(async () => {
			root.render(
				<SettingsView
					onExportDiagnostics={vi.fn()}
					onNavigateSection={vi.fn()}
					section="General"
				/>,
			);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Local agent defaults");
			expect(container.textContent).toContain("Inspect, act, verify.");
			expect(container.querySelector('[aria-label="Auto-approve tools globally"]')).not.toBeNull();
		});
	});
});

describe("SettingsView cloud sessions rollout", () => {
	it.each([
		{
			caseName: "the rollout explicitly enables it",
			featureFlags: { cloudAgents: false, cloudAgentsAvailable: true },
			visible: true,
		},
		{
			caseName: "feature flags are unavailable",
			featureFlags: new Error("feature flags unavailable"),
			visible: false,
		},
	])("shows the preview setting only when $caseName", async ({
		featureFlags,
		visible,
	}) => {
		invoke.mockImplementation(async (command: string) => {
			if (command === "get_feature_flags") {
				if (featureFlags instanceof Error) throw featureFlags;
				return featureFlags;
			}
			if (command === "get_desktop_settings") {
				return { cloudSessionsEnabled: false };
			}
			return {
				telemetryOptOut: false,
				autoUpdateEnabled: true,
			};
		});

		await act(async () => {
			root.render(
				<SettingsView
					onExportDiagnostics={vi.fn()}
					onNavigateSection={vi.fn()}
					section="General"
				/>,
			);
		});
		await vi.waitFor(() =>
			expect(
				container.querySelector(
					'[role="switch"][aria-label="Cloud sessions"]',
				) !== null,
			).toBe(visible),
		);
	});
});
