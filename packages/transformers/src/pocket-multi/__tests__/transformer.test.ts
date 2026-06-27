/** @file pocket-multi transform test: a pocket with `multi` is replaced by that many `multi`-free copies. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import { Compile } from "typebox/compile";
import POCKET_MULTI_TRANSFORMER from "../transformer.ts";

/** The transform reads nothing from context. */
const CONTEXT = {} as TransformContext;

describe("multiplyPockets", () => {
	test("gate matches a pocket with `multi` but not a bare `multi` directive payload", () => {
		const gate = Compile(POCKET_MULTI_TRANSFORMER.target.content);

		expect(gate.Check({ pocket_type: "CONTAINER", multi: 3 })).toBe(true);
		expect(gate.Check({ multi: 3 })).toBe(false);
	});

	test("replaces the pocket with `multi` cleaned copies", () => {
		const patches = POCKET_MULTI_TRANSFORMER.transform(
			{ description: "Pouch", pocket_type: "CONTAINER", multi: 3 },
			CONTEXT,
		);

		expect(patches).toEqual([
			{ op: "remove", path: [] },
			{ op: "insert", path: [], value: { description: "Pouch" } },
			{ op: "insert", path: [], value: { description: "Pouch" } },
			{ op: "insert", path: [], value: { description: "Pouch" } },
		]);
	});
});
