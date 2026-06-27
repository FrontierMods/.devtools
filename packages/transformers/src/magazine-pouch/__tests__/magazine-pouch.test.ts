/** @file magazine-pouch transform tests: type coercion, modifier effects, null-ripoff handling, prop preservation, and cross-field validation. */

import { describe, expect, test } from "bun:test";
import type { TransformContext } from "@frmds/autodoc";
import type { Patch } from "@frmds/frontier";
import { Compile } from "typebox/compile";
import MAGAZINE_POUCH_TRANSFORMER from "../transformer.ts";
import type { PocketWithMagPouch } from "../types.ts";

/** assertValidConfig only reads `modId`/`sourcePath` (error path); the cast documents that contract rather than fabricating the full pipeline state. */
const CONTEXT = {
	modId: "test",
	sourcePath: "items.json5",
} as TransformContext;

/** Run the transformer over a pocket and return its patches. The gate-irrelevant `pocket_type` is supplied so cases stay focused on the config. */
function transform(pocket: Omit<PocketWithMagPouch, "pocket_type">): Patch[] {
	return MAGAZINE_POUCH_TRANSFORMER.transform(
		{ pocket_type: "CONTAINER", ...pocket },
		CONTEXT,
	);
}

describe("calculateMagazinePouch", () => {
	test("gate matches a pocket with a config but not a bare `magazine_pouch` directive payload", () => {
		const gate = Compile(MAGAZINE_POUCH_TRANSFORMER.target.content);

		const config = { type: 2, capacity: 1 };

		expect(gate.Check({ pocket_type: "CONTAINER", magazine_pouch: config })).toBe(true);
		expect(gate.Check({ magazine_pouch: config })).toBe(false);
	});

	test("computes base stats for a numeric type and drops the config", () => {
		expect(transform({ magazine_pouch: { type: 2, capacity: 1 } })).toEqual(
			[
				{ op: "insert", path: ["volume_encumber_modifier"], value: 2 },
				{ op: "insert", path: ["ripoff"], value: 20 },
				{ op: "insert", path: ["moves"], value: 130 },
				{ op: "remove", path: ["magazine_pouch"] },
			],
		);
	});

	test("coerces label and Roman types to the canonical numeric type", () => {
		const fromLabel = transform({
			magazine_pouch: { type: "OPEN", capacity: 1 },
		});
		const fromRoman = transform({
			magazine_pouch: { type: "I", capacity: 1 },
		});

		expect(fromLabel).toEqual(fromRoman);
		expect(fromLabel).toEqual([
			{ op: "insert", path: ["volume_encumber_modifier"], value: 1.5 },
			{ op: "insert", path: ["ripoff"], value: 6 },
			{ op: "insert", path: ["moves"], value: 70 },
			{ op: "remove", path: ["magazine_pouch"] },
		]);
	});

	test("applies modifier effects to encumbrance, ripoff, and moves", () => {
		expect(
			transform({
				magazine_pouch: { type: 2, capacity: 1, modifiers: ["SHORT"] },
			}),
		).toEqual([
			{ op: "insert", path: ["volume_encumber_modifier"], value: 2.1 },
			{ op: "insert", path: ["ripoff"], value: 19 },
			{ op: "insert", path: ["moves"], value: 110 },
			{ op: "remove", path: ["magazine_pouch"] },
		]);
	});

	test("omits a `null` ripoff rather than inserting it", () => {
		const patches = transform({
			magazine_pouch: { type: "BUCKLE", capacity: 1 },
		});

		expect(patches).toEqual([
			{ op: "insert", path: ["volume_encumber_modifier"], value: 1 },
			{ op: "insert", path: ["moves"], value: 170 },
			{ op: "remove", path: ["magazine_pouch"] },
		]);
	});

	test("does not overwrite a stat the pocket already declares", () => {
		const patches = transform({
			magazine_pouch: { type: 2, capacity: 1 },
			moves: 999,
		});

		expect(patches).not.toContainEqual({
			op: "insert",
			path: ["moves"],
			value: 130,
		});
	});

	test("rejects mutually exclusive modifiers", () => {
		expect(() =>
			transform({
				magazine_pouch: {
					type: 2,
					capacity: 1,
					modifiers: ["SHORT", "TALL"],
				},
			}),
		).toThrow(/Mutually exclusive/);
	});

	test("rejects `BUTTON_RETAINER` on a non-type-II pouch", () => {
		expect(() =>
			transform({
				magazine_pouch: {
					type: 1,
					capacity: 1,
					modifiers: ["BUTTON_RETAINER"],
				},
			}),
		).toThrow(/only valid with type II/);
	});
});
