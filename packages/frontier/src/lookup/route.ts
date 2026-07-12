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
	/** Prints exactly one matching object as bare JSON on stdout. */
	json?: boolean;
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
		// * skip logging on `--json`, which is intended to emit raw JSON
		await configureLogger(flags.json ? { ...flags, silent: true } : flags);

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

				if (flags.json) {
					if (printFirstObject(cache, query, owning)) return;

					console.error(noMatchMessage(query, flags.type));

					process.exitCode = 1;

					return;
				}

				if (owning.length) return printObjects(cache, query, owning);

				printCompletions(cache, query, flags.type);

				process.exitCode = 1;
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
				brief: "Print exactly one matching object as bare JSON",
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
 * @param cache The install's cache holding the parsed objects.
 * @param id The exactly-matched object ID.
 * @param owning The index hits to print.
 */
function printObjects(cache: Cache, id: ObjectID, owning: OwningEntry[]): void {
	for (const [file, object] of matchingObjects(cache, id, owning)) {
		console.log(file);
		console.log(JSON.stringify(object, null, 2));
	}
}

/**
 * Prints the first matching object as bare JSON on stdout.
 *
 * @param cache The install's cache holding the parsed objects.
 * @param id The exactly-matched object ID.
 * @param owning The index hits to walk.
 *
 * @returns `true` when an object was printed.
 */
function printFirstObject(
	cache: Cache,
	id: ObjectID,
	owning: OwningEntry[],
): boolean {
	const [first] = matchingObjects(cache, id, owning);

	if (!first) return false;

	console.log(JSON.stringify(first[1], null, 2));

	return true;
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
