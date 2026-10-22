import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SessionHud, SessionHudButton } from "./session-hud";

describe("Session HUD primitives", () => {
	it("renders compact semantic controls without imposing fixed width", () => {
		render(
			<SessionHud aria-label="Session HUD">
				<SessionHudButton aria-label="Quick prompts" compact>
					Quick Prompts
				</SessionHudButton>
			</SessionHud>,
		);

		const button = screen.getByRole("button", { name: "Quick prompts" });
		expect(button).toHaveClass("h-7", "min-w-0", "px-1.5");
		expect(screen.queryByRole("group", { name: "Session HUD" })).toBeNull();
		expect(screen.getByLabelText("Session HUD")).toBeTruthy();
	});
});
