import { describe, expect, test } from "bun:test";
import {
	isExpectedElfExecutable,
	resolveWindowsCrossCompileRuntime,
} from "./bun-cross-compile-runtime";

describe("resolveWindowsCrossCompileRuntime", () => {
	test("maps x64 Linux target", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-linux-x64", "1.3.13"),
		).toMatchObject({
			archiveName: "bun-linux-x64",
			cacheFilename: "bun-linux-x64-v1.3.13",
			expectedMachine: 62,
		});
	});

	test("maps x64 baseline Linux target", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-linux-x64-baseline", "1.3.13"),
		).toMatchObject({
			archiveName: "bun-linux-x64-baseline",
			cacheFilename: "bun-linux-x64-baseline-v1.3.13",
			expectedMachine: 62,
		});
	});

	test("maps arm64 Linux target to aarch64 asset", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-linux-arm64", "1.3.13"),
		).toMatchObject({
			archiveName: "bun-linux-aarch64",
			cacheFilename: "bun-linux-aarch64-v1.3.13",
			expectedMachine: 183,
		});
	});

	test("does not intercept native or unrelated targets", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-windows-x64", "1.3.13"),
		).toBeUndefined();
		expect(
			resolveWindowsCrossCompileRuntime("bun-darwin-arm64", "1.3.13"),
		).toBeUndefined();
	});

	test("fails closed when Bun version differs from pinned runtime", () => {
		expect(() =>
			resolveWindowsCrossCompileRuntime("bun-linux-x64", "1.3.14"),
		).toThrow("requires Bun 1.3.13");
	});
});

describe("isExpectedElfExecutable", () => {
	const elfHeader = (machine: number): Uint8Array => {
		const header = new Uint8Array(20);
		header.set([0x7f, 0x45, 0x4c, 0x46]);
		header[5] = 1;
		header[18] = machine & 0xff;
		header[19] = (machine >> 8) & 0xff;
		return header;
	};

	test("accepts expected architectures", () => {
		expect(isExpectedElfExecutable(elfHeader(62), 62)).toBe(true);
		expect(isExpectedElfExecutable(elfHeader(183), 183)).toBe(true);
	});

	test("rejects wrong architecture and malformed files", () => {
		expect(isExpectedElfExecutable(elfHeader(62), 183)).toBe(false);
		expect(isExpectedElfExecutable(new Uint8Array(20), 62)).toBe(false);
		expect(isExpectedElfExecutable(new Uint8Array(10), 62)).toBe(false);
	});
});
