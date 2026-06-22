/**
 * @file Tests generic dependency-candidate resolution: typed candidates to the first scope match, typeless ones to every same-id match.
 */

import { describe, expect, test } from "bun:test";
import { makeKey, type ModScope } from "@frmds/frontier";
import {
	buildIdIndex,
	resolveCandidate,
	resolveScopedKey,
} from "../resolve.ts";

/**
 * Lookup scope: the mod first, then the base game it depends on.
 */
const SCOPE = ["armory", "dda"] as ModScope;

describe("resolveCandidate", () => {
	test("resolves a typeless candidate across object types via the id index", () => {
		const child = makeKey("placard/tempest", "ITEM", "armory");
		const target = makeKey("@pockets", "PARTIAL", "armory");
		const available = new Set([child, target]);

		expect(
			resolveCandidate(
				makeKey("@pockets", undefined, "armory"),
				SCOPE,
				available,
				buildIdIndex(available),
				child,
			),
		).toEqual([target]);
	});

	test("a typeless candidate for the object's own id resolves to siblings, not itself", () => {
		const child = makeKey("dual/name", "ITEM", "armory");
		const sibling = makeKey("dual/name", "item_group", "armory");
		const available = new Set([child, sibling]);

		expect(
			resolveCandidate(
				makeKey("dual/name", undefined, "armory"),
				SCOPE,
				available,
				buildIdIndex(available),
				child,
			),
		).toEqual([sibling]);
	});

	test("resolves a typeless candidate to a dependency mod (cross-mod)", () => {
		const child = makeKey("vest", "ITEM", "armory");
		const base = makeKey("base", "ITEM", "dda");
		const available = new Set([child, base]);

		expect(
			resolveCandidate(
				makeKey("base", undefined, "armory"),
				SCOPE,
				available,
				buildIdIndex(available),
				child,
			),
		).toEqual([base]);
	});

	test("resolves a typed candidate to a dependency mod (cross-mod)", () => {
		const child = makeKey("vest", "ITEM", "armory");
		const base = makeKey("base", "ITEM", "dda");
		const available = new Set([child, base]);

		expect(
			resolveCandidate(
				makeKey("base", "ITEM", "armory"),
				SCOPE,
				available,
				buildIdIndex(available),
				child,
			),
		).toEqual([base]);
	});

	test("a typeless candidate matching multiple types depends on all of them", () => {
		const child = makeKey("seed", "ITEM", "armory");
		const item = makeKey("shared", "ITEM", "armory");
		const group = makeKey("shared", "item_group", "dda");
		const available = new Set([child, item, group]);

		const resolved = resolveCandidate(
			makeKey("shared", undefined, "armory"),
			SCOPE,
			available,
			buildIdIndex(available),
			child,
		);

		expect(new Set(resolved)).toEqual(new Set([item, group]));
	});

	test("a candidate with no match resolves to nothing", () => {
		const child = makeKey("vest", "ITEM", "armory");
		const available = new Set([child]);

		expect(
			resolveCandidate(
				makeKey("ghost", undefined, "armory"),
				SCOPE,
				available,
				buildIdIndex(available),
				child,
			),
		).toEqual([]);
	});
});

describe("resolveScopedKey", () => {
	test("finds the first scope match while excluding the declaring key (same-id hoisting)", () => {
		const child = makeKey("shared", "ITEM", "armory");
		const base = makeKey("shared", "ITEM", "dda");
		const available = new Set([child, base]);

		expect(
			resolveScopedKey("shared", "ITEM", SCOPE, available, child),
		).toBe(base);
	});
});
