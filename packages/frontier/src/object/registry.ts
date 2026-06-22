/**
 * @file In-memory object registry: a flat, layer-agnostic store of game objects keyed by compound key, with scope-based lookup and duplicate policy.
 *
 * Plugins needing multiple layers (such as `raw`, `output`, `runtime`) compose several instances rather than relying on one layered registry.
 */

import { deepEqual } from "../validation.ts";
import { isBaseGame, isPathDeeper } from "../game/quirks.ts";
import { logger } from "../logger.ts";
import type { ModID, ModScope } from "../mod/types.ts";
import type {
	CanonicalPath,
	ObjectID,
	ObjectType,
	Path,
} from "../types/data.ts";
import { ObjectRegistryError } from "./error.ts";
import { makeKey, matchesKey, resolveObjectID } from "./identity.ts";
import {
	type CompoundKey,
	type GameObject,
	type ObjectMetadata,
	type ObjectRegistry,
	type RegistryEventHandler,
} from "./types.ts";

/**
 * The object registry logger.
 */
const LOGGER = logger.getChild("registry");

/**
 * In-memory implementation of `ObjectRegistry`, storing objects and their metadata in maps keyed by compound key.
 *
 * @example
 * ```typescript
 * const registry = new InMemoryObjectRegistry();
 *
 * registry.set({ type: "ITEM", id: "sword", weight: 1000 }, "my_mod");
 *
 * const scope = ["my_mod", "core_mod", "dda"];
 * const obj = registry.get("sword", "ITEM", scope);
 * ```
 */
export class InMemoryObjectRegistry implements ObjectRegistry {
	private readonly objects = new Map<CompoundKey, GameObject>();
	private readonly meta = new Map<CompoundKey, ObjectMetadata>();

	/**
	 * Write event handlers.
	 */
	private handlers = new Map<string, RegistryEventHandler[]>();

	constructor() {}

	/**
	 * Retrieves an object by ID, optionally filtering by type and searching within a mod scope.
	 *
	 * @param id Object ID.
	 * @param type Object type filter, applied when provided.
	 * @param scope Mod dependency scope, searched in order when provided.
	 *
	 * @returns The matching object, or `undefined` when none matched.
	 *
	 * @throws ObjectRegistryError When the provided scope is empty.
	 */
	get(
		id: ObjectID,
		type?: ObjectType,
		scope?: ModScope,
	): GameObject | undefined {
		if (scope) {
			if (!scope.length)
				throw new ObjectRegistryError(
					"get(): invalid scope provided: empty scope",
				);

			const entry = this.objects
				.entries()
				.find(([key]) =>
					scope.some((modId) => matchesKey(key, id, type, modId)),
				);

			return entry?.[1];
		}

		const entry = this.objects
			.entries()
			.find(([key]) => matchesKey(key, id, type));

		return entry?.[1];
	}

	/**
	 * Retrieves metadata for a specific object.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param modId Mod ID.
	 *
	 * @returns The object's metadata, or `undefined` when none is stored.
	 */
	metadata(
		id: ObjectID,
		type: ObjectType,
		modId: ModID,
	): ObjectMetadata | undefined {
		const key = makeKey(id, type, modId);

		return this.meta.get(key);
	}

	/**
	 * Stores an object. Throws if object is a conflicting duplicate.
	 *
	 * @param object The object to store, which must have `id` or `abstract`.
	 * @param modId The mod that owns the object.
	 * @param sourcePath Source file the object came from, used for duplicate detection and error messages.
	 *
	 * @throws When the object's ID cannot be resolved, or when it conflicts with a duplicate from a different source.
	 */
	set(object: GameObject, modId: ModID, sourcePath?: Path): void {
		const { id, property } = resolveObjectID(object);

		const key = makeKey(id, object.type, modId);

		// Check for duplicates from different source files
		if (this.objects.has(key)) {
			const metadata = this.meta.get(key);

			// Allow updates from the same source file (transformation workflow)
			// Only check further if object is defined in multiple different source files
			if (
				metadata &&
				metadata.sourcePath &&
				sourcePath &&
				metadata.sourcePath !== sourcePath
			) {
				// * we know we have the other object because of the `has()` check up the tree
				const other = this.objects.get(key)!;

				// Identical duplicate
				if (deepEqual(object, other)) {
					LOGGER.debug(
						`Skipping duplicate: ID \`${id}\`, type \`${object.type}\` from ${sourcePath} (identical to ${metadata.sourcePath})`,
					);

					// Skip registration, keep first definition
					return;
				}

				// Different content - handle based on mod
				if (isBaseGame(modId)) {
					// Base game quirk: deeper path wins
					if (!isPathDeeper(metadata.sourcePath, sourcePath)) {
						LOGGER.debug(
							`Kept ${metadata.sourcePath}, skipped ${sourcePath} (existing path deeper)`,
						);

						return;
					}

					LOGGER.debug(
						`Replaced ${metadata.sourcePath} with ${sourcePath} (deeper path wins)`,
					);
				} else {
					throw new ObjectRegistryError(
						`Duplicate object with different content: ID \`${id}\`, type \`${object.type}\` in mod \`${modId}\`\n` +
							`  First defined in:  ${metadata.sourcePath}\n` +
							`  Also defined in ${sourcePath}\n` +
							`  Objects have different content, this would throw at runtime.\n` +
							`  Each object must be unique within the same mod.`,
					);
				}
			}
			// Otherwise, allow the update (e.g., transformers updating objects)
		}

		this.objects.set(key, object);
		this.meta.set(key, {
			modId: modId,
			sourcePath,
			property,
			id,
		});

		this.fire(object, modId, sourcePath ?? "");
	}

	/**
	 * Checks if an object exists in the registry.
	 *
	 * @param id Object ID.
	 * @param type Object type filter, applied when provided.
	 * @param scope Mod dependency scope, searched when provided.
	 *
	 * @returns `true` when a matching object exists.
	 *
	 * @throws ObjectRegistryError When the provided scope is empty.
	 */
	has(id: ObjectID, type?: ObjectType, scope?: ModScope): boolean {
		if (scope) {
			if (!scope.length)
				throw new ObjectRegistryError(
					"has(): invalid scope provided: empty scope",
				);

			return this.objects
				.keys()
				.some((key) =>
					scope.some((modId) => matchesKey(key, id, type, modId)),
				);
		}

		return this.objects.keys().some((key) => matchesKey(key, id, type));
	}

	/**
	 * Removes an object from the registry.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param modId Mod ID.
	 *
	 * @returns `true` when an object was removed, `false` when none matched.
	 */
	delete(id: ObjectID, type: ObjectType, modId: ModID): boolean {
		const key = makeKey(id, type, modId);
		const deleted = this.objects.delete(key);

		this.meta.delete(key);

		return deleted;
	}

	/** Removes all objects from the registry. */
	clear(): void {
		this.objects.clear();
		this.meta.clear();
	}

	/**
	 * Registers a callback to be invoked when an event is fired.
	 *
	 * @param event The event name to subscribe to.
	 * @param handler The callback invoked when the event fires.
	 */
	on(event: string, handler: RegistryEventHandler): void {
		const handlers = this.handlers.get(event) ?? [];

		this.handlers.set(event, [...handlers, handler]);
	}

	/**
	 * Iterates all stored objects.
	 *
	 * @returns An iterator over compound-key and object pairs.
	 */
	entries(): IterableIterator<[CompoundKey, GameObject]> {
		return this.objects.entries();
	}

	/**
	 * Unregisters an event callback.
	 *
	 * @param event The event the handler was attached to.
	 * @param handler The exact handler function to remove.
	 *
	 * @throws ObjectRegistryError When the event is unknown or the handler was never attached.
	 */
	off(event: string, handler: RegistryEventHandler): void {
		const eventful = this.handlers.get(event);

		if (!eventful)
			throw new ObjectRegistryError(
				`off(): attempted to remove handler from unknown event \`${event}\``,
			);

		const values = eventful.values().toArray();

		if (!values.includes(handler))
			throw new ObjectRegistryError(
				`off(): attempted to remove unattached handler from event \`${event}\``,
			);

		const handlers = values.filter((fn) => fn !== handler);

		this.handlers.set(event, handlers);
	}

	/**
	 * Invokes all registered handlers.
	 *
	 * @param object The object that was written.
	 * @param modId The mod that owns the object.
	 * @param sourcePath The source file the object came from.
	 */
	private fire(
		object: GameObject,
		modId: ModID,
		sourcePath: CanonicalPath,
	): void {
		this.handlers
			.values()
			.toArray()
			.flat()
			.forEach((handler) => handler(object, modId, sourcePath));
	}
}
