/**
 * @file Unit tests for the namespace-prefix param registry.
 */

import { test, expect } from "bun:test";
import { paramForKey, PARAMS } from "../params.ts";

test("registry exposes the game.path namespace", () => {
	expect(PARAMS["game.path"]).toBeDefined();
	expect(PARAMS["game.path"].namespace).toBe("game.path");
});

test("paramForKey resolves a hashed key to the game.path param via prefix", () => {
	const param = paramForKey(
		"game.path.27939e29b8b4ddc081490d9f51de59a459c88df6",
	);

	expect(param).toBe(PARAMS["game.path"]);
});

test("paramForKey returns undefined for an unknown namespace", () => {
	expect(paramForKey("bogus")).toBeUndefined();
});

test("game.path param normalizes a path without checking existence", () => {
	const raw =
		process.platform === "win32" ? "C:\\Games\\CDDA" : "/Games\\CDDA";
	const normalized =
		process.platform === "win32" ? "C:/Games/CDDA" : "/Games/CDDA";

	expect(PARAMS["game.path"].parse(raw)).toBe(normalized);
});
