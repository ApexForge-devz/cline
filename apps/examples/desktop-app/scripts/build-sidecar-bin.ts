import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";
import { prepareWindowsCrossCompileRuntime } from "./bun-cross-compile-runtime";
import { telemetryDefineArgs } from "./telemetry-define-args";

const resolveTargetTriple = async (): Promise<string> => {
	const fromEnv = process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.TARGET;
	if (fromEnv?.trim()) {
		return fromEnv.trim();
	}

	const rustcVersion = await $`rustc -vV`.text();
	const hostLine = rustcVersion
		.split("\n")
		.find((line) => line.startsWith("host: "));
	const host = hostLine?.slice("host: ".length).trim();
	if (!host) {
		throw new Error("failed to resolve Rust host target triple");
	}
	return host;
};

// Bun cross-compiles --compile binaries, so a CI runner can produce the
// sidecar for a different architecture than its own (e.g. the x86_64 macOS
// bundle from an arm64 runner). Without an explicit --target, bun always
// emits a host-arch binary even when Tauri is building for another triple.
const resolveBunCompileTarget = (targetTriple: string): string | undefined => {
	if (targetTriple.startsWith("aarch64-apple-darwin"))
		return "bun-darwin-arm64";
	if (targetTriple.startsWith("x86_64-apple-darwin")) return "bun-darwin-x64";
	if (targetTriple.startsWith("x86_64-pc-windows")) return "bun-windows-x64";
	// SSH hosts may predate AVX2 (e.g. Ivy Bridge Xeons). The default Bun
	// x64 runtime can SIGILL before our entrypoint runs on those CPUs.
	if (targetTriple.startsWith("x86_64-unknown-linux"))
		return "bun-linux-x64-baseline";
	if (targetTriple.startsWith("aarch64-unknown-linux"))
		return "bun-linux-arm64";
	return undefined;
};

const sidecarOutfile = (targetTriple: string): string => {
	const extension = targetTriple.includes("windows") ? ".exe" : "";
	return `./src-tauri/bin/code-sidecar-${targetTriple}${extension}`;
};

const APP_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const WORKSPACE_ROOT = path.resolve(APP_ROOT, "../../..");
const REMOTE_HELPER_FINGERPRINT_PATH = path.join(
	APP_ROOT,
	"src-tauri",
	"bin",
	".remote-helpers-fingerprint",
);
const REMOTE_HELPER_OUTPUTS = [
	path.join(
		APP_ROOT,
		"src-tauri",
		"bin",
		"remote-helpers",
		"cline-remote-helper-x86_64-unknown-linux-gnu",
	),
	path.join(
		APP_ROOT,
		"src-tauri",
		"bin",
		"remote-helpers",
		"cline-remote-helper-aarch64-unknown-linux-gnu",
	),
];

const hashDirectory = async (
	hash: ReturnType<typeof createHash>,
	directory: string,
): Promise<void> => {
	const entries = await readdir(directory, { withFileTypes: true });
	entries.sort((left, right) => left.name.localeCompare(right.name));
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await hashDirectory(hash, entryPath);
			continue;
		}
		if (!entry.isFile()) continue;
		hash.update(path.relative(WORKSPACE_ROOT, entryPath).replaceAll("\\", "/"));
		hash.update(await readFile(entryPath));
	}
};

const computeRemoteHelperFingerprint = async (): Promise<string> => {
	const hash = createHash("sha256");
	hash.update(JSON.stringify(["bun-version", Bun.version]));
	hash.update("\n");
	const upxVersion = Bun.which("upx")
		? (await $`upx --version`.text()).trim()
		: "missing";
	hash.update(JSON.stringify(["upx-version", upxVersion]));
	hash.update("\n");
	hash.update(
		JSON.stringify([
			"compression-policy",
			Boolean(process.env.CI) || process.env.CLINE_REQUIRE_UPX === "1",
			process.env.CLINE_ALLOW_UNCOMPRESSED_REMOTE_HELPERS === "1" && !process.env.CI,
		]),
	);
	hash.update("\n");
	const keyFiles = [
		path.join(WORKSPACE_ROOT, "bun.lock"),
		fileURLToPath(import.meta.url),
		path.join(APP_ROOT, "scripts", "telemetry-define-args.ts"),
	];
	for (const filePath of keyFiles) {
		hash.update(path.relative(WORKSPACE_ROOT, filePath).replaceAll("\\", "/"));
		hash.update(await readFile(filePath));
	}

	// Values passed through Bun --define affect the helper executable even when
	// source and SDK outputs are unchanged. Hash them without logging secrets.
	for (const name of [
		"TELEMETRY_SERVICE_API_KEY",
		"ERROR_SERVICE_API_KEY",
		"CLINE_CODE_CLOUD_AGENTS",
		"OTEL_TELEMETRY_ENABLED",
		"OTEL_METRICS_EXPORTER",
		"OTEL_LOGS_EXPORTER",
		"OTEL_TRACES_EXPORTER",
		"OTEL_EXPORTER_OTLP_PROTOCOL",
		"OTEL_EXPORTER_OTLP_ENDPOINT",
		"OTEL_EXPORTER_OTLP_HEADERS",
		"OTEL_METRIC_EXPORT_INTERVAL",
	]) {
		hash.update(JSON.stringify([name, process.env[name] ?? ""]));
		hash.update("\n");
	}

	const packagesDirectory = path.join(WORKSPACE_ROOT, "sdk", "packages");
	const packages = await readdir(packagesDirectory, { withFileTypes: true });
	packages.sort((left, right) => left.name.localeCompare(right.name));
	for (const packageEntry of packages) {
		if (!packageEntry.isDirectory()) continue;
		const distDirectory = path.join(
			packagesDirectory,
			packageEntry.name,
			"dist",
		);
		try {
			if ((await stat(distDirectory)).isDirectory()) {
				await hashDirectory(hash, distDirectory);
			}
		} catch {
			// Some workspace packages do not emit a dist directory.
		}
	}
	return hash.digest("hex");
};

const remoteHelpersAreCurrent = async (fingerprint: string): Promise<boolean> => {
	try {
		const savedFingerprint = (await readFile(
			REMOTE_HELPER_FINGERPRINT_PATH,
			"utf8",
		)).trim();
		if (savedFingerprint !== fingerprint) return false;
		for (const output of REMOTE_HELPER_OUTPUTS) {
			const outputStat = await stat(output);
			if (!outputStat.isFile() || outputStat.size < 1_000_000) return false;
		}
		return true;
	} catch {
		return false;
	}
};

const buildSidecar = async (
	targetTriple: string,
	outfile = sidecarOutfile(targetTriple),
	entrypoint = "./sidecar/index.ts",
	minify = false,
): Promise<string> => {
	const bunTarget = resolveBunCompileTarget(targetTriple);
	// Telemetry config must be inlined into the compiled binary: a packaged
	// app launched from Finder/the Dock has no OTEL_* env at runtime, so
	// without this the sidecar silently ships with telemetry disabled.
	// Verify with `<binary> --telemetry-selfcheck` after building.
	const defines = telemetryDefineArgs();
	const optimizationArgs = minify ? ["--minify"] : [];
	// A compiled Bun executable otherwise reads .env and bunfig.toml from its
	// launch directory before our entrypoint runs. Remote helpers are launched
	// from an SSH user's home directory, so that behavior can both make the
	// helper fail on an unrelated dotenv file and leak workspace credentials
	// into the Hub process. Packaged binaries must depend only on their explicit
	// process environment and compiled configuration.
	const runtimeIsolationArgs = [
		"--no-compile-autoload-dotenv",
		"--no-compile-autoload-bunfig",
		// Bun only trusts its bundled Mozilla roots on macOS/Windows, so TLS to
		// intranet endpoints signed by a corporate CA (LiteLLM proxies, MITM
		// firewalls) fails with "unable to get local issuer certificate". Bake
		// --use-system-ca into the runtime so the sidecar and the Hub daemon it
		// re-executes from this binary also trust the OS Keychain/cert store,
		// matching the CLI wrapper's OS trust-anchor harvesting.
		"--compile-exec-argv=--use-system-ca",
	];
	if (bunTarget) {
		await prepareWindowsCrossCompileRuntime(bunTarget);
		await $`bun build ${entrypoint} --compile --target=${bunTarget} ${runtimeIsolationArgs} ${optimizationArgs} ${defines} --outfile ${outfile}`;
	} else {
		await $`bun build ${entrypoint} --compile ${runtimeIsolationArgs} ${optimizationArgs} ${defines} --outfile ${outfile}`;
	}
	return outfile;
};

// Each compiled helper embeds a full Bun runtime (~100 MB) around ~14 MB of
// our code, and both helpers ship inside every desktop bundle. UPX packs the
// ELF in place to about a quarter of its size and it self-extracts in memory on
// launch (measured: ~1.6 s extra startup, ~55 MB extra RSS on the Hub daemon),
// so nothing downstream changes: the installer, the SSH upload, and the remote
// run all see one ordinary executable. `strip` is not an option here; it
// discards Bun's appended module payload. Requires upx on PATH; the publish
// workflow installs it on every runner.
const compressRemoteHelper = async (outfile: string): Promise<void> => {
	if (!Bun.which("upx")) {
		const requiresCompression =
			Boolean(process.env.CI) || process.env.CLINE_REQUIRE_UPX === "1";
		const explicitlyAllowUncompressed =
			process.env.CLINE_ALLOW_UNCOMPRESSED_REMOTE_HELPERS === "1" &&
			!process.env.CI;
		if (requiresCompression && !explicitlyAllowUncompressed) {
			throw new Error(
				[
					`upx is required to create a size-optimized package, but was not found on PATH (${outfile}).`,
					"Install UPX before packaging, or explicitly allow a larger local package with CLINE_ALLOW_UNCOMPRESSED_REMOTE_HELPERS=1.",
				].join("\n"),
			);
		}
		console.warn(
			`upx not found on PATH; leaving ${outfile} uncompressed. This increases the package size substantially; set CLINE_ALLOW_UNCOMPRESSED_REMOTE_HELPERS=1 only when that tradeoff is intentional.`,
		);
		return;
	}
	await $`upx --best --lzma -q ${outfile}`;
};

// SSH environments run the same Hub build as the desktop in a dedicated
// bootstrap/daemon binary. It intentionally excludes the desktop HTTP server,
// command router, and UI backend. Linux x64 and arm64 cover common SSH hosts.
// macOS helpers are deliberately not bundled: they are Mach-O files under
// Contents/Resources, which Tauri does not codesign, and any unsigned Mach-O
// in the bundle fails notarization. Mac remotes are served from a macOS
// desktop by its own signed sidecar instead (sidecar/remote-helper.ts).
//
// On a Windows host, Bun 1.4.2 can fail while extracting the downloaded
// Linux runtime needed by these cross-compiles. The build-sidecar path prepares
// the validated official runtime in Bun's normal cache before invoking Bun.
const buildRemoteHelpers = async (): Promise<void> => {
	for (const targetTriple of [
		"x86_64-unknown-linux-gnu",
		"aarch64-unknown-linux-gnu",
	]) {
		const outfile = await buildSidecar(
			targetTriple,
			`./src-tauri/bin/remote-helpers/cline-remote-helper-${targetTriple}`,
			"../../../sdk/packages/core/dist/remote/remote-helper-entry.js",
			true,
		);
		await compressRemoteHelper(outfile);
	}
};

// Tauri's universal-apple-darwin pseudo-target lipos the Rust binary itself
// but expects sidecars (externalBin) to already be fat binaries named
// `<name>-universal-apple-darwin`, so build both slices and merge them here.
const buildUniversalMacSidecar = async (): Promise<void> => {
	const arm64 = await buildSidecar("aarch64-apple-darwin");
	const x64 = await buildSidecar("x86_64-apple-darwin");
	const outfile = sidecarOutfile("universal-apple-darwin");
	await $`lipo -create -output ${outfile} ${arm64} ${x64}`;
	await $`chmod +x ${outfile}`;
	await $`lipo -info ${outfile}`;
};

const main = async () => {
	// All compiled helpers and the sidecar depend on fresh SDK package exports.
	await $`bun run build:sdk`.cwd(
		fileURLToPath(new URL("../../../../", import.meta.url)),
	);
	const targetTriple = await resolveTargetTriple();
	await $`mkdir -p src-tauri/bin src-tauri/bin/remote-helpers`;
	if (targetTriple === "universal-apple-darwin") {
		await buildUniversalMacSidecar();
	} else {
		await buildSidecar(targetTriple);
	}
	const remoteHelperFingerprint = await computeRemoteHelperFingerprint();
	if (await remoteHelpersAreCurrent(remoteHelperFingerprint)) {
		console.log("Remote helper binaries are current; skipping their rebuild.");
	} else {
		await buildRemoteHelpers();
		await Bun.write(
			REMOTE_HELPER_FINGERPRINT_PATH,
			`${remoteHelperFingerprint}\n`,
		);
	}
};

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
