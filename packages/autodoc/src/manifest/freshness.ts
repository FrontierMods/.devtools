/**
 * @file The freshness check: compares a stored manifest against current state.
 */

import {
	entries,
	type CanonicalPath,
	type FileMetadata,
	type ModID,
} from "@frmds/frontier";
import type { BuildManifest } from "./types.ts";

/**
 * Everything the decision needs, gathered by the caller.
 */
export interface FreshnessInputs {
	/** The stored manifest. */
	manifest?: BuildManifest;
	/** Current environment fingerprint. */
	environment: string;
	/** Current stats for every discovered source file. */
	sources: Map<CanonicalPath, FileMetadata>;
	/** Current aggregate fingerprint per dependency mod. */
	dependencies: Map<ModID, string>;
	/** Current stats for the manifest's output files. */
	outputs: Map<CanonicalPath, FileMetadata>;
}

/**
 * The decision plus a human-readable reason for observability.
 */
export interface FreshnessResult {
	/** `true` when the previous build's outputs are still valid. */
	upToDate: boolean;
	/** A human-readable reason for the decision, for observability. */
	reason: string;
}

/**
 * Compares two stat records.
 *
 * @param left The first stat record.
 * @param right The second stat record.
 *
 * @returns `true` when both records share an mtime and size.
 */
function metadataEquals(left: FileMetadata, right: FileMetadata): boolean {
	return left.mtime === right.mtime && left.size === right.size;
}

/**
 * Decides whether the previous build's outputs are still valid.
 *
 * @param inputs Everything the decision needs, gathered by the caller.
 *
 * @returns The freshness decision with its reason.
 */
export function checkFreshness(inputs: FreshnessInputs): FreshnessResult {
	const { manifest, environment, sources, dependencies, outputs } = inputs;

	if (!manifest)
		return { upToDate: false, reason: "no manifest from a previous build" };

	if (manifest.environment !== environment)
		return { upToDate: false, reason: "transformer set or config changed" };

	const manifestSources = entries(manifest.sources);

	if (manifestSources.length !== sources.size)
		return { upToDate: false, reason: "source file set changed" };

	for (const [filePath, entry] of manifestSources) {
		const current = sources.get(filePath);

		if (!current)
			return { upToDate: false, reason: `source removed: ${filePath}` };
		if (!metadataEquals(entry.source, current))
			return { upToDate: false, reason: `source changed: ${filePath}` };
	}

	const manifestDependencies = entries(manifest.dependencies);

	if (manifestDependencies.length !== dependencies.size)
		return { upToDate: false, reason: "dependency mod set changed" };

	for (const [modId, recorded] of manifestDependencies) {
		if (dependencies.get(modId) !== recorded)
			return {
				upToDate: false,
				reason: `dependency mod changed: ${modId}`,
			};
	}

	for (const [, entry] of manifestSources) {
		if (!entry.output) continue;

		const current = outputs.get(entry.output.path);

		if (!current)
			return {
				upToDate: false,
				reason: `output missing: ${entry.output.path}`,
			};
		if (!metadataEquals(entry.output.metadata, current))
			return {
				upToDate: false,
				reason: `output modified externally: ${entry.output.path}`,
			};
	}

	return { upToDate: true, reason: "everything matches" };
}
