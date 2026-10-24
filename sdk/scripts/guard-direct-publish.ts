#!/usr/bin/env bun

// This repository still uses the upstream @cline/* package namespace. Block
// direct package publishing unless the operator explicitly acknowledges that
// these names target the upstream npm namespace.
if (process.env.CLINE_ALLOW_UPSTREAM_PACKAGE_PUBLISH !== "1") {
	console.error(
		[
			"Publishing is blocked by default in this fork.",
			"SDK package manifests still use the upstream @cline/* namespace.",
			"Rename the fork's package namespace and dependencies before publishing a fork release.",
			"CLINE_ALLOW_UPSTREAM_PACKAGE_PUBLISH=1 explicitly bypasses this safeguard.",
		].join("\n"),
	);
	process.exit(1);
}
