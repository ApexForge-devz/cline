import { describe, expect, test } from "bun:test";
import {
	isExpectedElfExecutable,
	resolveWindowsCrossCompileRuntime,
} from "./bun-cross-compile-runtime";

describe("resolveWindowsCrossCompileRuntime", () => {
	test("maps x64 Linux target", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-linux-x64", "1.4.2"),
		).toMatchObject({
			archiveName: "bun-linux-x64",
			cacheFilename: "bun-linux-x64-v1.4.2",
			downloadUrl:
				"https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-x64.zip",
			expectedMachine: 62,
			sha256: "36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913",
		});
	});

	test("maps x64 baseline Linux target", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-linux-x64-baseline", "1.4.2"),
		).toMatchObject({
			archiveName: "bun-linux-x64-baseline",
			cacheFilename: "bun-linux-x64-baseline-v1.4.2",
			downloadUrl:
				"https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-x64-baseline.zip",
			expectedMachine: 62,
			sha256: "c678040f14fe0440eb839d37cbd0ce4c051a32da72806ac97de6a6aab6bf728f",
		});
	});

	test("maps arm64 Linux target to aarch64 asset", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-linux-arm64", "1.4.2"),
		).toMatchObject({
			archiveName: "bun-linux-aarch64",
			cacheFilename: "bun-linux-aarch64-v1.4.2",
			downloadUrl:
				"https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/bun-linux-aarch64.zip",
			expectedMachine: 183,
			sha256: "54328bbc2d9c8e0c9f892c544d66c57a83b84139e34909e5ee81758f1ac8fda7",
		});
	});

	test("does not intercept native or unrelated targets", () => {
		expect(
			resolveWindowsCrossCompileRuntime("bun-windows-x64", "1.4.2"),
		).toBeUndefined();
		expect(
			resolveWindowsCrossCompileRuntime("bun-darwin-arm64", "1.4.2"),
		).toBeUndefined();
	});

	test("fails closed when Bun version differs from pinned runtime", () => {
		expect(() =>
			resolveWindowsCrossCompileRuntime("bun-linux-x64", "1.4.3"),
		).toThrow("requires Bun 1.4.2");
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
