/**
 * @file Tests for enrichment steps.
 */

import { describe, expect, test } from "bun:test";
import {
	type CanonicalPath,
	type GameObject,
	makeKey,
	ModWorkspace,
	timelineCurrent,
} from "@frmds/frontier";
import { finalize } from "../enrichment.ts";

/**
 * Single-mod scope used by the tests.
 */
const SCOPE = ["my_mod"] as const;

/**
 * Path of the sample source file.
 */
const FILE = "/mod/items.json5" as CanonicalPath;

/**
 * Builds a workspace preloaded with the given objects.
 *
 * @param objects - Objects to load into the workspace.
 * @returns The seeded workspace.
 */
function workspaceWith(...objects: GameObject[]): ModWorkspace {
	const workspace = new ModWorkspace();

	for (const object of objects) workspace.load(object, "my_mod", FILE);

	return workspace;
}

describe("compose", () => {
	test("merges the copy-from parent's runtime view, child props win", () => {
		const workspace = workspaceWith(
			{ id: "base", type: "ITEM", weight: "1 kg", volume: "1 L" },
			{ id: "child", type: "ITEM", "copy-from": "base", weight: "2 kg" },
		);

		const key = makeKey("child", "ITEM", "my_mod");

		const runtime = finalize(workspace, key, [...SCOPE]);

		expect(runtime?.weight).toBe("2 kg");
		expect(runtime?.volume).toBe("1 L");
		expect(workspace.isComplete(key)).toBe(true);
	});

	test("composes transitive parent chains (parent finalized recursively)", () => {
		const workspace = workspaceWith(
			{ id: "grandparent", type: "ITEM", material: "steel" },
			{
				id: "parent",
				type: "ITEM",
				"copy-from": "grandparent",
				weight: "1 kg",
			},
			{ id: "child", type: "ITEM", "copy-from": "parent" },
		);

		const runtime = finalize(
			workspace,
			makeKey("child", "ITEM", "my_mod"),
			[...SCOPE],
		);

		expect(runtime?.material).toBe("steel");
		expect(runtime?.weight).toBe("1 kg");
	});

	test("missing parent throws with the composition chain", () => {
		const workspace = workspaceWith({
			id: "child",
			type: "ITEM",
			"copy-from": "ghost",
		});

		expect(() =>
			finalize(workspace, makeKey("child", "ITEM", "my_mod"), [...SCOPE]),
		).toThrow(/ghost/);
	});

	test("copy-from cycles throw instead of recursing forever", () => {
		const workspace = workspaceWith(
			{ id: "a", type: "ITEM", "copy-from": "b" },
			{ id: "b", type: "ITEM", "copy-from": "a" },
		);

		expect(() =>
			finalize(workspace, makeKey("a", "ITEM", "my_mod"), [...SCOPE]),
		).toThrow(/circular/i);
	});
});

describe("derive", () => {
	test("adds longest_side from volume when absent", () => {
		const workspace = workspaceWith({
			id: "cube",
			type: "ITEM",
			volume: "1 L",
		});

		const key = makeKey("cube", "ITEM", "my_mod");

		const runtime = finalize(workspace, key, [...SCOPE]);

		expect(runtime?.longest_side).toBe("10 cm");
	});

	test("does not override an explicit longest_side", () => {
		const workspace = workspaceWith({
			id: "rod",
			type: "ITEM",
			volume: "1 L",
			longest_side: "500 mm",
		});

		const runtime = finalize(workspace, makeKey("rod", "ITEM", "my_mod"), [
			...SCOPE,
		]);

		expect(runtime?.longest_side).toBe("500 mm");
	});

	test("derived properties never reach the serialization projection", () => {
		const workspace = workspaceWith({
			id: "cube",
			type: "ITEM",
			volume: "1 L",
		});

		const key = makeKey("cube", "ITEM", "my_mod");

		finalize(workspace, key, [...SCOPE]);

		expect(
			timelineCurrent(workspace.timeline(key)!)?.longest_side,
		).toBeUndefined();
	});
});

describe("idempotence", () => {
	test("finalizing twice appends enrichment steps once", () => {
		const workspace = workspaceWith({
			id: "cube",
			type: "ITEM",
			volume: "1 L",
		});

		const key = makeKey("cube", "ITEM", "my_mod");

		finalize(workspace, key, [...SCOPE]);

		const entryCount = workspace.timeline(key)!.entries.length;

		finalize(workspace, key, [...SCOPE]);

		expect(workspace.timeline(key)!.entries.length).toBe(entryCount);
	});
});
