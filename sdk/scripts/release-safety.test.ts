import { describe, expect, test } from "bun:test";
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
