/**
 * @file Tests for the LMDB backend's write buffering: read-your-writes, write ordering, and durability across a cache reopen.
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
 * Creates a fresh temp directory for an LMDB-backed cache.
 *
 * @returns The directory path.
 */
function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-buffer-"));

	TEMP_DIRS.push(dir);

	return dir;
}

afterEach(async () => {
	for (const dir of TEMP_DIRS.splice(0)) await fs.remove(dir);
});

describe("LMDB write buffering", () => {
	test("a write is readable immediately through every read path", () => {
		const store = new Cache({ path: makeTempDir() }).kv<number>("buffer");

		store.set(["grip", "GENERIC"], 1);

		expect(store.get(["grip", "GENERIC"])).toBe(1);

		store.set(["grip", "recipe"], 2);

		expect([...store.entries()]).toHaveLength(2);

		store.set(["grip", "TOOL"], 3);

		expect([...store.prefixEntries(["grip"])]).toHaveLength(3);
	});

	test("writes to one key apply in order", () => {
		const store = new Cache({ path: makeTempDir() }).kv<number>("buffer");

		store.set("added", 1);
		store.delete("added");

		expect(store.get("added")).toBeUndefined();

		store.delete("revived");
		store.set("revived", 2);

		expect(store.get("revived")).toBe(2);

		store.set("overwritten", 1);
		store.set("overwritten", 2);
		store.set("overwritten", 3);

		expect(store.get("overwritten")).toBe(3);
	});

	test("clear drops buffered writes with the stored ones", () => {
		const store = new Cache({ path: makeTempDir() }).kv<number>("buffer");

		store.set("stored", 1);
		store.get("stored");
		store.set("buffered", 2);

		store.clear();

		expect(store.get("stored")).toBeUndefined();
		expect(store.get("buffered")).toBeUndefined();
	});

	test("close commits buffered writes durably", async () => {
		const dir = makeTempDir();
		const cache = new Cache({ path: dir });

		// * never read after this write, so only the close-time flush can persist it
		cache.kv<string>("buffer").set("pending", "kept");

		await cache.close();

		const reopened = new Cache({ path: dir });

		expect(reopened.kv<string>("buffer").get("pending")).toBe("kept");

		await reopened.close();
	});
});
