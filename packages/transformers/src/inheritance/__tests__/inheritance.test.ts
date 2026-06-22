/**
 * @file inheritance tests: same-id hoisting (mirrors `copy-from`), spec normalization, and the inherited-property patches.
 */

import { describe, expect, test } from "bun:test";
import { createObjectsView, type TransformContext } from "@frmds/autodoc";
import {
	ModWorkspace,
	type CanonicalPath,
	type GameObject,
	type ModScope,
} from "@frmds/frontier";
import {
	fetchParent,
	normalizeInheritSpecs,
	resolveInheritance,
} from "../engine.ts";
import type { ResolvedInheritTarget } from "../types.ts";

/** Source path stamped onto loaded objects and the transform context. */
const FILE = "/mod/itemgroups.json5" as CanonicalPath;
/** Lookup scope: the mod first, then the base game it depends on. */
const SCOPE = ["armory", "dda"] as ModScope;

/** Build a transform context for a child object reading the given store view. */
function contextFor(
	child: GameObject,
	objects: TransformContext["objects"],
): TransformContext {
	return {
		sourcePath: FILE,
		modId: "armory",
		currentObject: child,
		objects,
		scope: SCOPE,
		propertyPath: ["inherit"],
	};
}

describe("fetchParent", () => {
	test("a same-ID inherit hoists to the base-game parent when the mod's own object loads first", () => {
		const workspace = new ModWorkspace();

		workspace.load(
			{ id: "bags_unisex", type: "item_group", inherit: "bags_unisex" },
			"armory",
			FILE,
		);
		workspace.load(
			{
				id: "bags_unisex",
				type: "item_group",
				items: [{ item: "backpack" }],
			},
			"dda",
			FILE,
		);

		const objects = createObjectsView(workspace, SCOPE);

		const child: GameObject = {
			id: "bags_unisex",
			type: "item_group",
			inherit: "bags_unisex",
		};

		const spec: ResolvedInheritTarget = { id: "bags_unisex", scope: SCOPE };

		const parent = fetchParent(
			spec,
			objects,
			child,
			contextFor(child, objects),
		);

		expect(parent.items).toEqual([{ item: "backpack" }]);
	});

	test("a cross-ID inherit resolves locally and is not hoisted", () => {
		const workspace = new ModWorkspace();

		workspace.load(
			{ id: "@chassis", type: "ITEM", source: "armory" },
			"armory",
			FILE,
		);
		workspace.load(
			{ id: "@chassis", type: "ITEM", source: "dda" },
			"dda",
			FILE,
		);

		const objects = createObjectsView(workspace, SCOPE);

		const child: GameObject = {
			id: "vest",
			type: "ITEM",
			inherit: "@chassis",
		};

		const spec: ResolvedInheritTarget = { id: "@chassis", scope: SCOPE };

		const parent = fetchParent(
			spec,
			objects,
			child,
			contextFor(child, objects),
		);

		expect(parent.source).toBe("armory");
	});
});

describe("normalizeInheritSpecs", () => {
	test("a bare id inherits at the current scope", () => {
		expect(normalizeInheritSpecs("chassis", SCOPE)).toEqual([
			{ id: "chassis", scope: SCOPE },
		]);
	});

	test("a spec object keeps its type and narrows scope when given", () => {
		expect(
			normalizeInheritSpecs(
				{ id: "chassis", type: "ITEM", scope: "dda" },
				SCOPE,
			),
		).toEqual([{ id: "chassis", type: "ITEM", scope: ["dda"] }]);
	});

	test("an array normalizes every entry", () => {
		expect(normalizeInheritSpecs(["a", { id: "b" }], SCOPE)).toEqual([
			{ id: "a", scope: SCOPE },
			{ id: "b", type: undefined, scope: SCOPE },
		]);
	});
});

describe("resolveInheritance", () => {
	test("inserts parent props the child lacks and drops the directive", () => {
		const workspace = new ModWorkspace();

		workspace.load(
			{ id: "chassis", type: "ITEM", material: "cotton", weight: "1 kg" },
			"armory",
			FILE,
		);

		const objects = createObjectsView(workspace, SCOPE);

		const child: GameObject = {
			id: "vest",
			type: "ITEM",
			inherit: "chassis",
		};

		const patches = resolveInheritance(
			"chassis",
			contextFor(child, objects),
		);

		expect(patches).toEqual([
			{ op: "insert", path: ["..", "material"], value: "cotton" },
			{ op: "insert", path: ["..", "weight"], value: "1 kg" },
			{ op: "remove", path: [] },
		]);
	});
});
