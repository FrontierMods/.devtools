/**
 * @file Fingerprints for the build manifest
 *
 * `environmentFingerprint` captures what invalidates all outputs at once.
 */

import { AUTODOC_TRANSFORMER_API_VERSION } from "../api-version.ts";

/**
 * The slice of a transformer that identifies its behavior for fingerprinting.
 */
export interface TransformerIdentity {
	/** The transformer's name. */
	name: string;
	/** The transformer's version. */
	version: string;
}

/**
 * Serializes the environment that invalidates every output when it changes.
 * Stored as readable JSON so that a mismatch can be logged as a diff.
 *
 * @param transformers The resolved transformer set, of which only name and version participate.
 * @param configSubset The config values that affect outputs.
 *
 * @returns The serialized environment fingerprint as readable JSON.
 */
export function environmentFingerprint(
	transformers: readonly TransformerIdentity[],
	configSubset: unknown,
): string {
	const transformerVersions = transformers
		.map(({ name, version }) => `${name}@${version}`)
		.sort();

	return JSON.stringify({
		apiVersion: AUTODOC_TRANSFORMER_API_VERSION,
		transformers: transformerVersions,
		config: configSubset,
	});
}
