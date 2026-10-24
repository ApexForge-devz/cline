/**
 * Validate that an SDK release has an explicit branch identity.
 *
 * Release scripts must not check out or pull another branch implicitly: in a
 * fork, "main" can have different semantics and tracking configuration.
 */
export function assertNamedReleaseBranch(branch: string): string {
	const normalized = branch.trim();
	if (!normalized || normalized === "HEAD") {
		throw new Error(
			"SDK releases require a named branch; refusing to publish from a detached or unknown HEAD.",
		);
	}
	return normalized;
}
