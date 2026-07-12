/**
 * @file The `lookup` command: find base-game objects by ID and print them with their owning files, or suggest completions.
 */

import { buildCommand, type CommandContext } from "@stricli/core";
import path from "path";
import { Cache } from "../cache/cache.ts";
import { ConfigError } from "../config/error.ts";
import { type CoreFlags, withCoreFlags } from "../flags.ts";
import { resolveGamePath } from "../game/installs.ts";
import { configureLogger } from "../logger.ts";
import {
	ensureObjectIndex,
	findOwningFiles,
	listIndexKeys,
	readIndexedObjects,
	type OwningEntry,
} from "../object-index/object-index.ts";
import { resolveObjectIDs } from "../object/identity.ts";
import type { LoadableGameObject } from "../object/types.ts";
import type { CanonicalPath, ObjectID, ObjectType } from "../types/data.ts";
import { discoverGameFiles, resolveGameContent } from "./game-files.ts";
import { rankSuggestions } from "./match.ts";

/**
 * Flags accepted by the `lookup` command.
 */
interface LookupFlags extends CoreFlags {
	/** Narrows results to one object type. */
	type?: ObjectType;
	/** Prints all matching objects as a bare JSON array on stdout. */
	json?: boolean;
	/** Limits output to the first match. With `--json`, prints it as a bare object instead of an array. */
	first?: boolean;
	/**
	 * Prints only the owning file paths, one per line.
	 * With `--json`, prints them as a string array.
	 */
	path?: boolean;
	/** Overrides the game install, a registered commit hash or a path. */
	game?: string;
}

/**
 * Longest completion list printed before truncating.
 */
const COMPLETION_LIMIT = 20;

/**
 * `lookup <query>`: prints every object carrying the queried ID with its owning file, or ranked completions on a miss.
 */
export const LOOKUP_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: LookupFlags,
		query: string,
	) {
		// * skip logging on machine-oriented output, which is intended for piping
		await configureLogger(
			flags.json || flags.path ? { ...flags, silent: true } : flags,
		);

		try {
			const install = resolveGamePath({
				game: flags.game,
				cwd: process.cwd(),
			});

			const contentRoot = resolveGameContent(install);
			const files = await discoverGameFiles(contentRoot);

			// * the toolkit's cache always lives one level above the content root
			const cache = new Cache({
				path: path.dirname(contentRoot),
				persistent: flags.cache,
			});

			try {
				await ensureObjectIndex(cache, files);

				const owning = findOwningFiles(cache, query, flags.type);
				const matches = matchingObjects(cache, query, owning);

				if (!matches.length) {
					if (flags.json)
						console.error(noMatchMessage(query, flags.type));
					else printCompletions(cache, query, flags.type);

					process.exitCode = 1;

					return;
				}

				const selected = flags.first ? matches.slice(0, 1) : matches;

				if (flags.path) return printPaths(selected, flags);
				if (flags.json) return printJSON(selected, flags.first);

				if (matches.length > 1)
					console.error(`${matches.length} matches`);

				printObjects(selected);
			} finally {
				await cache.close();
			}
		} catch (error) {
			if (!(error instanceof ConfigError)) throw error;

			console.error(error.message);

			process.exitCode = 1;
		}
	},
	parameters: {
		flags: withCoreFlags({
			type: {
				kind: "parsed",
				parse: String,
				brief: "Narrow results to one object type",
				optional: true,
				placeholder: "type",
			},
			json: {
				kind: "boolean",
				brief: "Print matching objects as a bare JSON array",
				optional: true,
			},
			first: {
				kind: "boolean",
				brief: "Limit output to the first match",
				optional: true,
			},
			path: {
				kind: "boolean",
				brief: "Print only the owning file paths, one per line",
				optional: true,
			},
			game: {
				kind: "parsed",
				parse: String,
				brief: "Game install, a registered commit hash or a path",
				optional: true,
				placeholder: "sha|path",
			},
		}),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Object ID, or a partial query for completions",
					parse: String,
					placeholder: "query",
				},
			],
		},
	},
	docs: { brief: "Look up base-game objects by ID" },
});

/**
 * Collects every object matching an ID, in deterministic order: by type, then file path, then position within the file.
 *
 * @param cache The install's cache holding the parsed objects.
 * @param id The exactly-matched object ID.
 * @param owning The index hits to walk.
 *
 * @returns Owning-file and object pairs.
 */
function matchingObjects(
	cache: Cache,
	id: ObjectID,
	owning: OwningEntry[],
): [CanonicalPath, LoadableGameObject][] {
	const sorted = [...owning].sort((left, right) =>
		left.type.localeCompare(right.type),
	);

	const matches: [CanonicalPath, LoadableGameObject][] = [];

	for (const { type, files } of sorted)
		for (const file of [...files].sort())
			for (const object of readIndexedObjects(cache, file)) {
				if (object.type !== type) continue;

				const carriesID = resolveObjectIDs(object).some(
					(resolved) => resolved.id === id,
				);

				if (carriesID) matches.push([file, object]);
			}

	return matches;
}

/**
 * Prints every matching object, each preceded by its owning file's path.
 *
 * @param matches Owning-file and object pairs to print.
 */
function printObjects(matches: [CanonicalPath, LoadableGameObject][]): void {
	for (const [file, object] of matches) {
		console.log(file);
		console.log(JSON.stringify(object, null, 2));
	}
}

/**
 * Prints matching objects as bare JSON on stdout: an array, or a single object under `--first`.
 *
 * @param matches Owning-file and object pairs to print.
 * @param first Whether to print the sole match as a bare object.
 */
function printJSON(
	matches: [CanonicalPath, LoadableGameObject][],
	first?: boolean,
): void {
	const objects = matches.map(([, object]) => object);

	console.log(JSON.stringify(first ? objects[0] : objects, null, 2));
}

/**
 * Prints only the owning file paths.
 * Prints one per line by default, or as a JSON string array when used with `--json`.
 *
 * @param matches Owning-file and object pairs whose paths to print.
 * @param flags The command's flags shaping the output.
 */
function printPaths(
	matches: [CanonicalPath, LoadableGameObject][],
	flags: LookupFlags,
): void {
	const paths = matches.map(([file]) => file);

	if (flags.json) {
		console.log(JSON.stringify(flags.first ? paths[0] : paths, null, 2));

		return;
	}

	for (const file of paths) console.log(file);
}

/**
 * Builds the one-line miss message for the `--json` path.
 *
 * @param query The unmatched query.
 * @param type Object type filter that scoped the query.
 *
 * @returns The formatted miss message.
 */
function noMatchMessage(query: string, type?: ObjectType): string {
	const scope = type ? ` with type \`${type}\`` : "";

	return `No object with ID \`${query}\`${scope}`;
}

/**
 * Prints ranked completions for a missed query and the error explaining the miss.
 *
 * @param cache The install's cache holding the index.
 * @param query The unmatched query.
 * @param type Object type filter narrowing the completion corpus.
 */
function printCompletions(
	cache: Cache,
	query: string,
	type?: ObjectType,
): void {
	const keys = listIndexKeys(cache);

	const ids = [
		...new Set(
			keys
				.filter(([, keyType]) => !type || keyType === type)
				.map(([id]) => id),
		),
	];

	const ranked = rankSuggestions(query, ids);
	const scope = type ? ` with type \`${type}\`` : "";

	if (!ranked.length) {
		console.error(`No object matches \`${query}\`${scope}`);

		return;
	}

	console.error(`No object with ID \`${query}\`${scope}. Did you mean:`);

	for (const id of ranked.slice(0, COMPLETION_LIMIT))
		console.error(`  ${id}`);

	const remaining = ranked.length - COMPLETION_LIMIT;

	if (remaining > 0) console.error(`  ...and ${remaining} more`);
}
