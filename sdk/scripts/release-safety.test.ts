import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assertNamedReleaseBranch } from "./release-safety.ts";

describe("SDK release branch safety", () => {
	test("uses the selected fork branch without rewriting it to main", () => {
		expect(assertNamedReleaseBranch("my-local-changes")).toBe("my-local-changes");
	});

	test("rejects detached HEAD releases", () => {
		expect(() => assertNamedReleaseBranch("HEAD")).toThrow(
			"SDK releases require a named branch",
		);
	});

	test("rejects an unknown branch name", () => {
		expect(() => assertNamedReleaseBranch("")).toThrow(
			"SDK releases require a named branch",
		);
	});
});

const releaseScript = readFileSync(new URL("./release.ts", import.meta.url), "utf8");

test("SDK release never checks out, pulls, or fetches another branch", () => {
	expect(releaseScript).toContain("await ensureReleaseBranch();");
	expect(releaseScript).not.toMatch(/run\(\s*\[\s*"git"\s*,\s*"(?:checkout|pull|fetch)"\s*,/);
});
