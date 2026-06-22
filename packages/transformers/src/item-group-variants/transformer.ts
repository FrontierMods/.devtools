/**
 * @file The `item-group-variants` transformer: expands an `item_group` with `from`-bearing entries into one group per variant plus an `:any` group.
 *
 * @example
 * ```json5
 * // input
 * {
 *   id: "placard/onetigris/vulture",
 *   type: "item_group",
 *   subtype: "collection",
 *   entries: [
 *     { item: "placard/onetigris/vulture", from: ["multicam", "black", "coyote"] },
 *   ],
 * }
 *
 * // output: sibling groups
 * //   placard/onetigris/vulture:any, :multicam, :black, :coyote
 * ```
 */

import {
	isGameObject,
	isObject,
	makeKey,
	type JSONObject,
	type JSONValue,
	type ObjectID,
	type Patch,
} from "@frmds/frontier";
import type { TransformContext, Transformer } from "@frmds/autodoc";
import { Type } from "typebox";

// TODO: derive from schema when schema becomes available
/** The two item-group subtypes the game recognizes. Hard-coded until the game schema is available to derive from. */
type ItemGroupSubtype = "collection" | "distribution";

/** Identifier of a single item variant. */
type VariantID = string;

/** A variant paired with its spawn weight. */
type VariantTuple = [id: VariantID, weight: number];

/** A `from` entry: a bare id (weight 1) or an `[id, weight]` tuple. */
type VariantEntry = VariantID | VariantTuple;

/**
 * Item group entry that can appear in item_group.entries arrays.
 * Supports variant expansion via the 'from' property.
 */
type ItemGroupEntry = {
	item: ObjectID;
	variant?: VariantID;
	from?: VariantEntry[];
	prob?: number;
	count?: number | [min: number, max: number];
} & JSONObject;

/**
 * Item group game object.
 */
type ItemGroup = JSONObject & {
	type: "item_group";
	id: ObjectID;
	subtype?: ItemGroupSubtype;
	entries: ItemGroupEntry[];
};

/** Minimal item-variant shape this transformer reads off a referenced item. Duplicated locally to keep the transformer independent. */
interface ItemVariant extends JSONObject {
	id: VariantID;
}

/** An item carrying expanded variants, the form this transformer validates a referenced item against. */
interface ItemWithVariants extends JSONObject {
	type: "ITEM";
	id: ObjectID;
	variants: ItemVariant[];
}

/** An `item_group` whose `entries` contain at least one variant-expansion (`from`) entry. */
const ContentSchema = Type.Object(
	{
		type: Type.Literal("item_group"),
		entries: Type.Array(Type.Unknown(), {
			contains: Type.Object(
				{ from: Type.Array(Type.Unknown()) },
				{ additionalProperties: true },
			),
		}),
	},
	{ additionalProperties: true },
);

/** The `item-group-variants` transformer: a `from`-bearing item_group → its `:any` and per-variant groups. */
const ITEM_GROUP_VARIANTS_TRANSFORMER: Transformer<ItemGroup> = {
	name: "expandItemGroupVariants",
	version: "3.0.0",
	api: "1.0.0",
	description: "Expands item group entries from 'from' arrays",
	target: { content: ContentSchema },

	extractDependencies(value, context) {
		const entriesWithFrom = value.entries.filter(hasVariantExpansion);

		return entriesWithFrom
			.map((entry) => entry.item)
			.filter(Boolean)
			.map((itemId) => makeKey(itemId, "ITEM", context.modId));
	},

	transform(value, context): Patch[] {
		const entriesWithFrom = value.entries.filter((entry) =>
			hasVariantExpansion(entry),
		);

		if (entriesWithFrom.length > 1)
			throw new Error(
				`Only one entry may have a 'from' property in item_group '${value.id}'. ` +
					`Source: ${context.sourcePath}`,
			);

		const templateEntry = entriesWithFrom[0]!;

		if (!templateEntry.item)
			throw new Error(
				`Entry with 'from' must have an 'item' property in item_group '${value.id}'. ` +
					`Source: ${context.sourcePath}`,
			);

		const itemId = templateEntry.item;

		const item = context.objects.get(itemId, "ITEM", context.scope);

		if (!item)
			throw new Error(
				`Item '${itemId}' not found in registry. ` +
					`Source: ${context.sourcePath}\n` +
					`Item group: ${value.id}`,
			);

		validateItemHasVariants(
			item,
			itemId,
			templateEntry.from!,
			context,
			value.id,
		);

		const entryProps = extractEntryTemplateProperties(
			templateEntry as ItemGroupEntry & { from: VariantEntry[] },
		);

		const groupProps = extractGroupTemplateProperties(value);
		const templateId = value.id;

		const variantGroups = templateEntry.from!.map((entry) => {
			const variantId = typeof entry === "string" ? entry : entry[0];
			const generatedId = generateVariantGroupId(templateId, variantId);

			return createVariantGroup(
				generatedId,
				itemId,
				variantId,
				entryProps,
				groupProps,
			);
		});

		const anyId = generateVariantGroupId(templateId, "any");

		const anyGroup = createVariantGroup(
			anyId,
			itemId,
			undefined,
			entryProps,
			groupProps,
		);

		const patches: Patch[] = [
			{ op: "push", path: [".."], value: anyGroup },
			...variantGroups.map<Patch>((group) => ({
				op: "push",
				path: [".."],
				value: group,
			})),
			{ op: "remove", path: [] },
		];

		return patches;
	},
};

/**
 * Type guard for an item carrying expanded variants. Duplicated locally to keep the transformer independent.
 */
function isItemWithVariants(object: JSONValue): object is ItemWithVariants {
	return (
		isGameObject(object) &&
		object.type === "ITEM" &&
		"variants" in object &&
		Array.isArray(object.variants) &&
		!!object.variants.length
	);
}

/**
 * Type guard to check if an entry has the 'from' property for variant expansion.
 */
function hasVariantExpansion(
	entry: unknown,
): entry is ItemGroupEntry & { from: VariantEntry[] } {
	return isObject(entry) && "from" in entry && Array.isArray(entry.from);
}

/**
 * Generate a variant-specific group ID from a base ID and variant identifier.
 *
 * Uses different separators based on whether the base ID already contains a colon:
 * - If baseId contains ':', appends variant as: `baseId/variantId`
 * - If baseId has no ':', appends variant as: `baseId:variantId`
 *
 * This maintains compatibility with existing ID patterns in the game data.
 */
function generateVariantGroupId(baseId: string, variantId: string): string {
	return baseId.includes(":")
		? `${baseId}/${variantId}`
		: `${baseId}:${variantId}`;
}

/**
 * Validate that an item has all the required variants.
 * Throws descriptive error if validation fails.
 */
function validateItemHasVariants(
	item: JSONValue,
	itemId: ObjectID,
	requiredVariants: VariantEntry[],
	context: TransformContext,
	groupId: ObjectID,
): asserts item is ItemWithVariants {
	if (!isItemWithVariants(item))
		throw new Error(
			`Item '${itemId}' has no variants. ` +
				`Source: ${context.sourcePath}\n` +
				`Item group: ${groupId}`,
		);

	const availableVariantIds = item.variants.map((variant) => variant.id);

	for (const entry of requiredVariants) {
		const variantId = typeof entry === "string" ? entry : entry[0];

		if (!availableVariantIds.includes(variantId))
			throw new Error(
				`Item '${itemId}' does not have variant '${variantId}'.\n` +
					`Available variants: [${availableVariantIds.join(", ")}]\n` +
					`Source: ${context.sourcePath}\n` +
					`Item group: ${groupId}`,
			);
	}
}

/**
 * Create a variant-specific item group from template properties.
 */
function createVariantGroup(
	groupId: string,
	itemId: string,
	variantId: string | undefined,
	entryProperties: Partial<ItemGroupEntry>,
	topLevelProperties: Partial<ItemGroup>,
): ItemGroup {
	const entry: ItemGroupEntry = {
		item: itemId,
		...(variantId && { variant: variantId }),
		...entryProperties,
	};

	return {
		...topLevelProperties,
		id: groupId,
		type: "item_group",
		entries: [entry],
	};
}

/**
 * Extract template properties from an entry, excluding transformation-specific fields.
 */
function extractEntryTemplateProperties(
	entry: ItemGroupEntry & { from: VariantEntry[] },
): Partial<ItemGroupEntry> {
	const {
		from: _from,
		item: _item,
		variant: _variant,
		...properties
	} = entry;

	return properties;
}

/**
 * Extract template properties from a group, excluding ID and entries.
 */
function extractGroupTemplateProperties(group: ItemGroup): Partial<ItemGroup> {
	const { id: _id, entries: _entries, ...properties } = group;

	return properties;
}

export default ITEM_GROUP_VARIANTS_TRANSFORMER;
