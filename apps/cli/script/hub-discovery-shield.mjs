/**
 * The hub-discovery shield exists to protect active sessions during a
 * background self-update. This fork disables self-updates by default, so
 * installations should not touch the shared upstream ~/.cline discovery
 * record unless the update package has been explicitly configured.
 */
export function isHubDiscoveryShieldEnabled(env = process.env) {
	return Boolean(env.CLINE_UPDATE_PACKAGE_NAME?.trim());
}
