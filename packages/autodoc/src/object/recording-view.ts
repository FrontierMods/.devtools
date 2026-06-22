/**
 * @file Read-recording decorator over {@link ObjectStoreReader}: logs each consumer file's reads as the manifest's invalidation edges.
 *
 * Misses are recorded too, since an object that is absent now may exist next build.
 */

import type { CanonicalPath } from "@frmds/frontier";
import { makeQuery, type ReadQuery } from "../manifest/queries.ts";
import type { ObjectStoreReader } from "./store-view.ts";

/**
 * One consumer file's recorded reads.
 */
export interface ReadLog {
	/** The set of point reads the consumer performed. */
	queries: Set<ReadQuery>;
	/** True when the consumer iterated all objects. */
	global: boolean;
}

/**
 * The wrapped view plus consumer control and log retrieval.
 */
export interface RecordingView {
	/** The wrapped reader whose reads are recorded. */
	view: ObjectStoreReader;
	/** Announces the source file the following reads belong to, or `null` between objects. */
	setConsumer(file: CanonicalPath | null): void;
	/** The accumulated per-file read log. */
	readsByFile(): Map<CanonicalPath, ReadLog>;
}

/**
 * Wraps a reader so every read is attributed to the active consumer file.
 *
 * @param inner The reader to wrap and record reads against.
 *
 * @returns The recording decorator exposing the wrapped view, consumer control, and log retrieval.
 */
export function createRecordingView(inner: ObjectStoreReader): RecordingView {
	const logs = new Map<CanonicalPath, ReadLog>();

	let consumer: CanonicalPath | null = null;

	function logOf(file: CanonicalPath): ReadLog {
		let log = logs.get(file);

		if (!log) {
			log = { queries: new Set(), global: false };

			logs.set(file, log);
		}

		return log;
	}

	const view: ObjectStoreReader = {
		get(id, type, scope, options) {
			if (consumer) logOf(consumer).queries.add(makeQuery(id, type));

			return inner.get(id, type, scope, options);
		},

		has(id, type, scope) {
			if (consumer) logOf(consumer).queries.add(makeQuery(id, type));

			return inner.has(id, type, scope);
		},

		entries() {
			if (consumer) logOf(consumer).global = true;

			return inner.entries();
		},
	};

	return {
		view,
		setConsumer(file) {
			consumer = file;
		},
		readsByFile() {
			return logs;
		},
	};
}
