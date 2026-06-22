/**
 * @file Types for the build manifest that powers incremental rebuild decisions.
 */

import type { CanonicalPath, FileMetadata, ModID } from "@frmds/frontier";
import type { ReadQuery } from "./queries.ts";

/**
 * One recorded cross-object read with its resolution at build time.
 */
export interface ReadRecord {
	/** The read query. */
	query: ReadQuery;
	/** Source files that owned matching keys at build time. */
	owners: CanonicalPath[];
}

/**
 * One source file's output, recorded with its post-write stats.
 */
export interface OutputRecord {
	/** The written output file's path. */
	path: CanonicalPath;
	/** The output file's stats captured right after the write. */
	metadata: FileMetadata;
}

/**
 * Everything the rebuild decision needs to know about one source file.
 */
export interface SourceEntry {
	/** The source file's stats at the moment the build read it. */
	source: FileMetadata;
	/** Cross-object reads made by this file's objects during scan and execute. */
	reads: ReadRecord[];
	/** `true` when any of this file's objects iterated all objects. */
	readsGlobally: boolean;
	/** The output this source produced, with post-write stats. */
	output: OutputRecord | null;
}

/**
 * Snapshot of one build's inputs and outputs, persisted after every successful build.
 */
export interface BuildManifest {
	/** Manifest schema version. */
	version: number;
	/** Stable JSON describing the transformer set, plugin config, and toolkit. */
	environment: string;
	/** Per dependency mod: aggregate fingerprint over its file set. */
	dependencies: Record<ModID, string>;
	/** Per source file: fingerprint, read edges, and output record. */
	sources: Record<CanonicalPath, SourceEntry>;
}

/**
 * Bump when {@link BuildManifest} changes shape.
 */
export const MANIFEST_VERSION = 2;
