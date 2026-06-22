/**
 * @file Tests for the read-recording view.
 */

import { describe, expect, test } from "bun:test";
import type { CanonicalPath } from "@frmds/frontier";
import type { ObjectStoreReader } from "../store-view.ts";
import { createRecordingView } from "../recording-view.ts";

/**
 * Path of the sample consumer file.
 */
const FILE_A = "/mod/src/a.json5" as CanonicalPath;

/**
 * Empty reader wrapped by the recording view under test.
 */
const INNER: ObjectStoreReader = {
	get: () => undefined,
	has: () => false,
	entries: () => [][Symbol.iterator](),
};

describe("createRecordingView", () => {
	test("attributes get/has to the active consumer, hit or miss", () => {
		const recording = createRecordingView(INNER);

		recording.setConsumer(FILE_A);
		recording.view.get("vest", "ARMOR");
		recording.view.has("plate");
		recording.setConsumer(null);

		const log = recording.readsByFile().get(FILE_A)!;

		expect([...log.queries].sort()).toEqual(["*:plate", "ARMOR:vest"]);
		expect(log.global).toBe(false);
	});

	test("entries() marks the consumer global", () => {
		const recording = createRecordingView(INNER);

		recording.setConsumer(FILE_A);

		// eslint-disable-next-line no-unused-expressions -- spread purely to trigger iteration, which records the read
		[...recording.view.entries()];

		expect(recording.readsByFile().get(FILE_A)!.global).toBe(true);
	});

	test("reads without a consumer are not recorded", () => {
		const recording = createRecordingView(INNER);

		recording.view.get("vest", "ARMOR");

		expect(recording.readsByFile().size).toBe(0);
	});
});
