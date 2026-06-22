/**
 * @file Tests for ModWorkspace structure: loading with duplicate policy, lookup, projections, positions.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath } from "../../types/data.ts";
import type { CompoundKey } from "../types.ts";
import { makeKey } from "../identity.ts";
import { ModWorkspace } from "../workspace.ts";

/**
 * First fixture file path the workspace tests load objects into.
 */
const FILE_A = "/mod/src/a.json5" as CanonicalPath;

/**
 * Second fixture file path, used to exercise cross-file duplicate handling.
 */
const FILE_B = "/mod/src/b.json5" as CanonicalPath;

/**
 * Builds a workspace preloaded with one sword item, the common starting state.
 */
function workspaceWithSword(): ModWorkspace {
	const workspace = new ModWorkspace();

	workspace.load({ type: "ITEM", id: "sword", price: 10 }, "mod", FILE_A);

	return workspace;
}

describe("load", () => {
	test("registers the object in its file document and the index", () => {
		const workspace = workspaceWithSword();

		expect(workspace.liveProjection("mod", FILE_A)).toEqual([
			{ type: "ITEM", id: "sword", price: 10 },
		]);
		expect(workspace.fileOf(makeKey("sword", "ITEM", "mod"))).toBe(FILE_A);
	});

	test("identical duplicate in another file is dropped", () => {
		const workspace = workspaceWithSword();

		workspace.load({ type: "ITEM", id: "sword", price: 10 }, "mod", FILE_B);

		expect(workspace.liveProjection("mod", FILE_B)).toEqual([]);
		expect(workspace.fileOf(makeKey("sword", "ITEM", "mod"))).toBe(FILE_A);
	});

	test("conflicting same-mod duplicate throws", () => {
		const workspace = workspaceWithSword();

		expect(() =>
			workspace.load(
				{ type: "ITEM", id: "sword", price: 99 },
				"mod",
				FILE_B,
			),
		).toThrow(/Duplicate object/);
	});
});

describe("lookup", () => {
	test("get reads raw and runtime anchors", () => {
		const workspace = workspaceWithSword();

		expect(workspace.get("sword", "ITEM", ["mod"], "raw")).toEqual({
			type: "ITEM",
			id: "sword",
			price: 10,
		});
		expect(workspace.get("sword", "ITEM", ["mod"])).toEqual({
			type: "ITEM",
			id: "sword",
			price: 10,
		});
	});

	test("find respects scope order", () => {
		const workspace = workspaceWithSword();

		workspace.load({ type: "ITEM", id: "sword", price: 50 }, "dda", FILE_B);

		expect(workspace.find("sword", "ITEM", ["mod", "dda"])?.key).toBe(
			makeKey("sword", "ITEM", "mod"),
		);
		expect(workspace.find("sword", "ITEM", ["dda"])?.key).toBe(
			makeKey("sword", "ITEM", "dda"),
		);
	});

	test("positionOf returns the live position within the file", () => {
		const workspace = workspaceWithSword();

		workspace.load({ type: "ITEM", id: "shield" }, "mod", FILE_A);

		expect(workspace.positionOf(makeKey("shield", "ITEM", "mod"))).toBe(1);
	});

	test("entries iterates live objects with keys", () => {
		const workspace = workspaceWithSword();

		const all = Array.from(workspace.entries());

		expect(all).toEqual([
			[
				makeKey("sword", "ITEM", "mod"),
				{ type: "ITEM", id: "sword", price: 10 },
			],
		]);
	});
});

describe("completeness", () => {
	test("markComplete and isComplete track finalized keys", () => {
		const workspace = workspaceWithSword();
		const key = makeKey("sword", "ITEM", "mod");

		expect(workspace.isComplete(key)).toBe(false);

		workspace.markComplete(key);

		expect(workspace.isComplete(key)).toBe(true);
	});
});

describe("apply", () => {
	function appliedWorkspace(): {
		workspace: ModWorkspace;
		swordKey: CompoundKey;
	} {
		const workspace = new ModWorkspace();

		workspace.load({ type: "ITEM", id: "sword", price: 10 }, "mod", FILE_A);
		workspace.load({ type: "ITEM", id: "shield", price: 5 }, "mod", FILE_A);

		return { workspace, swordKey: makeKey("sword", "ITEM", "mod") };
	}

	test("self patches append one entry and update the projection", () => {
		const { workspace, swordKey } = appliedWorkspace();

		const result = workspace.apply(
			[{ op: "replace", path: ["0", "price"], value: 20 }],
			{ modId: "mod", file: FILE_A },
			"price",
			swordKey,
		);

		expect(result.selfPatches).toEqual([
			{ op: "replace", path: ["price"], value: 20 },
		]);
		expect(workspace.liveProjection("mod", FILE_A)[0]).toEqual({
			type: "ITEM",
			id: "sword",
			price: 20,
		});
		expect(workspace.timeline(swordKey)!.entries).toHaveLength(2);
	});

	test("push creates a timeline with genesis origin and reports the key", () => {
		const { workspace, swordKey } = appliedWorkspace();

		const result = workspace.apply(
			[{ op: "push", path: [], value: { type: "ITEM", id: "dagger" } }],
			{ modId: "mod", file: FILE_A },
			"splitter",
			swordKey,
		);

		const daggerKey = makeKey("dagger", "ITEM", "mod");

		expect(result.created).toEqual([daggerKey]);
		expect(workspace.timeline(daggerKey)!.entries[0]!.source).toEqual({
			via: "splitter",
			origin: { key: swordKey, entry: 0 },
		});
		expect(workspace.liveProjection("mod", FILE_A)).toHaveLength(3);
	});

	test("self patches before a push land in an entry the genesis points at", () => {
		const { workspace, swordKey } = appliedWorkspace();

		workspace.apply(
			[
				{ op: "replace", path: ["0", "price"], value: 30 },
				{ op: "push", path: [], value: { type: "ITEM", id: "dagger" } },
			],
			{ modId: "mod", file: FILE_A },
			"splitter",
			swordKey,
		);

		const sword = workspace.timeline(swordKey)!;
		const dagger = workspace.timeline(makeKey("dagger", "ITEM", "mod"))!;

		expect(sword.entries).toHaveLength(2);
		expect(dagger.entries[0]!.source.origin).toEqual({
			key: swordKey,
			entry: 1,
		});
	});

	test("depth-1 remove tombstones and shifts live positions", () => {
		const { workspace, swordKey } = appliedWorkspace();

		const result = workspace.apply(
			[{ op: "remove", path: ["0"] }],
			{ modId: "mod", file: FILE_A },
			"remover",
			swordKey,
		);

		expect(result.tombstonedSelf).toBe(true);
		expect(workspace.liveProjection("mod", FILE_A)).toEqual([
			{ type: "ITEM", id: "shield", price: 5 },
		]);
		expect(workspace.positionOf(makeKey("shield", "ITEM", "mod"))).toBe(0);
	});

	test("sibling write appends to the sibling with origin attribution", () => {
		const { workspace, swordKey } = appliedWorkspace();

		workspace.apply(
			[{ op: "replace", path: ["1", "price"], value: 7 }],
			{ modId: "mod", file: FILE_A },
			"priceFixer",
			swordKey,
		);

		const shield = workspace.timeline(makeKey("shield", "ITEM", "mod"))!;

		expect(shield.entries).toHaveLength(2);
		expect(shield.entries[1]!.source).toEqual({
			via: "priceFixer",
			origin: { key: swordKey, entry: 0 },
		});
		expect(workspace.liveProjection("mod", FILE_A)[1]!.price).toBe(7);
	});

	test("creating a live key collides; re-creating a tombstoned key succeeds", () => {
		const { workspace, swordKey } = appliedWorkspace();

		expect(() =>
			workspace.apply(
				[
					{
						op: "push",
						path: [],
						value: { type: "ITEM", id: "shield" },
					},
				],
				{ modId: "mod", file: FILE_A },
				"cloner",
				swordKey,
			),
		).toThrow(/already exists/);

		workspace.apply(
			[{ op: "remove", path: ["1"] }],
			{ modId: "mod", file: FILE_A },
			"remover",
			swordKey,
		);

		const result = workspace.apply(
			[
				{
					op: "push",
					path: [],
					value: { type: "ITEM", id: "shield", mk: 2 },
				},
			],
			{ modId: "mod", file: FILE_A },
			"recreator",
			swordKey,
		);

		expect(result.created).toEqual([makeKey("shield", "ITEM", "mod")]);
		expect(workspace.get("shield", "ITEM", ["mod"], "raw")).toEqual({
			type: "ITEM",
			id: "shield",
			mk: 2,
		});
	});
});
