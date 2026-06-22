/**
 * @file Fingerprints for the build manifest
 *
 * `aggregateFingerprint` hashes a file-set's stats.
 * `environmentFingerprint` captures what invalidates all outputs at once.
 */

import {
	hashString,
	type CanonicalPath,
	type FileMetadata,
} from "@frmds/frontier";
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
 * Hashes a file-set's stats into one order-independent fingerprint. One changed mtime, size, added, or removed file changes the result.
 *
 * @param metadataByFile The stats for every file in the set, keyed by path.
 *
 * @returns The order-independent fingerprint of the file set.
 */
export function aggregateFingerprint(
	metadataByFile: Map<CanonicalPath, FileMetadata>,
): string {
	const lines = [...metadataByFile]
		.map(
			([filePath, metadata]) =>
				`${filePath}:${metadata.mtime}:${metadata.size}`,
		)
		.sort();

	return hashString(lines.join("\n"));
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
