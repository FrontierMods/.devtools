/**
 * @file Append-only object timeline: a log of `(source, patches)` entries, with anchors and state as folds over the log.
 *
 * `current`/`runtime` are derived caches, never authoritative.
 */

import { applyPatches, type Patch, type PushPatch } from "../patch/patch.ts";
import type { JSONValue } from "../types/data.ts";
import { ObjectRegistryError } from "./error.ts";
import type { CompoundKey, GameObject } from "./types.ts";

/**
 * Named points on an object's timeline addressable by consumers.
 */
export type TimelineAnchor = "raw" | "runtime";

/**
 * A reserved enrichment-step source name. See `ENRICHMENT_STEPS`.
 */
export type EnrichmentStep =
	(typeof ENRICHMENT_STEPS)[keyof typeof ENRICHMENT_STEPS];

/**
 * The cross-object origin of an entry: which object was being processed when the effect was emitted, and that object's latest entry index at that moment. Underivable from the timeline itself.
 */
export interface EntryOrigin {
	/** The compound key of the object that was being processed. */
	key: CompoundKey;
	/** That object's latest entry index at the moment the effect was emitted. */
	entry: number;
}

/**
 * What produced an entry. `via` is a transformer name or a reserved enrichment step (`load`, `compose`, `derive`). `origin` is present only when the effect crossed objects (spawn genesis, sibling write).
 */
export interface EntrySource {
	/** The transformer name or reserved enrichment step that produced the entry. */
	via: string;
	/** Cross-object provenance, present only when the effect crossed objects. */
	origin?: EntryOrigin;
}

/**
 * One step on an object's timeline: the source that produced it and the object-relative patches it applied.
 */
export interface TimelineEntry {
	/** What produced this entry. */
	source: EntrySource;
	/** The object-relative patches this entry applied. */
	patches: Patch[];
}

/**
 * A single object's full record. `entries` is the only authoritative field. `current` (serialization shape, the fold of non-host entries) and `runtime` (fold of all entries) are caches where `null` marks a tombstoned shape and `undefined` marks not-yet-derived.
 */
export interface Timeline {
	/** The authoritative append-only log of steps applied to the object. */
	entries: TimelineEntry[];
	/** Cached serialization shape, `null` when tombstoned and `undefined` when not yet derived. */
	current?: GameObject | null;
	/** Cached runtime shape including enrichment steps, `null` when tombstoned and `undefined` when not yet derived. */
	runtime?: GameObject | null;
}

/**
 * The reserved source names for enrichment steps: pipeline-internal steps that enrich every object with non-authored (inherited and derived) data, as opposed to user transformers (whose `via` is the transformer's own name):
 * - `load`: entry zero, the creation push of an authored object into its file
 * - `compose`: applies `copy-from` inheritance from a parent object
 * - `derive`: applies runtime property derivations (e.g. `longest_side` from `volume`)
 *
 * This is the single source of truth for those names: emitters set `EntrySource.via` to one of them (see autodoc's `enrichment.ts` and `ModWorkspace`'s loader), and the fold logic below keys off them. They are listed literally because enrichment steps are a closed, engine-defined set, not user-extensible, so there is nothing to derive them from.
 */
export const ENRICHMENT_STEPS = {
	load: "load",
	compose: "compose",
	derive: "derive",
} as const;

/**
 * All reserved enrichment-step source names. Entries carrying one of these sources fold into the `runtime` shape but are excluded from the serialized `current` shape, because enrichment steps are post-creation additions that must never appear in authored output. `load` is included for completeness. It never reaches the fold loop or `appendEntry`, since it is entry zero, materialized directly by `timelineRaw`.
 */
export const ENRICHMENT_SOURCES: readonly string[] =
	Object.values(ENRICHMENT_STEPS);

/**
 * Reports whether an entry was produced by an enrichment step (`load`/`compose`/`derive`) rather than a user transformer.
 *
 * @param entry The timeline entry to inspect.
 *
 * @returns `true` when the entry's source is an enrichment step.
 */
function isEnrichmentEntry(entry: TimelineEntry): boolean {
	return ENRICHMENT_SOURCES.includes(entry.source.via);
}

/**
 * Reports whether an entry is the tombstone entry: an unkeyed root-level `remove`.
 *
 * @param entry The timeline entry to inspect.
 *
 * @returns `true` when the entry is the tombstone entry.
 */
function isTombstoneEntry(entry: TimelineEntry): boolean {
	return entry.patches.some(
		(patch) =>
			patch.op === "remove" &&
			patch.key === undefined &&
			!patch.path?.length,
	);
}

/**
 * Creates a timeline whose entry zero is the creation patch.
 *
 * @param object The object to seed the timeline with.
 * @param source What produced the creation entry.
 *
 * @returns A timeline whose entry zero is the object's creation push.
 */
export function createTimelineForObject(
	object: GameObject,
	source: EntrySource,
): Timeline {
	return {
		entries: [
			{ source, patches: [{ op: "push", path: [".."], value: object }] },
		],
		current: object,
	};
}

/**
 * Returns the `raw` anchor: the object as authored or as first created.
 *
 * @param timeline The timeline to read entry zero from.
 *
 * @returns The object as authored or as first created.
 */
export function timelineRaw(timeline: Timeline): GameObject {
	// entry zero is always the creation push (see `createTimelineForObject`), so its value is the raw object
	return (timeline.entries[0]!.patches[0] as PushPatch).value as GameObject;
}

/**
 * Reports whether the object was removed. Tombstoned timelines reject appends and fold to `undefined`.
 *
 * @param timeline The timeline to inspect.
 *
 * @returns `true` when the timeline's last entry is the tombstone.
 */
export function isTimelineTombstoned(timeline: Timeline): boolean {
	return isTombstoneEntry(timeline.entries[timeline.entries.length - 1]!);
}

/**
 * Materializes object state by applying entry zero's value, then each subsequent entry's patches in order. `enriched: false` skips enrichment-step entries (the serialization shape). Returns `undefined` once a tombstone entry is reached.
 *
 * @param timeline The timeline to fold.
 * @param options Fold options, where `enriched` (default `true`) includes enrichment-step entries.
 *
 * @returns The folded object shape, or `undefined` once a tombstone entry is reached.
 */
export function foldTimeline(
	timeline: Timeline,
	options?: { enriched?: boolean },
): GameObject | undefined {
	const includeEnriched = options?.enriched ?? true;

	let shape: JSONValue = timelineRaw(timeline);

	for (const entry of timeline.entries.slice(1)) {
		if (isTombstoneEntry(entry)) return undefined;
		if (!includeEnriched && isEnrichmentEntry(entry)) continue;

		shape = applyPatches(shape, entry.patches);
	}

	return shape as GameObject;
}

/**
 * Returns the cached serialization shape, folding on first read. `undefined` when tombstoned.
 *
 * @param timeline The timeline to read the serialization shape from.
 *
 * @returns The cached serialization shape, or `undefined` when tombstoned.
 */
export function timelineCurrent(timeline: Timeline): GameObject | undefined {
	if (timeline.current !== undefined) return timeline.current ?? undefined;

	const folded = foldTimeline(timeline, { enriched: false });

	timeline.current = folded ?? null;

	return folded;
}

/**
 * Returns the cached runtime shape (all entries, enrichment steps included), folding on first read.
 *
 * @param timeline The timeline to read the runtime shape from.
 *
 * @returns The cached runtime shape, or `undefined` when tombstoned.
 */
export function timelineRuntime(timeline: Timeline): GameObject | undefined {
	if (timeline.runtime !== undefined) return timeline.runtime ?? undefined;

	const folded = foldTimeline(timeline);

	timeline.runtime = folded ?? null;

	return folded;
}

/**
 * Appends an entry and updates caches from `shape`, the object after these patches, which is the apply result, so nothing refolds. Enrichment-step entries update only the runtime cache (enrichment steps never serialize). Transformer entries set the serialization cache and drop the runtime cache for refold on next read. Returns the new entry's index for origin pointers.
 *
 * @param timeline The timeline to append to.
 * @param source What produced the entry.
 * @param patches The object-relative patches this entry applies.
 * @param shape The object shape after these patches, used to update caches.
 *
 * @returns The new entry's index, for origin pointers.
 *
 * @throws ObjectRegistryError When the timeline is already tombstoned.
 */
export function appendEntry(
	timeline: Timeline,
	source: EntrySource,
	patches: Patch[],
	shape: GameObject,
): number {
	if (isTimelineTombstoned(timeline))
		throw new ObjectRegistryError(
			`appendEntry(): failed to append entry to timeline: timeline is dead (removed by \`${
				timeline.entries[timeline.entries.length - 1]!.source.via
			}\`)`,
		);

	timeline.entries.push({ source, patches });

	if (ENRICHMENT_SOURCES.includes(source.via)) {
		timeline.runtime = shape;
	} else {
		timeline.current = shape;
		timeline.runtime = undefined;
	}

	return timeline.entries.length - 1;
}

/**
 * Appends the tombstone entry: the object no longer exists from here on.
 *
 * @param timeline The timeline to tombstone.
 * @param source What produced the tombstone entry.
 *
 * @throws ObjectRegistryError When the timeline is already tombstoned.
 */
export function appendTombstone(timeline: Timeline, source: EntrySource): void {
	if (isTimelineTombstoned(timeline))
		throw new ObjectRegistryError(
			`appendTombstone(): attempted to append the tombstone patch to timeline which is already dead`,
		);

	timeline.entries.push({ source, patches: [{ op: "remove", path: [] }] });

	timeline.current = null;
	timeline.runtime = null;
}
