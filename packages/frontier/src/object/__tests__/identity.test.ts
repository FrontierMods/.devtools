/**
 * @file Tests for identity keys: occurrence-qualified keys, decomposition, and matching.
 */

import { describe, expect, test } from "bun:test";
import { makeKey, matchesKey, readKey, resolveObjectID } from "../identity.ts";

describe("makeKey", () => {
	test("emits the plain key for the first occurrence", () => {
		expect(makeKey("sword", "ITEM", "mod")).toBe("mod:ITEM:sword");
		expect(makeKey("sword", "ITEM", "mod", 1)).toBe("mod:ITEM:sword");
	});

	test("appends the occurrence from the second occurrence on", () => {
		expect(makeKey("sword", "ITEM", "mod", 2)).toBe("mod:ITEM:sword:2");
		expect(makeKey("sword", "ITEM", "mod", 3)).toBe("mod:ITEM:sword:3");
	});

	test("escapes colons in the ID part of occurrence keys", () => {
		expect(makeKey("<nij:iii>", "snippet", "mod", 2)).toBe(
			"mod:snippet:<nij\\:iii>:2",
		);
	});
});

describe("readKey", () => {
	test("decomposes an occurrence key into four parts", () => {
		expect(readKey("mod:ITEM:sword:2")).toEqual([
			"mod",
			"ITEM",
			"sword",
			"2",
		]);
	});

	test("decomposes an escaped occurrence key", () => {
		expect(readKey("mod:snippet:<nij\\:iii>:2")).toEqual([
			"mod",
			"snippet",
			"<nij:iii>",
			"2",
		]);
	});
});

describe("matchesKey", () => {
	test("matches every occurrence of an ID", () => {
		const occurrenceKey = makeKey("<nij:iii>", "snippet", "mod", 2);

		expect(matchesKey(occurrenceKey, "<nij:iii>", "snippet", "mod")).toBe(
			true,
		);
		expect(matchesKey(occurrenceKey, "<nij:iv>", "snippet", "mod")).toBe(
			false,
		);
	});
});

describe("resolveObjectID", () => {
	test("resolves a snippet by category", () => {
		expect(
			resolveObjectID({ type: "snippet", category: "<nij:iii>" }),
		).toEqual({ id: "<nij:iii>", property: "category" });
	});

	test("id outranks category", () => {
		expect(
			resolveObjectID({ type: "snippet", id: "note", category: "<x>" }),
		).toEqual({ id: "note", property: "id" });
	});

	test("result outranks category on recipes", () => {
		expect(
			resolveObjectID({
				type: "recipe",
				result: "sword",
				category: "CC_WEAPON",
			}),
		).toEqual({ id: "sword", property: "result" });
	});
});
