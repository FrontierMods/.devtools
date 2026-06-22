/**
 * @file Tests for the read-only anchored store view.
 */

import { describe, expect, test } from "bun:test";
import { type CanonicalPath, makeKey, ModWorkspace } from "@frmds/frontier";
import { createObjectsView } from "../store-view.ts";

/**
 * Path of the sample source file.
 */
const FILE = "/mod/a.json5" as CanonicalPath;

describe("anchored reads", () => {
	test("raw returns the as-authored snapshot without finalizing", () => {
		const workspace = new ModWorkspace();

		workspace.load(
			{ id: "cube", type: "ITEM", volume: "1 L" },
			"my_mod",
			FILE,
		);

		const view = createObjectsView(workspace, ["my_mod"]);
		const raw = view.get("cube", "ITEM", undefined, { at: "raw" });

		expect(raw?.longest_side).toBeUndefined();
		expect(workspace.isComplete(makeKey("cube", "ITEM", "my_mod"))).toBe(
			false,
		);
	});

	test("runtime finalizes lazily on first read", () => {
		const workspace = new ModWorkspace();

		workspace.load(
			{ id: "cube", type: "ITEM", volume: "1 L" },
			"my_mod",
			FILE,
		);

		const view = createObjectsView(workspace, ["my_mod"]);
		const runtime = view.get("cube", "ITEM");

		expect(runtime?.longest_side).toBeDefined();
		expect(workspace.isComplete(makeKey("cube", "ITEM", "my_mod"))).toBe(
			true,
		);
	});

	test("unknown objects return undefined", () => {
		const view = createObjectsView(new ModWorkspace(), ["my_mod"]);

		expect(view.get("ghost", "ITEM")).toBeUndefined();
	});
});
