import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
} from "node:fs";
import path from "node:path";
import { $ } from "bun";

type DesktopPlatform = "mac" | "windows" | "linux";

const BOOLEAN_FLAGS = new Set(["--allow-unsigned-mac", "--skip-build"]);
const VALUE_FLAGS = new Set(["--platform", "--target"]);
const VALID_FLAGS = [...BOOLEAN_FLAGS, ...VALUE_FLAGS];

const APP_NAME = "Cline ApexForge";
const APP_ROOT = path.resolve(import.meta.dir, "..");
const BUNDLE_ROOT = path.join(
	APP_ROOT,
	"src-tauri",
	"target",
	"release",
	"bundle",
);
const PACKAGE_ROOT = path.join(APP_ROOT, "dist", "desktop");

process.chdir(APP_ROOT);

const validateArgs = (): void => {
	const args = process.argv.slice(2);

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (BOOLEAN_FLAGS.has(arg)) {
			continue;
		}

		if (VALUE_FLAGS.has(arg)) {
			const value = args[index + 1];
			if (!value || value.startsWith("--")) {
				throw new Error(`missing value for ${arg}`);
			}
			index += 1;
			continue;
		}

		if (VALID_FLAGS.some((flag) => arg.startsWith(`${flag}=`))) {
			continue;
		}

		if (arg.startsWith("--")) {
			const suggestion = VALID_FLAGS.find((flag) => flag.startsWith(arg));
			throw new Error(
				suggestion
					? `unknown option ${arg}. Did you mean ${suggestion}?`
					: `unknown option ${arg}`,
			);
		}

		throw new Error(`unexpected argument ${arg}`);
	}
};

const getArgValue = (name: string): string | undefined => {
	const prefix = `${name}=`;
	const inline = process.argv.find((arg) => arg.startsWith(prefix));
	if (inline) {
		return inline.slice(prefix.length);
	}

	const index = process.argv.indexOf(name);
	if (index >= 0) {
		return process.argv[index + 1];
	}

	return undefined;
};

const hasArg = (name: string): boolean => process.argv.includes(name);

const hostPlatform = (): DesktopPlatform => {
	if (process.platform === "darwin") {
		return "mac";
	}
	if (process.platform === "win32") {
		return "windows";
	}
	if (process.platform === "linux") {
		return "linux";
	}
	throw new Error(`unsupported desktop packaging host: ${process.platform}`);
};

const resolveRequestedPlatform = (): DesktopPlatform => {
	const platform =
		getArgValue("--platform") ?? getArgValue("--target") ?? "current";
	if (platform === "current") {
		return hostPlatform();
	}
	if (platform === "mac" || platform === "windows" || platform === "linux") {
		return platform;
	}
	throw new Error(
		`unsupported platform "${platform}". Use mac, windows, linux, or current.`,
	);
};

const sanitizeName = (value: string): string =>
	value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "");

const packageVersion = async (): Promise<string> => {
	const packageJson = await Bun.file(
		path.join(APP_ROOT, "package.json"),
	).json();
	return String(packageJson.version ?? "0.0.0");
};

const assertPackageMetadataConsistency = async (): Promise<void> => {
	const packageJson = await Bun.file(
		path.join(APP_ROOT, "package.json"),
	).json();
	const tauriConfig = await Bun.file(
		path.join(APP_ROOT, "src-tauri", "tauri.conf.json"),
	).json();
	const packageVersion = String(packageJson.version ?? "0.0.0");
	const tauriVersion = String(tauriConfig.version ?? "");
	const tauriProductName = String(tauriConfig.productName ?? "");
	const mismatches: string[] = [];
	if (packageVersion !== tauriVersion) {
		mismatches.push(
			`package.json version is ${packageVersion}, but tauri.conf.json version is ${tauriVersion || "(missing)"}`,
		);
	}
	if (APP_NAME !== tauriProductName) {
		mismatches.push(
			`package-desktop.ts app name is ${APP_NAME}, but tauri.conf.json productName is ${tauriProductName || "(missing)"}`,
		);
	}
	if (mismatches.length > 0) {
		throw new Error(
			[
				"Desktop packaging metadata is inconsistent:",
				...mismatches.map((mismatch) => `- ${mismatch}`),
				"Align these values so bundle names and version metadata stay consistent.",
			].join("\n"),
		);
	}
};

const macDistributionCredentialsConfigured = (): boolean => {
	const hasCertificate = Boolean(
		process.env.APPLE_CERTIFICATE || process.env.APPLE_SIGNING_IDENTITY,
	);
	const hasAppleIdNotarization = Boolean(
		process.env.APPLE_ID &&
			process.env.APPLE_PASSWORD &&
			process.env.APPLE_TEAM_ID,
	);
	const hasApiKeyNotarization = Boolean(
		(process.env.APPLE_API_KEY || process.env.APPLE_API_KEY_PATH) &&
			process.env.APPLE_API_KEY_ID &&
			process.env.APPLE_API_ISSUER,
	);
	return hasCertificate && (hasAppleIdNotarization || hasApiKeyNotarization);
};

const assertCanBuildPlatform = (platform: DesktopPlatform): void => {
	const host = hostPlatform();
	if (platform !== host) {
		throw new Error(
			[
				`cannot build ${platform} desktop bundles from ${host}.`,
				"Tauri desktop bundles are produced on the target OS because the native bundle tools and sidecar binary are platform-specific.",
				"Run this same package script on macOS, Windows, and Linux runners to produce all three artifact sets.",
			].join("\n"),
		);
	}
};

const assertMacDistributionReady = (allowUnsignedMac: boolean): void => {
	if (hostPlatform() !== "mac") {
		return;
	}
	if (macDistributionCredentialsConfigured() || allowUnsignedMac) {
		return;
	}

	throw new Error(
		[
			"refusing to create a shareable macOS package without Developer ID signing and notarization credentials.",
			"Unsigned quarantined macOS downloads can show as damaged on a teammate's Mac.",
			"Set APPLE_CERTIFICATE or APPLE_SIGNING_IDENTITY plus notarization credentials before running this script.",
			"Supported notarization env sets: APPLE_ID + APPLE_PASSWORD + APPLE_TEAM_ID, or APPLE_API_KEY/APPLE_API_KEY_PATH + APPLE_API_KEY_ID + APPLE_API_ISSUER.",
			"For local-only testing, rerun with --allow-unsigned-mac or ALLOW_UNSIGNED_MAC=1.",
		].join("\n"),
	);
};

const walkFiles = (root: string): string[] => {
	if (!existsSync(root)) {
		return [];
	}

	const paths: string[] = [];
	for (const entry of readdirSync(root)) {
		const fullPath = path.join(root, entry);
		const stats = statSync(fullPath);
		if (stats.isDirectory()) {
			paths.push(...walkFiles(fullPath));
			continue;
		}
		paths.push(fullPath);
	}
	return paths;
};

const copyArtifact = (source: string, outputName: string): string => {
	const destination = path.join(PACKAGE_ROOT, outputName);
	rmSync(destination, { force: true, recursive: true });
	cpSync(source, destination, { recursive: true });
	return destination;
};

const signUnsignedMacApp = async (appPath: string): Promise<void> => {
	await $`codesign --force --deep --sign - ${appPath}`;
	await $`codesign --verify --deep --strict --verbose=2 ${appPath}`;
	await $`xattr -cr ${appPath}`;
};

const verifySignedMacApp = async (appPath: string): Promise<void> => {
	await $`codesign --verify --deep --strict --verbose=2 ${appPath}`;
	await $`spctl --assess --type execute --verbose ${appPath}`;
	await $`xattr -cr ${appPath}`;
};

const collectMacArtifacts = async (
	version: string,
	allowUnsignedMac: boolean,
): Promise<string[]> => {
	const appPath = path.join(BUNDLE_ROOT, "macos", `${APP_NAME}.app`);
	if (!existsSync(appPath)) {
		throw new Error(`macOS app bundle was not created at ${appPath}`);
	}

	if (allowUnsignedMac && !macDistributionCredentialsConfigured()) {
		console.warn(
			"creating a local-only ad-hoc signed macOS package; this is not suitable for quarantined downloads.",
		);
		await signUnsignedMacApp(appPath);
	} else {
		await verifySignedMacApp(appPath);
	}

	const arch = process.arch === "arm64" ? "arm64" : "x64";
	const suffix =
		allowUnsignedMac && !macDistributionCredentialsConfigured()
			? "-local-unsigned"
			: "";
	const zipName = `${sanitizeName(APP_NAME)}-${version}-macos-${arch}${suffix}.zip`;
	const zipPath = path.join(PACKAGE_ROOT, zipName);
	rmSync(zipPath, { force: true });
	await $`ditto -c -k --keepParent ${appPath} ${zipPath}`;

	const artifacts = [zipPath];
	if (!suffix) {
		const appNameParts = sanitizeName(APP_NAME)
			.toLowerCase()
			.split("-")
			.filter(Boolean);
		for (const dmgPath of walkFiles(path.join(BUNDLE_ROOT, "dmg")).filter(
			(file) =>
				file.endsWith(".dmg") &&
				path.basename(file).includes(version) &&
				appNameParts.every((part) => path.basename(file).toLowerCase().includes(part)),
		)) {
			artifacts.push(copyArtifact(dmgPath, path.basename(dmgPath)));
		}
	}

	return artifacts;
};

const collectWindowsArtifacts = (version: string): string[] => {
	const expectedPrefix = `${APP_NAME.replace(/[^a-zA-Z0-9._-]+/g, "_")}_${version}_`;
	return walkFiles(BUNDLE_ROOT)
		.filter((file) => {
			const filename = path.basename(file);
			return (
				(filename.endsWith(".msi") || filename.endsWith(".exe")) &&
				filename.startsWith(expectedPrefix)
			);
		})
		.map((file) => copyArtifact(file, path.basename(file)));
};

const collectLinuxArtifacts = (version: string): string[] => {
	const packageName = APP_NAME.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return walkFiles(BUNDLE_ROOT)
		.filter((file) => {
			const filename = path.basename(file);
			return (
				(filename.startsWith(`${packageName}_${version}_`) &&
					filename.endsWith(".deb")) ||
				(filename.startsWith(`${packageName}-${version}-`) &&
					filename.endsWith(".rpm"))
			);
		})
		.map((file) => copyArtifact(file, path.basename(file)));
};

const cleanBundleOutputs = (platform: DesktopPlatform): void => {
	const directories: Record<DesktopPlatform, string[]> = {
		mac: ["macos", "dmg"],
		windows: ["msi", "nsis"],
		linux: ["deb", "rpm"],
	};
	for (const directory of directories[platform]) {
		rmSync(path.join(BUNDLE_ROOT, directory), {
			force: true,
			recursive: true,
		});
	}
};

const collectArtifacts = async (
	platform: DesktopPlatform,
	allowUnsignedMac: boolean,
): Promise<string[]> => {
	const version = await packageVersion();
	rmSync(PACKAGE_ROOT, { force: true, recursive: true });
	mkdirSync(PACKAGE_ROOT, { recursive: true });

	if (platform === "mac") {
		return collectMacArtifacts(version, allowUnsignedMac);
	}
	if (platform === "windows") {
		return collectWindowsArtifacts(version);
	}
	return collectLinuxArtifacts(version);
};

const main = async () => {
	validateArgs();

	const platform = resolveRequestedPlatform();
	const allowUnsignedMac =
		hasArg("--allow-unsigned-mac") || process.env.ALLOW_UNSIGNED_MAC === "1";
	const skipBuild = hasArg("--skip-build");

	assertCanBuildPlatform(platform);
	await assertPackageMetadataConsistency();
	if (platform === "mac") {
		assertMacDistributionReady(allowUnsignedMac);
	}

	if (!skipBuild) {
		// Remove artifacts from previous builds, which can otherwise mix the old
		// upstream product name with this fork's installers in dist/desktop.
		cleanBundleOutputs(platform);

		// Packaging is a release-style build: require compressed remote helpers
		// unless the developer has explicitly accepted the larger local output.
		process.env.CLINE_REQUIRE_UPX = "1";

		// Linux ships deb and rpm only. The AppImage target is skipped because
		// linuxdeploy cannot process the Bun-compiled sidecar (ldd fails on it
		// and patchelf corrupts it), which aborts the whole bundle step.
		if (platform === "linux") {
			await $`bun run build:binary --bundles deb,rpm`;
		} else {
			await $`bun run build:binary`;
		}
	}

	const artifacts = await collectArtifacts(platform, allowUnsignedMac);
	if (artifacts.length === 0) {
		throw new Error(
			`no ${platform} desktop artifacts were found under ${BUNDLE_ROOT}`,
		);
	}

	console.log(`Packaged ${platform} desktop artifacts:`);
	let totalBytes = 0;
	for (const artifact of artifacts) {
		const sizeBytes = statSync(artifact).size;
		totalBytes += sizeBytes;
		console.log(
			`- ${path.relative(APP_ROOT, artifact)} (${(sizeBytes / 1024 / 1024).toFixed(1)} MiB)`,
		);
	}
	console.log(`Total artifact size: ${(totalBytes / 1024 / 1024).toFixed(1)} MiB`);
};

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
