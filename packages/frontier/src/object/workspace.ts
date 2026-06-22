/**
 * @file The mod workspace: file-shaped documents of object timelines plus a reverse index, the canonical working state.
 *
 * All mutation flows through `apply()`, keeping documents, index, and journal coherent by construction.
 */

import { isBaseGame, isPathDeeper } from "../game/quirks.ts";
import { logger } from "../logger.ts";
import type { ModID, ModScope } from "../mod/types.ts";
import { applyPatch, normalizePath, type Patch } from "../patch/patch.ts";
import type {
	CanonicalPath,
	ObjectID,
	ObjectType,
	PropertyPath,
} from "../types/data.ts";
import { deepEqual } from "../validation.ts";
import { ObjectRegistryError } from "./error.ts";
import { makeKeyFromObject, matchesKey, readKey } from "./identity.ts";
import {
	appendEntry,
	appendTombstone,
	createTimelineForObject,
	isTimelineTombstoned,
	timelineCurrent,
	timelineRaw,
	timelineRuntime,
	type EntryOrigin,
	type Timeline,
	type TimelineAnchor,
} from "./timeline.ts";
import type { CompoundKey, GameObject } from "./types.ts";

/**
 * A located timeline: its key plus the record itself.
 */
export interface LocatedTimeline {
	/** The compound key the timeline was located by. */
	key: CompoundKey;
	/** The located timeline record. */
	timeline: Timeline;
}

/**
 * On-demand object supplier for a mod whose objects are not loaded eagerly. `hydrate` loads the file(s) owning an ID into the workspace and reports whether anything was loaded. `hydrateAll` loads everything (the `entries()` fallback).
 */
export interface LazyObjectSource {
	/**
	 * Loads the file(s) owning an ID into the workspace, reporting whether anything was loaded.
	 *
	 * @param id The ID whose owning file(s) to load.
	 *
	 * @returns `true` when anything was loaded.
	 */
	hydrate(id: ObjectID): boolean;
	/**
	 * Loads every object the source can supply, reporting whether anything was loaded.
	 *
	 * @returns `true` when anything was loaded.
	 */
	hydrateAll(): boolean;
}

/**
 * Where a batch lands: the current mod's file document being patched.
 */
export interface ApplyLocation {
	/** The mod whose file document is being patched. */
	modId: ModID;
	/** The file document the batch lands in. */
	file: CanonicalPath;
}

/**
 * What a batch did, for the execute loop.
 */
export interface ApplyResult {
	/** Keys of objects this batch created, in creation order. */
	created: CompoundKey[];
	/** Whether the batch removed the origin object itself. */
	tombstonedSelf: boolean;
	/** Object-relative patches that landed on the origin, the rescan/queue-filter input. */
	selfPatches: Patch[];
}

/**
 * The mod workspace logger.
 */
const LOGGER = logger.getChild("workspace");

/**
 * File-shaped store of object timelines for a build: the current mod plus its read-only dependency mods. Lookup rides on the index that duplicate detection requires, and positions inside a file are resolved on demand.
 */
export class ModWorkspace {
	private readonly documents = new Map<
		ModID,
		Map<CanonicalPath, Timeline[]>
	>();
	private readonly index = new Map<CompoundKey, CanonicalPath>();
	private readonly idIndex = new Map<ObjectID, CompoundKey[]>();
	private readonly completed = new Set<CompoundKey>();
	/** Each timeline's identity, recorded at creation so lookups never re-derive keys from raw shapes. */
	private readonly timelineKeys = new WeakMap<Timeline, CompoundKey>();
	private readonly lazySources = new Map<ModID, LazyObjectSource>();
	private readonly fullyHydrated = new Set<ModID>();

	/**
	 * Registers an on-demand object supplier for a mod. `find()` misses consult it once and retry. `entries()` hydrates it fully.
	 *
	 * @param modId The mod the supplier serves.
	 * @param source The on-demand object supplier to register.
	 */
	registerLazySource(modId: ModID, source: LazyObjectSource): void {
		this.lazySources.set(modId, source);
	}

	/**
	 * Registers a loaded object as a new timeline in its file document. Mirrors the legacy duplicate policy: identical duplicates are dropped, base-game duplicates resolve by deeper path, conflicting same-mod duplicates throw.
	 *
	 * @param object The loaded object to register.
	 * @param modId The mod that owns the object.
	 * @param sourcePath The source file the object came from.
	 *
	 * @throws ObjectRegistryError When a conflicting same-mod duplicate is loaded.
	 */
	load(object: GameObject, modId: ModID, sourcePath: CanonicalPath): void {
		const key = makeKeyFromObject(object, modId);
		const existing = this.locate(key);

		if (existing && !isTimelineTombstoned(existing.timeline)) {
			const resolution = resolveDuplicate(
				existing,
				object,
				modId,
				this.index.get(key)!,
				sourcePath,
			);

			if (resolution === "keep") return;

			this.removeTimeline(key, existing.timeline);
		}

		const timeline = createTimelineForObject(object, { via: "load" });

		this.fileTimelines(modId, sourcePath).push(timeline);
		this.timelineKeys.set(timeline, key);
		this.register(key, sourcePath);
	}

	/**
	 * Returns the timeline for a key: the live match in its file, or the last tombstoned match.
	 *
	 * @param key The compound key to look up.
	 *
	 * @returns The matching timeline, or `undefined` when none is found.
	 */
	timeline(key: CompoundKey): Timeline | undefined {
		return this.locate(key)?.timeline;
	}

	/**
	 * Returns the file holding a key's timeline.
	 *
	 * @param key The compound key to look up.
	 *
	 * @returns The file holding the key's timeline, or `undefined` when unknown.
	 */
	fileOf(key: CompoundKey): CanonicalPath | undefined {
		return this.index.get(key);
	}

	/**
	 * Returns the key's live position within its file array, `undefined` when tombstoned or unknown.
	 *
	 * @param key The compound key to locate.
	 *
	 * @returns The live position within the file array, or `undefined` when tombstoned or unknown.
	 */
	positionOf(key: CompoundKey): number | undefined {
		const file = this.index.get(key);

		if (!file) return undefined;

		const [modId] = readKey(key);
		const live = this.liveTimelines(modId, file);

		const position = live.findIndex(
			(timeline) => this.keyOf(timeline, modId) === key,
		);

		return position === -1 ? undefined : position;
	}

	/**
	 * Finds a live timeline by ID with the legacy scope semantics: insertion-order first match across the scope set. Rides the per-ID index, so only keys sharing the ID are inspected.
	 *
	 * @param id Object ID.
	 * @param type Object type filter, applied when provided.
	 * @param scope Mod dependency scope, searched when provided.
	 *
	 * @returns The first matching live timeline, or `undefined` when none is found.
	 *
	 * @throws ObjectRegistryError When the provided scope is empty.
	 */
	find(
		id: ObjectID,
		type?: ObjectType,
		scope?: ModScope,
	): LocatedTimeline | undefined {
		if (scope && !scope.length)
			throw new ObjectRegistryError(
				"find(): invalid scope provided: empty scope",
			);

		const candidates = this.idIndex.get(id) ?? [];

		for (const key of candidates) {
			const matches = scope
				? scope.some((modId) => matchesKey(key, id, type, modId))
				: matchesKey(key, id, type);

			if (!matches) continue;

			const located = this.locate(key);

			if (located && !isTimelineTombstoned(located.timeline))
				return located;
		}

		if (this.hydrateForMiss(id, scope)) return this.find(id, type, scope);

		return undefined;
	}

	/**
	 * Asks scoped lazy sources to hydrate an ID, true when any of them loaded something new.
	 *
	 * @param id The ID to hydrate.
	 * @param scope Mod dependency scope limiting which sources are consulted.
	 *
	 * @returns `true` when any source loaded something new.
	 */
	private hydrateForMiss(id: ObjectID, scope?: ModScope): boolean {
		let hydrated = false;

		for (const [modId, source] of this.lazySources) {
			if (this.fullyHydrated.has(modId)) continue;
			if (scope && !scope.includes(modId)) continue;

			hydrated = source.hydrate(id) || hydrated;
		}

		return hydrated;
	}

	/** Fully hydrates every lazy source, the cost of type-agnostic iteration. */
	private hydrateAllSources(): void {
		for (const [modId, source] of this.lazySources) {
			if (this.fullyHydrated.has(modId)) continue;

			source.hydrateAll();
			this.fullyHydrated.add(modId);
		}
	}

	/**
	 * Reads an anchored shape: `raw` = entry zero, `runtime` (default) = fold of all entries.
	 *
	 * @param id Object ID.
	 * @param type Object type filter, applied when provided.
	 * @param scope Mod dependency scope, searched when provided.
	 * @param at The anchor to read, `runtime` by default.
	 *
	 * @returns The anchored object shape, or `undefined` when not found.
	 *
	 * @throws ObjectRegistryError When the provided scope is empty.
	 */
	get(
		id: ObjectID,
		type?: ObjectType,
		scope?: ModScope,
		at: TimelineAnchor = "runtime",
	): GameObject | undefined {
		const located = this.find(id, type, scope);

		if (!located) return undefined;
		if (at === "raw") return timelineRaw(located.timeline);

		return timelineRuntime(located.timeline);
	}

	/**
	 * Reports whether a matching live timeline exists.
	 *
	 * @param id Object ID.
	 * @param type Object type filter, applied when provided.
	 * @param scope Mod dependency scope, searched when provided.
	 *
	 * @returns `true` when a matching live timeline exists.
	 *
	 * @throws ObjectRegistryError When the provided scope is empty.
	 */
	has(id: ObjectID, type?: ObjectType, scope?: ModScope): boolean {
		return this.find(id, type, scope) !== undefined;
	}

	/**
	 * Iterates current shapes of all live timelines, keyed, the type-agnostic scan surface.
	 *
	 * @returns An iterator over compound-key and current-shape pairs of every live timeline.
	 */
	*entries(): IterableIterator<[CompoundKey, GameObject]> {
		this.hydrateAllSources();

		for (const key of this.index.keys()) {
			const located = this.locate(key);

			if (!located || isTimelineTombstoned(located.timeline)) continue;

			const shape = timelineCurrent(located.timeline);

			if (shape) yield [key, shape];
		}
	}

	/**
	 * Returns all file documents of a mod, for serialization.
	 *
	 * @param modId The mod whose file documents are listed.
	 *
	 * @returns An iterator over the mod's file paths.
	 */
	files(modId: ModID): IterableIterator<CanonicalPath> {
		return (
			this.documents.get(modId) ?? new Map<CanonicalPath, Timeline[]>()
		).keys();
	}

	/**
	 * Returns the live timelines of one file document, in stored order.
	 *
	 * @param modId The mod owning the file document.
	 * @param file The file document to read.
	 *
	 * @returns The file's live timelines, in stored order.
	 */
	liveTimelines(modId: ModID, file: CanonicalPath): Timeline[] {
		const timelines = this.documents.get(modId)?.get(file) ?? [];

		return timelines.filter((timeline) => !isTimelineTombstoned(timeline));
	}

	/**
	 * Returns the current shapes of a file's live timelines: the document as patches see it and output writes it.
	 *
	 * @param modId The mod owning the file document.
	 * @param file The file document to project.
	 *
	 * @returns The current shapes of the file's live timelines.
	 */
	liveProjection(modId: ModID, file: CanonicalPath): GameObject[] {
		return this.liveTimelines(modId, file).map(
			(timeline) => timelineCurrent(timeline)!,
		);
	}

	/**
	 * Marks a key's enrichment steps as appended. `runtime` reads gate on this via the consumer view.
	 *
	 * @param key The compound key to mark complete.
	 */
	markComplete(key: CompoundKey): void {
		this.completed.add(key);
	}

	/**
	 * Reports whether a key's enrichment steps have been marked complete.
	 *
	 * @param key The compound key to check.
	 *
	 * @returns `true` when the key was marked complete.
	 */
	isComplete(key: CompoundKey): boolean {
		return this.completed.has(key);
	}

	/**
	 * Returns the file's stored timeline array, created on demand (load and apply both need it).
	 *
	 * @param modId The mod owning the file document.
	 * @param file The file document whose timeline array is read.
	 *
	 * @returns The file's stored timeline array, created on demand when absent.
	 */
	fileTimelines(modId: ModID, file: CanonicalPath): Timeline[] {
		let files = this.documents.get(modId);

		if (!files) {
			files = new Map();

			this.documents.set(modId, files);
		}

		let timelines = files.get(file);

		if (!timelines) {
			timelines = [];

			files.set(file, timelines);
		}

		return timelines;
	}

	/**
	 * Returns a timeline's compound key from the creation-time record, derived once for timelines that predate it (raw shapes never change, so the derived key is stable).
	 *
	 * @param timeline The timeline to key.
	 * @param modId The mod owning the timeline, used when the key must be derived.
	 *
	 * @returns The timeline's compound key.
	 */
	private keyOf(timeline: Timeline, modId: ModID): CompoundKey {
		let key = this.timelineKeys.get(timeline);

		if (!key) {
			key = makeKeyFromObject(timelineRaw(timeline), modId);

			this.timelineKeys.set(timeline, key);
		}

		return key;
	}

	/**
	 * Records a key's file in the index and its ID bucket. The bucket mirrors the index's insertion order restricted to one ID, which is exactly the order `find()` must honor. Re-registering an existing key (load-time replacement) keeps both untouched order-wise.
	 *
	 * @param key The compound key to register.
	 * @param file The file holding the key's timeline.
	 */
	private register(key: CompoundKey, file: CanonicalPath): void {
		const isKnown = this.index.has(key);

		this.index.set(key, file);

		if (isKnown) return;

		const [, , id] = readKey(key);
		const bucket = this.idIndex.get(id);

		if (bucket) {
			bucket.push(key);
		} else {
			this.idIndex.set(id, [key]);
		}
	}

	/**
	 * Locates a key's timeline in its file: the live match, or the last tombstoned match.
	 *
	 * @param key The compound key to locate.
	 *
	 * @returns The located timeline with its key, or `undefined` when none is found.
	 */
	private locate(key: CompoundKey): LocatedTimeline | undefined {
		const file = this.index.get(key);

		if (!file) return undefined;

		const [modId] = readKey(key);
		const timelines = this.documents.get(modId)?.get(file) ?? [];

		let lastMatch: Timeline | undefined;

		for (const timeline of timelines) {
			if (this.keyOf(timeline, modId) !== key) continue;

			lastMatch = timeline;

			if (!isTimelineTombstoned(timeline)) return { key, timeline };
		}

		return lastMatch ? { key, timeline: lastMatch } : undefined;
	}

	/**
	 * Removes a timeline from its file's stored array.
	 *
	 * @param key The compound key locating the timeline's file.
	 * @param timeline The timeline to remove.
	 */
	private removeTimeline(key: CompoundKey, timeline: Timeline): void {
		const file = this.index.get(key)!;
		const [modId] = readKey(key);
		const timelines = this.documents.get(modId)!.get(file)!;
		const position = timelines.indexOf(timeline);

		timelines.splice(position, 1);
	}

	/**
	 * Applies a file-rooted patch batch, the single mutation channel. Routes depth-1 structural ops to timeline creation/tombstone and index registration. Deeper patches apply to the target object's shape and append as object-relative entries. The origin's own entry is flushed before any creation so genesis origins can point at it.
	 *
	 * @param batch The file-rooted patch batch to apply.
	 * @param location Where the batch lands: the mod and file document being patched.
	 * @param via What produced the batch, recorded on each entry.
	 * @param originKey The object being processed when the batch was emitted.
	 *
	 * @returns A summary of what the batch did, for the execute loop.
	 *
	 * @throws ObjectRegistryError When the origin is unknown, a created object already exists, or a patch targets no live object.
	 */
	apply(
		batch: Patch[],
		location: ApplyLocation,
		via: string,
		originKey: CompoundKey,
	): ApplyResult {
		const stored = this.fileTimelines(location.modId, location.file);

		const live = stored.filter(
			(timeline) => !isTimelineTombstoned(timeline),
		);

		const originTimeline = this.timeline(originKey);

		if (!originTimeline)
			throw new ObjectRegistryError(
				`apply(): unknown origin \`${originKey}\``,
			);

		const staged = new Map<
			Timeline,
			{ patches: Patch[]; shape: GameObject }
		>();

		const created: CompoundKey[] = [];
		const selfPatches: Patch[] = [];

		let tombstonedSelf = false;

		const flushOrigin = (): void => {
			const pending = staged.get(originTimeline);

			if (!pending) return;

			appendEntry(
				originTimeline,
				{ via },
				pending.patches,
				pending.shape,
			);
			selfPatches.push(...pending.patches);
			staged.delete(originTimeline);
		};

		const origin = (): EntryOrigin => ({
			key: originKey,
			entry: originTimeline.entries.length - 1,
		});

		for (const patch of batch) {
			const path = normalizePath(patch);

			const isStructural =
				path.length <= 1 &&
				(patch.op === "push" ||
					patch.op === "insert" ||
					patch.op === "remove");

			if (isStructural && patch.op !== "remove") {
				// & creation: register, build the timeline, splice into both arrays
				const value = patch.value as GameObject;
				const key = makeKeyFromObject(value, location.modId);
				const existing = this.locate(key);

				if (existing && !isTimelineTombstoned(existing.timeline))
					throw new ObjectRegistryError(
						`apply(): object \`${key}\` already exists\n` +
							`  Existing: ${describeOrigin(existing.timeline)}\n` +
							`  Created by: \`${via}\` while processing \`${originKey}\`\n` +
							`Live objects cannot be overwritten; remove first or pick a unique ID.`,
					);

				flushOrigin();

				const timeline = createTimelineForObject(value, {
					via,
					origin: origin(),
				});

				this.timelineKeys.set(timeline, key);

				const livePosition =
					patch.op === "insert" && path.length
						? Number(path[0])
						: live.length;
				const storedPosition =
					livePosition >= live.length
						? stored.length
						: stored.indexOf(live[livePosition]!);

				stored.splice(storedPosition, 0, timeline);
				live.splice(livePosition, 0, timeline);
				this.register(key, location.file);
				created.push(key);

				continue;
			}

			if (isStructural) {
				// & removal: tombstone in place, drop from the live view only
				const position = Number(path[0]);
				const target = live[position];

				if (!target)
					throw new ObjectRegistryError(
						`apply(): no object at position ${position} in ${location.file}`,
					);

				const pending = staged.get(target);

				if (pending && target !== originTimeline) {
					appendEntry(
						target,
						{ via, origin: origin() },
						pending.patches,
						pending.shape,
					);
					staged.delete(target);
				}

				if (target === originTimeline) {
					flushOrigin();

					tombstonedSelf = true;

					appendTombstone(target, { via });
				} else {
					appendTombstone(target, { via, origin: origin() });
				}

				live.splice(position, 1);

				continue;
			}

			// & object-level patch: strip the position, apply to the staged shape
			const position = Number(path[0]);
			const target = live[position];

			if (!target)
				throw new ObjectRegistryError(
					`apply(): no object at position ${position} in ${location.file}\n  patch: ${JSON.stringify(patch)}`,
				);

			const objectPatch = toObjectPatch(patch, path, location.file);
			const shape = staged.get(target)?.shape ?? timelineCurrent(target)!;
			const nextShape = applyPatch(shape, objectPatch) as GameObject;

			const pending = staged.get(target) ?? {
				patches: [],
				shape: nextShape,
			};

			pending.patches.push(objectPatch);

			pending.shape = nextShape;

			staged.set(target, pending);
		}

		// * origin's remaining self-entry first, then sibling entries
		flushOrigin();

		for (const [timeline, pending] of staged)
			appendEntry(
				timeline,
				{ via, origin: origin() },
				pending.patches,
				pending.shape,
			);

		return { created, tombstonedSelf, selfPatches };
	}
}

/**
 * Mirrors the legacy duplicate policy for load-time records. Returns `"keep"` when the existing timeline wins, `"replace"` when the incoming object should take over (base-game deeper-path quirk). Throws on conflicting same-mod duplicates.
 *
 * @param existing The already-located timeline for the key.
 * @param object The incoming object being loaded.
 * @param modId The mod that owns both objects.
 * @param existingPath The source file the existing object came from.
 * @param sourcePath The source file the incoming object came from.
 *
 * @returns `"keep"` when the existing timeline wins, `"replace"` when the incoming object takes over.
 *
 * @throws ObjectRegistryError When the objects conflict within the same mod.
 */
function resolveDuplicate(
	existing: LocatedTimeline,
	object: GameObject,
	modId: ModID,
	existingPath: CanonicalPath,
	sourcePath: CanonicalPath,
): "keep" | "replace" {
	if (existingPath === sourcePath) return "replace";

	if (deepEqual(object, timelineRaw(existing.timeline))) {
		LOGGER.debug(
			`Skipping duplicate: \`${existing.key}\` from ${sourcePath} (identical to ${existingPath})`,
		);

		return "keep";
	}

	if (isBaseGame(modId)) {
		if (!isPathDeeper(existingPath, sourcePath)) {
			LOGGER.debug(
				`Kept ${existingPath}, skipped ${sourcePath} (existing path deeper)`,
			);

			return "keep";
		}

		LOGGER.debug(
			`Replaced ${existingPath} with ${sourcePath} (deeper path wins)`,
		);

		return "replace";
	}

	throw new ObjectRegistryError(
		`Duplicate object with different content: \`${existing.key}\`\n` +
			`  First defined in:  ${existingPath}\n` +
			`  Also defined in ${sourcePath}\n` +
			`  Each object must be unique within the same mod.`,
	);
}

/**
 * Strips the file-level position from a resolved patch, yielding the object-relative patch stored on the timeline. Cross-object `from` paths have no defined semantics and throw.
 *
 * @param patch The resolved file-rooted patch.
 * @param path The patch's normalized file-rooted path.
 * @param file The file the patch applies to, for error messages.
 *
 * @returns The object-relative patch stored on the timeline.
 *
 * @throws ObjectRegistryError When the patch's `from` path crosses objects.
 */
function toObjectPatch(
	patch: Patch,
	path: PropertyPath,
	file: CanonicalPath,
): Patch {
	const objectPatch = { ...patch, path: path.slice(1) };

	if ("from" in objectPatch && Array.isArray(objectPatch.from)) {
		if (objectPatch.from[0] !== path[0])
			throw new ObjectRegistryError(
				`apply(): cross-object \`from\` is not supported\n  patch: ${JSON.stringify(patch)}\n  file: ${file}`,
			);

		objectPatch.from = objectPatch.from.slice(1);
	}

	delete (objectPatch as { key?: string }).key;

	return objectPatch;
}

/**
 * Describes the human-readable provenance of a timeline's creation, for collision errors.
 *
 * @param timeline The timeline whose creation provenance is described.
 *
 * @returns A human-readable description of how the timeline was created.
 */
function describeOrigin(timeline: Timeline): string {
	const source = timeline.entries[0]!.source;

	if (source.origin)
		return `created by \`${source.via}\` while processing \`${source.origin.key}\` (entry ${source.origin.entry})`;

	return `loaded from source`;
}
