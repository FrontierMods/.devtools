/** @file Tests the item-group-variants transformer: the `from` gate and template expansion into per-variant groups. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import type { JSONValue, Patch } from "@frmds/frontier";
import { Compile } from "typebox/compile";
import ITEM_GROUP_VARIANTS_TRANSFORMER from "../transformer.ts";

/** Compiled content gate the transformer uses to admit candidate groups. */
const GATE = Compile(ITEM_GROUP_VARIANTS_TRANSFORMER.target.content);

/** A source item carrying two variants, used as the expansion source. */
const ITEM_WITH_VARIANTS = {
	type: "ITEM",
	id: "vest",
	variants: [{ id: "multicam" }, { id: "black" }],
};

/** A context whose object store returns `item` for any lookup. */
function contextWith(item: JSONValue): TransformContext {
	return {
		sourcePath: "/mod/src/itemgroups.json5",
		scope: ["test_mod"],
		objects: { get: () => item },
	} as unknown as TransformContext;
}

describe("expandItemGroupVariants", () => {
	test("gate admits a group with a from-entry, rejects one without", () => {
		expect(
			GATE.Check({
				type: "item_group",
				id: "g",
				entries: [{ item: "vest", from: ["multicam"] }],
			}),
		).toBe(true);

		expect(
			GATE.Check({
				type: "item_group",
				id: "g",
				entries: [{ item: "vest" }],
			}),
		).toBe(false);
	});

	test("expands to an :any group plus one group per variant, then removes the template", () => {
		const group = {
			type: "item_group",
			id: "vest",
			subtype: "collection",
			entries: [{ item: "vest", from: ["multicam", "black"] }],
		};

		const patches = ITEM_GROUP_VARIANTS_TRANSFORMER.transform(
			group,
			contextWith(ITEM_WITH_VARIANTS),
		) as Patch[];

		const pushedIds = patches
			.filter((patch) => patch.op === "push")
			.map((patch) => (patch.value as { id: string }).id);

		expect(pushedIds).toEqual(["vest:any", "vest:multicam", "vest:black"]);
		expect(patches.at(-1)).toEqual({ op: "remove", path: [] });
	});

	test("throws when the referenced item lacks a required variant", () => {
		const group = {
			type: "item_group",
			id: "vest",
			entries: [{ item: "vest", from: ["coyote"] }],
		};

		expect(() =>
			ITEM_GROUP_VARIANTS_TRANSFORMER.transform(
				group,
				contextWith(ITEM_WITH_VARIANTS),
			),
		).toThrow("coyote");
	});
});
