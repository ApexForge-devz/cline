import { createHash } from "node:crypto";
import {
	copyFile,
	mkdir,
	mkdtemp,
	open,
	rename,
	rm,
	stat,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const SUPPORTED_BUN_VERSIONS = ["1.3.13", "1.4.2"] as const;

type RuntimeSpec = {
	archiveName: string;
	cacheName: string;
	expectedMachine: number;
	sha256ByVersion: Record<(typeof SUPPORTED_BUN_VERSIONS)[number], string>;
};

const WINDOWS_LINUX_RUNTIME_SPECS: Record<string, RuntimeSpec> = {
	"bun-linux-x64": {
		archiveName: "bun-linux-x64",
		cacheName: "bun-linux-x64",
		expectedMachine: 62,
		sha256ByVersion: {
			"1.3.13": "79c0771fa8b92c33aae41e15a0e0d307ea99d0e2f00317c71c6c53237a78e25a",
			"1.4.2": "36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913",
		},
	},
	"bun-linux-x64-baseline": {
		archiveName: "bun-linux-x64-baseline",
		cacheName: "bun-linux-x64-baseline",
		expectedMachine: 62,
		sha256ByVersion: {
			"1.3.13": "9d8a24292a7068090205daac0a5a223f5f69736f5287e37bf88d3b4031edc750",
			"1.4.2": "c678040f14fe0440eb839d37cbd0ce4c051a32da72806ac97de6a6aab6bf728f",
		},
	},
	"bun-linux-arm64": {
		archiveName: "bun-linux-aarch64",
		cacheName: "bun-linux-aarch64",
		expectedMachine: 183,
		sha256ByVersion: {
			"1.3.13": "70bae41b3908b0a120e1e58c5c8af30e74afae3b8d11b0d3fdd8e787ddfb4b22",
			"1.4.2": "54328bbc2d9c8e0c9f892c544d66c57a83b84139e34909e5ee81758f1ac8fda7",
		},
	},
};

export type WindowsCrossCompileRuntime = {
	archiveName: string;
	cacheName: string;
	expectedMachine: number;
	sha256: string;
	cacheFilename: string;
	downloadUrl: string;
};

export const resolveWindowsCrossCompileRuntime = (
	bunTarget: string,
	bunVersion: string,
): WindowsCrossCompileRuntime | undefined => {
	const spec = WINDOWS_LINUX_RUNTIME_SPECS[bunTarget];
	if (!spec) return undefined;
	const sha256 = spec.sha256ByVersion[bunVersion as keyof typeof spec.sha256ByVersion];
	if (!sha256) {
		throw new Error(
			`Windows Linux cross-compilation supports Bun ${SUPPORTED_BUN_VERSIONS.join(", ")}; received ${bunVersion}` ,
		);
	}
	return {
		archiveName: spec.archiveName,
		cacheName: spec.cacheName,
		expectedMachine: spec.expectedMachine,
		sha256,
		cacheFilename: `${spec.cacheName}-v${bunVersion}`,
		downloadUrl: `https://github.com/oven-sh/bun/releases/download/bun-v${bunVersion}/${spec.archiveName}.zip`,
	};
};

export const isExpectedElfExecutable = (
	header: Uint8Array,
	expectedMachine: number,
): boolean =>
	header.length >= 20 &&
	header[0] === 0x7f &&
	header[1] === 0x45 &&
	header[2] === 0x4c &&
	header[3] === 0x46 &&
	header[5] === 1 &&
	header[18] === (expectedMachine & 0xff) &&
	header[19] === ((expectedMachine >> 8) & 0xff);

const hasExpectedRuntime = async (
	filePath: string,
	expectedMachine: number,
): Promise<boolean> => {
	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile() || fileStat.size < 1_000_000) return false;
		const file = await open(filePath, "r");
		try {
			const header = new Uint8Array(20);
			const { bytesRead } = await file.read(header, 0, header.length, 0);
			return (
				bytesRead === header.length &&
				isExpectedElfExecutable(header, expectedMachine)
			);
		} finally {
			await file.close();
		}
	} catch {
		return false;
	}
};

const powershellLiteral = (value: string): string =>
	`'${value.replaceAll("'", "''")}'`;

/**
 * Supported Bun versions can fail to extract Linux cross-compile runtimes on Windows.
 * Download and validate the matching official runtime into Bun's normal cache so
 * `bun build --compile` can reuse it without entering the broken extractor path.
 */
export const prepareWindowsCrossCompileRuntime = async (
	bunTarget: string,
): Promise<void> => {
	if (process.platform !== "win32") return;
	const spec = resolveWindowsCrossCompileRuntime(bunTarget, Bun.version);
	if (!spec) return;

	const bunInstall =
		process.env.BUN_INSTALL?.trim() || path.join(homedir(), ".bun");
	const cacheDir = path.join(bunInstall, "install", "cache");
	const cachePath = path.join(cacheDir, spec.cacheFilename);
	if (await hasExpectedRuntime(cachePath, spec.expectedMachine)) return;

	const stagingDir = await mkdtemp(
		path.join(tmpdir(), `cline-${spec.archiveName}-`),
	);
	try {
		const archivePath = path.join(stagingDir, `${spec.archiveName}.zip`);
		const extractDir = path.join(stagingDir, "extracted");
		const response = await fetch(spec.downloadUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to download ${spec.archiveName}: HTTP ${response.status}`,
			);
		}
		const archive = new Uint8Array(await response.arrayBuffer());
		const actualSha256 = createHash("sha256").update(archive).digest("hex");
		if (actualSha256 !== spec.sha256) {
			throw new Error(
				`${spec.archiveName} checksum mismatch: expected ${spec.sha256}, received ${actualSha256}`,
			);
		}
		await Bun.write(archivePath, archive);
		await mkdir(extractDir, { recursive: true });

		const expandCommand = `Expand-Archive -LiteralPath ${powershellLiteral(archivePath)} -DestinationPath ${powershellLiteral(extractDir)} -Force`;
		const expand = Bun.spawn(
			[
				"powershell.exe",
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				expandCommand,
			],
			{ stdout: "inherit", stderr: "inherit" },
		);
		const expandExitCode = await expand.exited;
		if (expandExitCode !== 0) {
			throw new Error(
				`Failed to extract ${spec.archiveName} (exit ${expandExitCode})`,
			);
		}

		const extractedRuntime = path.join(extractDir, spec.archiveName, "bun");
		if (!(await hasExpectedRuntime(extractedRuntime, spec.expectedMachine))) {
			throw new Error(
				`${spec.archiveName} did not contain the expected Linux executable`,
			);
		}

		await mkdir(cacheDir, { recursive: true });
		const stagedCachePath = path.join(
			cacheDir,
			`${spec.cacheFilename}.${process.pid}.tmp`,
		);
		await copyFile(extractedRuntime, stagedCachePath);
		await rm(cachePath, { force: true, recursive: true });
		await rename(stagedCachePath, cachePath);
		console.log(`Prepared Bun cross-compile runtime: ${spec.cacheFilename}`);
	} finally {
		await rm(stagingDir, { force: true, recursive: true });
	}
};

const main = async (): Promise<void> => {
	const targets = process.argv.slice(2);
	if (targets.length === 0) {
		throw new Error("Pass at least one Bun compile target to prepare");
	}
	for (const target of targets) {
		await prepareWindowsCrossCompileRuntime(target);
	}
};

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	});
}
