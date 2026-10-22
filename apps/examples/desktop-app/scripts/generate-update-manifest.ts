// Generates the Tauri updater manifest (latest.json) from updater artifacts
// produced by a desktop release build. Configure --repo or GITHUB_REPOSITORY
// when generating manifests for a release hosted by your own repository.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type UpdaterPlatformEntry = {
	signature: string;
	url: string;
};

export type UpdateManifest = {
	version: string;
	notes: string;
	pub_date: string;
	platforms: Record<string, UpdaterPlatformEntry>;
};

const MACOS_PLATFORM_KEYS_BY_ARCH_SUFFIX: Record<string, string[]> = {
	aarch64: ["darwin-aarch64"],
	x86_64: ["darwin-x86_64"],
	universal: ["darwin-aarch64", "darwin-x86_64"],
};

const WINDOWS_PLATFORM_KEYS_BY_ARCH_SUFFIX: Record<string, string[]> = {
	x64: ["windows-x86_64"],
	arm64: ["windows-aarch64"],
};

const LINUX_PLATFORM_KEYS_BY_FILE_SUFFIX: Record<string, string[]> = {
	"_amd64.deb": ["linux-x86_64-deb"],
	"_arm64.deb": ["linux-aarch64-deb"],
	"_x86_64.rpm": ["linux-x86_64-rpm"],
	"_aarch64.rpm": ["linux-aarch64-rpm"],
};

const getArgValue = (args: string[], name: string): string | undefined => {
	const index = args.indexOf(name);
	if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
		return args[index + 1];
	}
	const prefix = `${name}=`;
	const inline = args.find((arg) => arg.startsWith(prefix));
	return inline?.slice(prefix.length);
};

const platformKeysOfUpdaterArtifact = (fileName: string): string[] | undefined => {
	if (fileName.endsWith(".app.tar.gz")) {
		const arch = Object.keys(MACOS_PLATFORM_KEYS_BY_ARCH_SUFFIX).find(
			(candidate) => fileName.includes(`_${candidate}`),
		);
		return arch ? MACOS_PLATFORM_KEYS_BY_ARCH_SUFFIX[arch] : undefined;
	}
	if (fileName.endsWith("-setup.exe")) {
		const arch = Object.keys(WINDOWS_PLATFORM_KEYS_BY_ARCH_SUFFIX).find(
			(candidate) => fileName.endsWith(`_${candidate}-setup.exe`),
		);
		return arch ? WINDOWS_PLATFORM_KEYS_BY_ARCH_SUFFIX[arch] : undefined;
	}
	const linuxSuffix = Object.keys(LINUX_PLATFORM_KEYS_BY_FILE_SUFFIX).find(
		(candidate) => fileName.endsWith(candidate),
	);
	return linuxSuffix ? LINUX_PLATFORM_KEYS_BY_FILE_SUFFIX[linuxSuffix] : undefined;
};

export const buildUpdateManifest = (options: {
	version: string;
	tag: string;
	dir: string;
	repo: string;
	notes: string;
	pubDate: string;
}): UpdateManifest => {
	const platforms: Record<string, UpdaterPlatformEntry> = {};

	for (const fileName of readdirSync(options.dir).sort()) {
		const platformKeys = platformKeysOfUpdaterArtifact(fileName);
		if (!platformKeys) {
			continue;
		}
		const signaturePath = path.join(options.dir, `${fileName}.sig`);
		const signature = readFileSync(signaturePath, "utf8").trim();
		if (!signature) {
			throw new Error(`empty updater signature at ${signaturePath}`);
		}
		for (const platformKey of platformKeys) {
			if (platforms[platformKey]) {
				throw new Error(
					`multiple updater artifacts claim platform ${platformKey}; found ${fileName} after ${platforms[platformKey].url}`,
				);
			}
			platforms[platformKey] = {
				signature,
				url: `https://github.com/${options.repo}/releases/download/${options.tag}/${encodeURIComponent(fileName)}`,
			};
		}
	}

	if (Object.keys(platforms).length === 0) {
		throw new Error(
			`no updater artifacts (*.app.tar.gz, *-setup.exe, *.deb or *.rpm with a known arch suffix) found in ${options.dir}`,
		);
	}

	return {
		version: options.version,
		notes: options.notes,
		pub_date: options.pubDate,
		platforms,
	};
};

const main = () => {
	const args = process.argv.slice(2);
	const version = getArgValue(args, "--version");
	const tag = getArgValue(args, "--tag");
	const dir = getArgValue(args, "--dir");
	const out = getArgValue(args, "--out");
	const repo =
		getArgValue(args, "--repo") ??
		process.env.GITHUB_REPOSITORY ??
		"ApexForge-devz/cline";
	const notesFile = getArgValue(args, "--notes-file");

	if (!version || !tag || !dir || !out) {
		throw new Error(
			"usage: generate-update-manifest.ts --version X.Y.Z --tag desktop-vX.Y.Z --dir <artifact dir> --out <latest.json> [--repo owner/repo] [--notes-file <file>]",
		);
	}

	const notes = notesFile
		? readFileSync(notesFile, "utf8").trim()
		: `Cline - ApexForge v${version}`;

	const manifest = buildUpdateManifest({
		version,
		tag,
		dir,
		repo,
		notes,
		pubDate: new Date().toISOString(),
	});

	writeFileSync(out, `${JSON.stringify(manifest, null, "\t")}\n`);
	console.log(`wrote ${out}`);
	for (const [platform, entry] of Object.entries(manifest.platforms)) {
		console.log(`- ${platform}: ${entry.url}`);
	}
};

if (import.meta.main) {
	main();
}
