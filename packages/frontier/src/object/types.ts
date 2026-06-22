/**
 * @file Object registry types: game object shapes, identity keys, and the registry interfaces consumers program against.
 */

import type { ModID, ModScope } from "../mod/types.ts";
import type {
	CanonicalPath,
	JSONObject,
	ObjectID,
	ObjectType,
	Path,
} from "../types/data.ts";

/**
 * A property name that can carry an object's identifier, drawn from `ID_PROPERTIES`.
 */
export type IDProperty = (typeof ID_PROPERTIES)[number];

/**
 * Game object that has at least one resolvable identifier property, so its key can be derived without a runtime check.
 */
export type IDResolvableObject = GameObject & {
	[key in (typeof ID_PROPERTIES)[number]]: ObjectID;
};

/**
 * Compound key in `modId:type:id` form, the registry's unique handle for one object across all mods.
 */
export type CompoundKey = `${ModID}:${ObjectType}:${ObjectID}`;

/**
 * A compound key split back into its parts. `type` is `undefined` for the wildcard key form.
 */
export type DecomposedKey = [
	modId: ModID,
	type: ObjectType | undefined,
	id: ObjectID,
];

/**
 * Callback invoked when an object is written to the registry, used to observe newly created objects during transformation.
 *
 * @param object The object being written.
 * @param modId The mod that owns this object.
 * @param sourcePath The source file the object came from, empty when unknown.
 */
export type RegistryEventHandler = (
	object: GameObject,
	modId: ModID,
	sourcePath: CanonicalPath,
) => void;

/**
 * Base game object: JSON-serializable game data loaded from and saved to JSON files. The index signature constrains every property to a JSON value, so the whole pipeline stays serialization-safe.
 *
 * Optional ID-like properties are typed explicitly because the index signature returns `JSONValue`, which excludes `undefined`.
 */
export interface GameObject extends JSONObject {
	/** Standard object identifier, the most common ID property. */
	id?: ObjectID;
	/** The object's kind, used alongside the ID to form a unique key. */
	type: ObjectType;
	/** Runtime inheritance identifier, a base-game quirk that also acts as an ID. */
	abstract?: ObjectID;
	/** Parent object to inherit from during `compose`. */
	"copy-from"?: ObjectID;
}

/**
 * The outcome of ID resolution: the identifier value plus which property supplied it.
 */
export interface ResolvedID {
	/** The resolved identifier value. */
	id: ObjectID;
	/** Which `ID_PROPERTIES` entry the value came from. */
	property: IDProperty;
}

/**
 * Bookkeeping recorded for each stored object, used for duplicate detection and error messages.
 */
export interface ObjectMetadata {
	/** The mod that owns the object. */
	modId: ModID;
	/** Source file the object was loaded from, when known. */
	sourcePath?: Path;
	/** Which `ID_PROPERTIES` entry supplied the ID. */
	property?: IDProperty;
	/** The resolved identifier value. */
	id?: ObjectID;
}

/**
 * A flat, layer-agnostic registry of game objects. Plugins needing multiple layers (such as `raw`, `output`, `runtime`) compose several instances rather than relying on one layered registry.
 *
 * @example
 * ```typescript
 * const registry = new ObjectRegistry();
 *
 * registry.set({ type: "ITEM", id: "sword", weight: 1000 }, "my_mod");
 *
 * const scope = ["my_mod", "core_mod", "dda"];
 * const obj = registry.get("sword", "ITEM", scope);
 * ```
 */
export interface ObjectRegistry {
	/**
	 * Retrieves an object using scope-based resolution, searching mods in scope order.
	 *
	 * @param id Object ID.
	 * @param type Object type, enabling faster lookup when provided.
	 * @param scope Mod dependency scope, ordered closest mod first.
	 *
	 * @returns The object when found, otherwise `undefined`.
	 */
	get(
		id: ObjectID,
		type?: ObjectType,
		scope?: ModScope,
	): GameObject | undefined;

	/**
	 * Returns metadata for an object.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param modId Mod ID.
	 *
	 * @returns Metadata when found, otherwise `undefined`.
	 */
	metadata(
		id: ObjectID,
		type: ObjectType,
		modId: ModID,
	): ObjectMetadata | undefined;

	/**
	 * Stores or updates an object.
	 *
	 * @param object Object to store, which must have `id` or `abstract`, and `type`.
	 * @param modId The owning mod.
	 * @param sourcePath Source file path, used for error messages.
	 *
	 * @throws ObjectRegistryError When the object lacks required fields or conflicts with a duplicate from a different source.
	 */
	set(object: GameObject, modId: ModID, sourcePath?: Path): void;

	/**
	 * Reports whether an object exists.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param scope Mod dependency scope.
	 *
	 * @returns `true` when the object exists.
	 */
	has(id: ObjectID, type?: ObjectType, scope?: ModScope): boolean;

	/**
	 * Removes an object identified uniquely by ID, type, and mod.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param modId Mod ID.
	 *
	 * @returns `true` when an object was removed, `false` when none matched.
	 */
	delete(id: ObjectID, type: ObjectType, modId: ModID): boolean;

	/** Removes every object from the registry. */
	clear(): void;

	/**
	 * Registers a handler for a registry event, called in registration order. Multiple handlers may attach to one event.
	 *
	 * @param event The event name to subscribe to.
	 * @param handler Called when the event fires.
	 *
	 * @example
	 * ```typescript
	 * registry.on("write", (object, modId, sourcePath) => {
	 *   console.log(`Object ${object.id} created in ${modId}`);
	 * });
	 * ```
	 */
	on(event: string, handler: RegistryEventHandler): void;

	/**
	 * Unregisters a previously attached event handler.
	 *
	 * @param event The event the handler was attached to.
	 * @param handler The exact handler function to remove.
	 *
	 * @throws ObjectRegistryError When the event is unknown or the handler was never attached.
	 */
	off(event: string, handler: RegistryEventHandler): void;

	/**
	 * Iterates every stored object as compound-key and object pairs.
	 *
	 * @returns An iterator over compound-key and object pairs.
	 */
	entries(): IterableIterator<[CompoundKey, GameObject]>;
}

/**
 * Read-only view of an object registry, the external type for the `raw` and `runtime` stores. Pipeline code holds writable `InMemoryObjectRegistry` references and hands consumers this read-only shape, so the function boundary is the only seal needed.
 */
export interface ReadableObjectRegistry {
	/**
	 * Resolves an object by ID with optional type and scope filtering.
	 *
	 * @param id Object ID.
	 * @param type Object type, enabling faster lookup when provided.
	 * @param scope Mod dependency scope, ordered closest mod first.
	 *
	 * @returns The object when found, otherwise `undefined`.
	 */
	get(
		id: ObjectID,
		type?: ObjectType,
		scope?: ModScope,
	): GameObject | undefined;
	/**
	 * Reports whether a matching object exists.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param scope Mod dependency scope.
	 *
	 * @returns `true` when a matching object exists.
	 */
	has(id: ObjectID, type?: ObjectType, scope?: ModScope): boolean;
	/**
	 * Returns metadata for a uniquely identified object.
	 *
	 * @param id Object ID.
	 * @param type Object type.
	 * @param modId Mod ID.
	 *
	 * @returns Metadata when found, otherwise `undefined`.
	 */
	metadata(
		id: ObjectID,
		type: ObjectType,
		modId: ModID,
	): ObjectMetadata | undefined;
	/**
	 * Iterates every stored object as compound-key and object pairs.
	 *
	 * @returns An iterator over compound-key and object pairs.
	 */
	entries(): IterableIterator<[CompoundKey, GameObject]>;
}

/**
 * Priority-ordered list of properties that can identify an object. The first entry holding a non-empty string value supplies the object's ID. Add properties here to support further ID-like fields.
 *
 * - `id`: standard identifier, the most common case
 * - `abstract`: runtime inheritance identifier, a base-game quirk
 */
export const ID_PROPERTIES = ["id", "abstract"] as const;
