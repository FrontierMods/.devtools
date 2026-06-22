/**
 * @file Runtime behavior of target enumeration.
 */

import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { toCanonicalPath } from "@frmds/frontier";
import { discoverTargets } from "../discover.ts";

/**
 * A throwaway tree with a `.json`, a `.json5` to skip, and a nested `.json`.
 */
function tempTree(): string {
	const root = mkdtempSync(path.join(tmpdir(), "format-targets-"));

	writeFileSync(path.join(root, "a.json"), "{}");
	writeFileSync(path.join(root, "skip.json5"), "{}");
	mkdirSync(path.join(root, "nested"));
	writeFileSync(path.join(root, "nested", "b.json"), "{}");

	return root;
}

test("discoverTargets returns a single .json file as itself", async () => {
	const root = tempTree();
	const file = path.join(root, "a.json");

	expect(await discoverTargets(file)).toEqual([toCanonicalPath(file)]);
});

test("discoverTargets ignores a single non-.json file", async () => {
	const root = tempTree();

	expect(await discoverTargets(path.join(root, "skip.json5"))).toEqual([]);
});

test("discoverTargets recurses a directory for .json only", async () => {
	const root = tempTree();

	const found = await discoverTargets(root);

	expect(found.sort()).toEqual(
		[
			toCanonicalPath(path.join(root, "a.json")),
			toCanonicalPath(path.join(root, "nested", "b.json")),
		].sort(),
	);
});
