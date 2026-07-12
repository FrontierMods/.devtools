/**
 * @file Tests for composite KV keys: array-key roundtrips, iteration, prefix ranges, and non-ASCII key decode on the LMDB backend.
 */

import { afterEach, describe, expect, test } from "bun:test";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { Cache } from "@frmds/frontier";

/**
 * Temp directories created per test, removed afterwards.
 */
const TEMP_DIRS: string[] = [];

/**
 * Creates an LMDB-backed cache in a fresh temp directory.
 *
 * @returns The persistent cache under test.
 */
function makePersistentCache(): Cache {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kv-composite-"));

	TEMP_DIRS.push(dir);

	return new Cache({ path: dir });
}

afterEach(async () => {
	for (const dir of TEMP_DIRS.splice(0)) await fs.remove(dir);
});

for (const [label, makeCache] of [
	["memory", (): Cache => new Cache({ persistent: false })],
	["lmdb", makePersistentCache],
] as const) {
	describe(`KVStore composite keys (${label})`, () => {
		test("array keys roundtrip", () => {
			const store = makeCache().kv<string[]>("index");

			store.set(["wooden_grip", "GENERIC"], ["/a.json"]);

			expect(store.get(["wooden_grip", "GENERIC"])).toEqual(["/a.json"]);
			expect(store.get(["wooden_grip", "recipe"])).toBeUndefined();
		});

		test("entries iterates every key", () => {
			const store = makeCache().kv<number>("index");

			store.set(["alpha", "TOOL"], 1);
			store.set(["beta", "recipe"], 2);
			store.set("plain", 3);

			const keys = [...store.entries()].map(([key]) => key);

			expect(keys).toHaveLength(3);
			expect(keys).toContainEqual(["alpha", "TOOL"]);
			expect(keys).toContainEqual(["beta", "recipe"]);
			expect(keys).toContainEqual("plain");
		});

		test("prefixEntries returns only matching array keys", () => {
			const store = makeCache().kv<number>("index");

			store.set(["grip", "GENERIC"], 1);
			store.set(["grip", "recipe"], 2);
			store.set(["grippy", "GENERIC"], 3);

			const keys = [...store.prefixEntries(["grip"])].map(([key]) => key);

			expect(keys).toHaveLength(2);
			expect(keys).toContainEqual(["grip", "GENERIC"]);
			expect(keys).toContainEqual(["grip", "recipe"]);
		});

		test("non-ASCII keys survive iteration", () => {
			const store = makeCache().kv<number>("index");

			store.set(["tÖttchen", "COMESTIBLE"], 1);

			const keys = [...store.entries()].map(([key]) => key);

			expect(keys).toContainEqual(["tÖttchen", "COMESTIBLE"]);
		});

		test("clear empties the namespace without touching siblings", () => {
			const cache = makeCache();
			const store = cache.kv<number>("index");
			const sibling = cache.kv<number>("other");

			store.set(["alpha", "TOOL"], 1);
			sibling.set(["alpha", "TOOL"], 2);

			store.clear();

			expect([...store.entries()]).toHaveLength(0);
			expect(sibling.get(["alpha", "TOOL"])).toBe(2);
		});
	});
}
