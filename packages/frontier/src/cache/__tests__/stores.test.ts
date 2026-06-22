/**
 * @file Tests for ObjectStore trusted reads: synchronous, no stat validation, miss on absent entries.
 */

import { describe, expect, test } from "bun:test";
import { Cache } from "@frmds/frontier";
import type { CanonicalPath } from "@frmds/frontier";

/**
 * A fixed canonical file key used as the store's cache key under test.
 */
const FILE = "/mods/dda/items.json" as CanonicalPath;

describe("ObjectStore.getObjectsTrusted", () => {
	test("returns cached objects without validation", async () => {
		const cache = new Cache({ persistent: false });
		const store = cache.objects<{ id: string }>("objects");

		await store.setObjects(FILE, [{ id: "alpha" }]);

		expect(store.getObjectsTrusted(FILE)).toEqual([{ id: "alpha" }]);
	});

	test("returns empty for an absent entry", () => {
		const cache = new Cache({ persistent: false });
		const store = cache.objects<{ id: string }>("objects");

		expect(store.getObjectsTrusted(FILE)).toEqual([]);
	});
});
