/**
 * @file The dirty closure: which source files must re-run the pipeline.
 *
 * Pure: all I/O (stats, manifest, scanning) is the caller's.
 */

import {
	entries,
	type CanonicalPath,
	type FileMetadata,
} from "@frmds/frontier";
import type { QueryResolver, ReadQuery } from "./queries.ts";
import type { BuildManifest } from "./types.ts";

/**
 * Everything the closure needs, gathered by the caller.
 */
export interface DirtyInputs {
	/** The previous build's manifest (same environment, since the caller full-builds on any environment mismatch). */
	manifest: BuildManifest;
	/** Current stats for every discovered source file. */
	currentSources: Map<CanonicalPath, FileMetadata>;
	/** Current stats for the manifest's recorded outputs, where missing files are absent. */
	outputStats: Map<CanonicalPath, FileMetadata>;
	/** Current owner resolution over the loaded CWD objects. */
	resolveOwners: QueryResolver;
	/**
	 * Resolves the fresh declared read queries for a file.
	 * Called only for changed or new files.
	 *
	 * @param file The source file whose declared read queries are gathered.
	 *
	 * @returns The read queries declared by the file's objects.
	 */
	scanReads(file: CanonicalPath): ReadQuery[];
}

/**
 * The closure result.
 * `dirty` files run the pipeline, while `removed` files only get their recorded outputs deleted.
 */
export interface DirtyResult {
	/** Source files that must re-run the pipeline. */
	dirty: Set<CanonicalPath>;
	/** Source files that are gone and whose recorded outputs are deleted. */
	removed: Set<CanonicalPath>;
	/** Why each file is dirty, for observability. */
	reasons: Map<CanonicalPath, string>;
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
 * Computes which source files must re-execute.
 *
 * @param inputs Everything the closure needs, gathered by the caller.
 *
 * @returns The dirty and removed file sets, with per-file reasons.
 */
export function computeDirtySources(inputs: DirtyInputs): DirtyResult {
	// eslint-disable-next-line typescript/unbound-method -- `resolveOwners` is a closure from `buildQueryResolver`, never bound to `this`
	const { manifest, currentSources, outputStats, resolveOwners, scanReads } =
		inputs;

	const manifestSources = new Map(entries(manifest.sources));

	const dirty = new Set<CanonicalPath>();
	const removed = new Set<CanonicalPath>();
	const reasons = new Map<CanonicalPath, string>();
	const worklist: CanonicalPath[] = [];

	function markDirty(file: CanonicalPath, reason: string): void {
		if (dirty.has(file)) return;

		dirty.add(file);
		reasons.set(file, reason);
		worklist.push(file);
	}

	for (const file of manifestSources.keys())
		if (!currentSources.has(file)) removed.add(file);

	for (const [file, currentMetadata] of currentSources) {
		const entry = manifestSources.get(file);

		if (!entry) {
			markDirty(file, "new source");

			continue;
		}

		if (!metadataEquals(entry.source, currentMetadata)) {
			markDirty(file, "source changed");

			continue;
		}

		if (entry.output) {
			const outputMetadata = outputStats.get(entry.output.path);

			if (!outputMetadata) {
				markDirty(file, "output missing");

				continue;
			}

			if (!metadataEquals(entry.output.metadata, outputMetadata))
				markDirty(file, "output modified externally");
		}
	}

	for (const [file, entry] of manifestSources) {
		if (dirty.has(file) || removed.has(file)) continue;

		for (const { query, owners } of entry.reads) {
			const currentOwners = resolveOwners(query);

			if (
				currentOwners.length === owners.length &&
				currentOwners.every((owner, index) => owner === owners[index])
			)
				continue;

			markDirty(file, `read targets moved: ${query}`);

			break;
		}
	}

	const readersByOwner = new Map<CanonicalPath, Set<CanonicalPath>>();

	for (const [file, entry] of manifestSources) {
		if (removed.has(file)) continue;

		for (const { query } of entry.reads) {
			for (const owner of resolveOwners(query)) {
				let readers = readersByOwner.get(owner);

				if (!readers) {
					readers = new Set();

					readersByOwner.set(owner, readers);
				}

				readers.add(file);
			}
		}
	}

	function forwardTargets(file: CanonicalPath): CanonicalPath[] {
		const entry = manifestSources.get(file);

		const contentChanged =
			!entry || !metadataEquals(entry.source, currentSources.get(file)!);

		const queries = contentChanged
			? scanReads(file)
			: entry.reads.map(({ query }) => query);

		return queries.flatMap((query) => resolveOwners(query));
	}

	function propagate(): void {
		while (worklist.length) {
			const file = worklist.pop()!;

			for (const reader of readersByOwner.get(file) ?? [])
				markDirty(reader, `reads dirty file: ${file}`);

			for (const target of forwardTargets(file))
				if (currentSources.has(target))
					markDirty(target, `read by dirty file: ${file}`);
		}
	}

	propagate();

	if (dirty.size) {
		for (const [file, entry] of manifestSources) {
			if (removed.has(file)) continue;

			if (entry.readsGlobally) markDirty(file, "global reader");
		}

		propagate();
	}

	return { dirty, removed, reasons };
}
