/**
 * @file Runtime behavior of the SHA parser and guard.
 */

import { test, expect } from "bun:test";
import { ConfigError } from "../../config/error.ts";
import { isSHA, parseSHA } from "../sha.ts";

/**
 * A well-formed 40-hex commit SHA used as the parser's happy-path input.
 */
const VALID = "27939e29b8b4ddc081490d9f51de59a459c88df6";

test("parseSHA accepts and lowercases a 40-hex string", () => {
	expect(parseSHA(VALID.toUpperCase())).toBe(VALID);
});

test("parseSHA trims surrounding whitespace", () => {
	expect(parseSHA(`  ${VALID}\n`)).toBe(VALID);
});

test("parseSHA rejects a wrong-length or non-hex string", () => {
	expect(() => parseSHA(VALID.slice(0, 39))).toThrow(ConfigError);
	expect(() => parseSHA(`${VALID}0`)).toThrow(ConfigError);
	expect(() => parseSHA("z".repeat(40))).toThrow(ConfigError);
});

test("isSHA reports validity without throwing", () => {
	expect(isSHA(VALID)).toBe(true);
	expect(isSHA("nope")).toBe(false);
});
