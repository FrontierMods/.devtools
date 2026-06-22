/**
 * @file Tests for the per-object timeline: creation, folds, anchors, tombstones, caches.
 */

import { describe, expect, test } from "bun:test";
import type { GameObject } from "../types.ts";
import {
	appendEntry,
	appendTombstone,
	createTimelineForObject,
	foldTimeline,
	isTimelineTombstoned,
	timelineCurrent,
	timelineRaw,
	timelineRuntime,
	type Timeline,
} from "../timeline.ts";

/**
 * The shared fixture object the timeline tests build their timelines around.
 */
const SWORD: GameObject = { type: "ITEM", id: "sword", price: 10 };

/**
 * Builds a timeline with one transformer entry past creation, the common starting state for the tests.
 */
function timelineWithEntry(): Timeline {
	const timeline = createTimelineForObject(SWORD, { via: "load" });

	appendEntry(
		timeline,
		{ via: "price" },
		[{ op: "replace", key: "price", value: 20 }],
		{ ...SWORD, price: 20 },
	);

	return timeline;
}

describe("createTimeline", () => {
	test("entry zero is a push of the object", () => {
		const timeline = createTimelineForObject(SWORD, { via: "load" });

		expect(timeline.entries).toHaveLength(1);
		expect(timeline.entries[0]!.patches[0]).toEqual({
			op: "push",
			path: [".."],
			value: SWORD,
		});
	});
});

describe("anchors", () => {
	test("raw is entry zero's value, untouched by later entries", () => {
		const timeline = timelineWithEntry();

		expect(timelineRaw(timeline)).toEqual(SWORD);
	});

	test("current folds transformer entries and skips enrichment steps", () => {
		const timeline = timelineWithEntry();

		appendEntry(
			timeline,
			{ via: "derive" },
			[{ op: "insert", path: ["longest_side"], value: "10 cm" }],
			{ ...SWORD, price: 20, longest_side: "10 cm" },
		);

		expect(timelineCurrent(timeline)).toEqual({ ...SWORD, price: 20 });
		expect(timelineRuntime(timeline)).toEqual({
			...SWORD,
			price: 20,
			longest_side: "10 cm",
		});
	});

	test("cold fold matches cached value", () => {
		const timeline = timelineWithEntry();

		delete timeline.current;

		expect(foldTimeline(timeline, { enriched: false })).toEqual({
			...SWORD,
			price: 20,
		});
	});
});

describe("entry origins", () => {
	test("appendEntry returns the new entry index and records the origin", () => {
		const timeline = createTimelineForObject(SWORD, { via: "load" });

		const index = appendEntry(
			timeline,
			{
				via: "siblingWriter",
				origin: { key: "mod:ITEM:other", entry: 0 },
			},
			[{ op: "replace", key: "price", value: 5 }],
			{ ...SWORD, price: 5 },
		);

		expect(index).toBe(1);
		expect(timeline.entries[1]!.source.origin).toEqual({
			key: "mod:ITEM:other",
			entry: 0,
		});
	});
});

describe("tombstones", () => {
	test("tombstone ends the timeline and folds to undefined", () => {
		const timeline = timelineWithEntry();

		appendTombstone(timeline, { via: "expandItemGroupVariants" });

		expect(isTimelineTombstoned(timeline)).toBe(true);
		expect(timelineCurrent(timeline)).toBeUndefined();
		expect(timelineRuntime(timeline)).toBeUndefined();
		expect(foldTimeline(timeline)).toBeUndefined();
	});

	test("appending to a tombstoned timeline throws", () => {
		const timeline = timelineWithEntry();

		appendTombstone(timeline, { via: "remover" });

		expect(() => appendEntry(timeline, { via: "late" }, [], SWORD)).toThrow(
			/dead/,
		);
	});
});
