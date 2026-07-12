/**
 * @file Tests for the shared object index: cold rebuild, freshness, completeness contract, v1 purge, and read helpers.
 */

import { afterEach, describe, expect, test } from "bun:test";
import fs from "fs-extra";
import os from "os";
import path from "path";
import {
	Cache,
	OBJECT_INDEX_VERSION,
	ensureObjectIndex,
	findOwningFiles,
	listIndexKeys,
	readIndexedObjects,
	readObjectIndexMeta,
} from "@frmds/frontier";
import type { CanonicalPath } from "@frmds/frontier";

/**
 * Temp directories created per test, removed afterwards.
 */
const TEMP_DIRS: string[] = [];

/**
 * Creates a temp game-content fixture with two JSON files, plus its cache.
 *
 * @returns The fixture's cache, file list, and content directory.
 */
function makeFixture(): {
	cache: Cache;
	files: CanonicalPath[];
	directory: string;
} {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), "object-index-"));

	TEMP_DIRS.push(directory);

	const items = path.join(directory, "items.json") as CanonicalPath;
	const recipes = path.join(directory, "recipes.json") as CanonicalPath;

	// * the fixture exercises the full alias ruleset at runtime: array aliases, whitespace trimming, malformed values, missing IDs
	fs.writeFileSync(
		items,
		JSON.stringify([
			{ type: "GENERIC", id: "wooden_grip" },
			{ type: "overmap_terrain", id: ["field", " meadow "] },
			{ type: "MIGRATION", id: "legacy_item" },
			{ type: "GENERIC", id: [7, "", "  "] },
			{ type: "colordef" },
		]),
	);
	fs.writeFileSync(
		recipes,
		JSON.stringify([{ type: "recipe", result: "wooden_grip" }]),
	);

	return {
		cache: new Cache({ path: directory }),
		files: [items, recipes],
		directory,
	};
}

afterEach(async () => {
	for (const dir of TEMP_DIRS.splice(0)) await fs.remove(dir);
});

describe("ensureObjectIndex", () => {
	test("cold rebuild writes index, objects, and meta", async () => {
		const { cache, files } = makeFixture();

		expect(await ensureObjectIndex(cache, files)).toBe("rebuilt");

		const meta = readObjectIndexMeta(cache);

		expect(meta?.version).toBe(OBJECT_INDEX_VERSION);
		expect(meta?.files).toEqual(files);

		// completeness contract: the objects store is populated too
		for (const file of files)
			expect(readIndexedObjects(cache, file).length).toBeGreaterThan(0);

		await cache.close();
	});

	test("stays fresh across a cache reopen", async () => {
		const { cache, files, directory } = makeFixture();

		await ensureObjectIndex(cache, files);
		await cache.close();

		// * a fresh Cache instance simulates the next CLI invocation and catches unflushed writes
		const reopened = new Cache({ path: directory });

		expect(await ensureObjectIndex(reopened, files)).toBe("fresh");

		await reopened.close();
	});

	test("a changed file triggers a rebuild", async () => {
		const { cache, files, directory } = makeFixture();

		await ensureObjectIndex(cache, files);

		// mtime resolution can swallow immediate rewrites, so change the size
		fs.writeFileSync(
			path.join(directory, "items.json"),
			JSON.stringify([{ type: "GENERIC", id: "wooden_grip", weight: 1 }]),
		);

		expect(await ensureObjectIndex(cache, files)).toBe("rebuilt");

		await cache.close();
	});

	test("rebuild purges stale v1 string keys", async () => {
		const { cache, files } = makeFixture();

		cache.kv<CanonicalPath[]>("object-id-index").set("stale_v1_id", []);

		await ensureObjectIndex(cache, files);

		const keys = listIndexKeys(cache);

		expect(keys.every((key) => Array.isArray(key))).toBe(true);
		expect(keys.some(([id]) => id === "stale_v1_id")).toBe(false);

		await cache.close();
	});
});

describe("index content", () => {
	test("indexes aliases trimmed, recipes by result, every type, and nothing else", async () => {
		const { cache, files } = makeFixture();

		await ensureObjectIndex(cache, files);

		const keys = listIndexKeys(cache);

		expect(keys).toContainEqual(["wooden_grip", "GENERIC"]);
		expect(keys).toContainEqual(["wooden_grip", "recipe"]);
		expect(keys).toContainEqual(["field", "overmap_terrain"]);
		expect(keys).toContainEqual(["meadow", "overmap_terrain"]);
		expect(keys).toContainEqual(["legacy_item", "MIGRATION"]);

		// * exactly these five: the malformed-ID and ID-less fixture objects must not surface
		expect(keys).toHaveLength(5);

		await cache.close();
	});

	test("findOwningFiles narrows by type or returns all types", async () => {
		const { cache, files } = makeFixture();

		await ensureObjectIndex(cache, files);

		const all = findOwningFiles(cache, "wooden_grip");
		const recipesOnly = findOwningFiles(cache, "wooden_grip", "recipe");

		expect(all.map((entry) => entry.type).sort()).toEqual([
			"GENERIC",
			"recipe",
		]);
		expect(recipesOnly).toHaveLength(1);
		expect(recipesOnly[0]?.files[0]).toContain("recipes.json");

		await cache.close();
	});
});
