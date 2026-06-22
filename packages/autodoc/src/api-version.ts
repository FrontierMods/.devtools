/**
 * @file The transformer API version transformers declare against, and the compatibility check the loader uses at registration time.
 */

/**
 * Current transformer API version.
 */
export const AUTODOC_TRANSFORMER_API_VERSION = "1.0.0";

/**
 * Checks whether the transformer's declared API version is compatible.
 *
 * @param declared The API version from a transformer.
 *
 * @returns `true` when the declared version is compatible with the host.
 */
export function isTransformerApiCompatible(declared: string): boolean {
	const [hostMajor, hostMinor] = AUTODOC_TRANSFORMER_API_VERSION.split(".");
	const [major, minor] = declared.split(".");

	if (hostMajor === "0") return major === "0" && minor === hostMinor;

	return major === hostMajor;
}
