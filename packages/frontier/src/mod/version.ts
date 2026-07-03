/**
 * @file Validation, SemVer increments, and format-preserving rewriting of the `version` field in `modinfo.json`.
 */

import {
	applyEdits,
	type FormattingOptions,
	modify,
	parse,
	type ParseError,
	printParseErrorCode,
} from "jsonc-parser";
import semver, { RELEASE_TYPES, type ReleaseType } from "semver";
import { isObject } from "../types/guards.ts";
import { ModVersionError } from "./error.ts";
import type { ModInfo } from "./types.ts";

/**
 * A canonical stored mod version: a literal `v` followed by a strict SemVer version.
 *
 * Input may omit the `v`, {@link toModVersion} restores it.
 */
export type ModVersion = `v${string}`;

/**
 * A SemVer increment kind accepted by `mod version up`: everything `semver.inc()` supports.
 */
export type IncrementKind = ReleaseType;

/**
 * The single `MOD_INFO` object of a parsed `modinfo.json`, with its array index for structural edits.
 */
interface LocatedModInfo {
	/** Position in the file's top-level array, the head of a `modify()` edit path. */
	index: number;
	/** The parsed object itself. */
	object: ModInfo;
}

/**
 * Every increment kind, for help text and positional validation.
 *
 * Derived from semver's own {@link RELEASE_TYPES}, plus `release`, which `semver.inc()` supports but the constant omits.
 */
export const INCREMENT_KINDS: readonly IncrementKind[] = [
	...RELEASE_TYPES,
	"release",
];

/**
 * Tests whether an increment kind produces or advances a prerelease.
 *
 * @param kind Kind to test.
 *
 * @returns `true` for `premajor`, `preminor`, `prepatch`, and `prerelease`.
 */
function isPrereleaseKind(kind: IncrementKind): boolean {
	return kind.startsWith("pre");
}

/**
 * Applies a SemVer increment to a valid stored version.
 *
 * @param current Version to increment.
 * @param kind Increment kind.
 * @param identifier Prerelease identifier for the prerelease-producing kinds, omitted for semver's numeric default sequence.
 *
 * @returns The incremented version.
 *
 * @throws ModVersionError when `release` targets a non-prerelease version or the identifier is not valid in SemVer.
 */
function bump(
	current: ModVersion,
	kind: IncrementKind,
	identifier?: string,
): ModVersion {
	const bumped = semver.inc(current, kind, undefined, identifier);

	if (!bumped)
		throw new ModVersionError(
			kind === "release"
				? `Cannot \`release\` \`${current}\`: it has no prerelease component to graduate.`
				: `Cannot apply \`${kind}\` with identifier \`${identifier}\`: not a valid SemVer prerelease identifier.`,
		);

	return `v${bumped}`;
}

/**
 * Parses `modinfo.json` text and locates the single `MOD_INFO` object in its top-level array.
 *
 * `jsonc-parser` collects parse errors instead of throwing, so malformed input surfaces as our typed error without a `try..catch`.
 *
 * @param text Full file text.
 *
 * @returns The object and its array index.
 *
 * @throws ModVersionError when the file is malformed, is not an array, or does not hold exactly one `MOD_INFO` object.
 */
function locateModInfo(text: string): LocatedModInfo {
	const errors: ParseError[] = [];
	const parsed: unknown = parse(text, errors);
	const [firstError] = errors;

	if (firstError)
		throw new ModVersionError(
			`locateModInfo(): Cannot parse \`modinfo.json\`: ${printParseErrorCode(firstError.error)} at offset ${firstError.offset}`,
		);

	if (!Array.isArray(parsed))
		throw new ModVersionError(
			"locateModInfo(): `modinfo.json` is not an array of game objects",
		);

	const located = parsed
		.map((object: unknown, index) => ({ object, index }))
		.filter(
			(entry): entry is LocatedModInfo =>
				isObject(entry.object) && entry.object.type === "MOD_INFO",
		);

	const [modInfo, ...extra] = located;

	if (!modInfo)
		throw new ModVersionError(
			"locateModInfo(): No `MOD_INFO` object found in `modinfo.json`",
		);

	if (extra.length)
		throw new ModVersionError(
			`locateModInfo(): Multiple \`MOD_INFO\` objects in \`modinfo.json\` (${located.length}), expected exactly one`,
		);

	return modInfo;
}

/**
 * Derives formatting options for inserted text from the file's own indentation and line endings.
 *
 * @param text Full file text.
 *
 * @returns Options matching the file's style, defaulting to tabs and `\n`.
 */
function detectFormatting(text: string): FormattingOptions {
	const indent = text.match(/\n([ \t]+)/)?.[1] ?? "\t";

	return {
		insertSpaces: !indent.startsWith("\t"),
		tabSize: indent.length,
		eol: text.includes("\r\n") ? "\r\n" : "\n",
	};
}

/**
 * Tests whether a string is an acceptable mod version: a SemVer version, with or without the `v` prefix.
 *
 * @param value String to test.
 *
 * @returns `true` when semver can parse the value.
 */
export function isVersion(value: string): boolean {
	return semver.parse(value) !== null;
}

/**
 * Describes why a value is not a valid mod version, naming the expected shape.
 *
 * @param value The offending value.
 *
 * @returns A user-facing explanation.
 */
export function describeInvalidVersion(value: string): string {
	return (
		`toModVersion(): Invalid mod version \`${value}\`: not a SemVer version.\n` +
		"Expected a SemVer version, with or without the `v` prefix, e.g. `0.1.0` or `v1.2.3-rc.1`"
	);
}

/**
 * Canonicalizes an acceptable mod version into the stored form, preserving build metadata.
 *
 * @param value String to canonicalize.
 *
 * @returns The canonical `v`-prefixed version.
 *
 * @throws ModVersionError when semver cannot parse the value.
 */
export function toModVersion(value: string): ModVersion {
	const parsed = semver.parse(value);

	if (!parsed) throw new ModVersionError(describeInvalidVersion(value));

	return parsed.build.length
		? `v${parsed.version}+${parsed.build.join(".")}`
		: `v${parsed.version}`;
}

/**
 * Computes the version `up` should store.
 *
 * With no stored version, an omitted kind starts the mod at `v0.1.0` while an explicit kind increments from an implicit `v0.0.0`. With a stored version, an omitted kind bumps `patch`.
 *
 * @param current The stored version, omitted when the mod has no `version` field.
 * @param kind The increment kind, omitted when not given on the command line.
 * @param identifier Prerelease identifier for the prerelease-producing kinds, omitted for semver's numeric default sequence.
 *
 * @returns The version to store.
 *
 * @throws ModVersionError when `current` is malformed, the identifier accompanies a non-prerelease kind, or the increment is impossible.
 */
export function getNextVersion(
	current?: string,
	kind?: IncrementKind,
	identifier?: string,
): ModVersion {
	const effectiveKind = kind ?? "patch";

	if (identifier !== undefined && !isPrereleaseKind(effectiveKind))
		throw new ModVersionError(
			`getNextVersion(): \`--identifier\` requires a prerelease kind (${INCREMENT_KINDS.filter(isPrereleaseKind).join(", ")}). \`${effectiveKind}\` takes no identifier`,
		);

	if (current === undefined)
		return kind === undefined ? "v0.1.0" : bump("v0.0.0", kind, identifier);

	return bump(toModVersion(current), effectiveKind, identifier);
}

/**
 * Reads the `version` value of the `MOD_INFO` object in `modinfo.json` text.
 *
 * @param text Full `modinfo.json` text.
 *
 * @returns The raw stored value, or `undefined` when the field is absent.
 *
 * @throws ModVersionError when the file is malformed, does not hold exactly one `MOD_INFO` object, or the stored value is not a string.
 */
export function readVersion(text: string): string | undefined {
	const version = locateModInfo(text).object.version;

	if (version === undefined) return undefined;

	if (typeof version !== "string")
		throw new ModVersionError(
			"readVersion(): The `version` value in the `MOD_INFO` object is not a string.",
		);

	return version;
}

/**
 * Stores a version in `modinfo.json` text, replacing the existing value or inserting the field directly after `type` (the Frontier Mods field order).
 *
 * `jsonc-parser` computes minimal text edits from the structural path, so everything outside the changed value stays byte-identical.
 *
 * @param text Full `modinfo.json` text.
 * @param version Version to store.
 *
 * @returns The rewritten text.
 *
 * @throws ModVersionError under the same conditions as {@link readVersion}.
 */
export function writeVersion(text: string, version: ModVersion): string {
	const { index } = locateModInfo(text);

	const edits = modify(text, [index, "version"], version, {
		formattingOptions: detectFormatting(text),
		getInsertionIndex: (properties) => properties.indexOf("type") + 1,
	});

	return applyEdits(text, edits);
}
