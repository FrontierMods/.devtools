/**
 * @file CLI route map for reading and writing the current mod's version.
 */

import {
	buildCommand,
	buildRouteMap,
	type CommandContext,
} from "@stricli/core";
import fs from "fs-extra";
import path from "path";
import { toCanonicalPath } from "../file/paths.ts";
import { type CoreFlags, withCoreFlags } from "../flags.ts";
import { configureLogger, logger } from "../logger.ts";
import type { CanonicalPath } from "../types/data.ts";
import { ModVersionError } from "./error.ts";
import {
	describeInvalidVersion,
	INCREMENT_KINDS,
	type IncrementKind,
	isVersion,
	getNextVersion,
	readVersion,
	toModVersion,
	writeVersion,
} from "./version.ts";

/**
 * Flags of `mod version up`.
 */
interface UpFlags extends CoreFlags {
	/** Prerelease identifier for the prerelease-producing kinds. */
	identifier?: string;
}

/**
 * Child logger scoped to mod commands.
 */
const LOGGER = logger.getChild("mod");

/**
 * `mod version set <version>`: stores an exact version, validating its shape first.
 */
const VERSION_SET_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: CoreFlags,
		version: string,
	) {
		await configureLogger(flags);

		try {
			const canonical = toModVersion(version);
			const location = modinfoLocation();
			const text = fs.readFileSync(location, "utf8");
			const current = readVersion(text);

			fs.writeFileSync(location, writeVersion(text, canonical));

			LOGGER.info(
				current === undefined
					? `Set version to ${canonical}`
					: `${current} → ${canonical}`,
			);
		} catch (error) {
			reportVersionError(error);
		}
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Version to store, e.g. 1.2.0 or v1.2.0",
					parse: String,
					placeholder: "version",
				},
			],
		},
	},
	docs: { brief: "Set the mod's version exactly" },
});

/**
 * `mod version`: prints the current version, warning when it is malformed and advising when it is absent.
 */
const VERSION_SHOW_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		try {
			const version = readVersion(
				fs.readFileSync(modinfoLocation(), "utf8"),
			);

			if (version === undefined)
				return LOGGER.info(
					"No `version` in `modinfo.json`. Run `frontier mod version up` to start at `v0.1.0`, or `frontier mod version set <version>` for a custom start.",
				);

			LOGGER.info(version);

			if (!isVersion(version))
				LOGGER.warn(describeInvalidVersion(version));
		} catch (error) {
			reportVersionError(error);
		}
	},
	parameters: {
		flags: withCoreFlags(),
		positional: { kind: "tuple", parameters: [] },
	},
	docs: { brief: "Print the mod's current version" },
});

/**
 * `mod version up [kind]`: bumps the version, initializing a versionless mod.
 */
const VERSION_UP_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: UpFlags,
		kind?: IncrementKind,
	) {
		await configureLogger(flags);

		try {
			const location = modinfoLocation();
			const text = fs.readFileSync(location, "utf8");
			const current = readVersion(text);
			const next = getNextVersion(current, kind, flags.identifier);

			fs.writeFileSync(location, writeVersion(text, next));

			LOGGER.info(
				current === undefined
					? `Initialized version at ${next}`
					: `${current} → ${next}`,
			);
		} catch (error) {
			reportVersionError(error);
		}
	},
	parameters: {
		flags: withCoreFlags({
			identifier: {
				kind: "parsed",
				parse: String,
				brief: "Prerelease identifier (e.g. alpha, rc) for premajor, preminor, prepatch, and prerelease",
				optional: true,
			},
		}),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: `Increment kind: ${INCREMENT_KINDS.join(", ")} (default patch)`,
					parse: parseIncrementKind,
					placeholder: "kind",
					optional: true,
				},
			],
		},
	},
	docs: { brief: "Bump the mod's version" },
});

/**
 * The `version` route map: show (default), up, and set.
 */
const MOD_VERSION_ROUTE_MAP = buildRouteMap({
	routes: {
		set: VERSION_SET_COMMAND,
		show: VERSION_SHOW_COMMAND,
		up: VERSION_UP_COMMAND,
	},
	defaultCommand: "show",
	docs: { brief: "Read and write the mod's `version` in `modinfo.json`" },
});

/**
 * The `mod` route map, exposing commands that operate on the mod in the current directory.
 */
export const MOD_ROUTE_MAP = buildRouteMap({
	routes: {
		version: MOD_VERSION_ROUTE_MAP,
	},
	docs: { brief: "Manage the mod in the current directory" },
});

/**
 * Resolves `modinfo.json` in the current directory, mirroring the resolver's convention.
 *
 * @returns The canonical path.
 *
 * @throws ModVersionError when the file does not exist.
 */
function modinfoLocation(): CanonicalPath {
	const location = path.join(process.cwd(), "modinfo.json");

	if (!fs.pathExistsSync(location))
		throw new ModVersionError(
			"No `modinfo.json` found in current directory.\n\n" +
				"Frontier must be run from a mod directory containing `modinfo.json`.",
		);

	return toCanonicalPath(location);
}

/**
 * Parses the positional increment kind, rejecting anything outside {@link INCREMENT_KINDS}.
 *
 * @param input Raw positional argument.
 *
 * @returns The validated kind.
 *
 * @throws Error naming the accepted kinds, surfaced by stricli as a usage error.
 */
function parseIncrementKind(input: string): IncrementKind {
	const kind = INCREMENT_KINDS.find((candidate) => candidate === input);

	if (!kind)
		throw new Error(`Expected one of: ${INCREMENT_KINDS.join(", ")}`);

	return kind;
}

/**
 * Logs a {@link ModVersionError} and marks the process failed, rethrowing anything else.
 *
 * @param error The caught value.
 */
function reportVersionError(error: unknown): void {
	if (!(error instanceof ModVersionError)) throw error;

	LOGGER.error(error.message);

	process.exitCode = 1;
}
