import { describe, expect, it } from "vitest";
import { toSettingsPatch } from "./settings-patch";

describe("toSettingsPatch", () => {
	it("preserves null leaves so nested optional values can be cleared", () => {
		expect(
			toSettingsPatch({
				"ollamaGeneration.temperature": null,
				"ollamaGeneration.stop": null,
			}),
		).toEqual({
			ollamaGeneration: { temperature: null, stop: null },
		});
	});
});
