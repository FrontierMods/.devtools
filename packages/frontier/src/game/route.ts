/**
 * @file CLI route map for managing local CDDA installs.
 */

import {
	buildCommand,
	buildRouteMap,
	type CommandContext,
} from "@stricli/core";
import { createInterface } from "node:readline/promises";
import { type CoreFlags, withCoreFlags } from "../flags.ts";
import { configureLogger, logger } from "../logger.ts";
import { ConfigError } from "../config/error.ts";
import { readGlobalConfig, writeGlobalConfig } from "../config/global.ts";
import { toCanonicalPath } from "../file/paths.ts";
import type { CanonicalPath } from "../types/data.ts";
import { isObject } from "../types/guards.ts";
import {
	discoverInstalls,
	gamePaths,
	hashFromInstall,
	listInstalls,
} from "./installs.ts";
import { isSHA, parseSHA, type SHA } from "./sha.ts";

/**
 * Child logger scoped to game-install commands.
 */
const LOGGER = logger.getChild("game");

/**
 * `game add <path>`: registers an install under its commit hash, prompting before overwriting a different path.
 */
const GAME_ADD_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: CoreFlags,
		rawPath: string,
	) {
		await configureLogger(flags);

		try {
			const install = toCanonicalPath(rawPath);
			const sha = hashFromInstall(install);
			const config = readGlobalConfig();
			const paths = gamePaths(config);
			const existing = paths[sha];

			if (
				typeof existing === "string" &&
				existing !== install &&
				!(await promptYesNo(
					`Commit ${sha} is set to ${existing}; replace with ${install}?`,
				))
			)
				return LOGGER.info("Aborted");

			paths[sha] = install;

			writeGlobalConfig(config);

			LOGGER.info(`Added ${sha} = ${install}`);
		} catch (error) {
			if (!(error instanceof ConfigError)) throw error;

			LOGGER.error(error.message);

			process.exitCode = 1;
		}
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Install directory",
					parse: String,
					placeholder: "path",
				},
			],
		},
	},
	docs: { brief: "Register a CDDA install, keyed by its commit hash" },
});

/**
 * `game discover`: find installs on this system and register them, prompting to resolve per-hash duplicates.
 */
const GAME_DISCOVER_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		const installs = await discoverInstalls({
			choose: (sha, candidates) => promptChoice(sha, candidates),
		});

		if (!installs.length) return LOGGER.info("No CDDA installs found");

		for (const install of installs)
			LOGGER.info(`${install.sha} = ${install.path}`);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: { kind: "tuple", parameters: [] },
	},
	docs: { brief: "Find CDDA installs on this system and register them" },
});

/**
 * `game list`: print every registered install as `<sha> = <path>`.
 */
const GAME_LIST_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		const installs = listInstalls();

		if (!installs.length) return LOGGER.info("No game installs registered");

		for (const install of installs)
			LOGGER.info(`${install.sha} = ${install.path}`);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: { kind: "tuple", parameters: [] },
	},
	docs: { brief: "List registered game installs" },
});

/**
 * `game remove <sha|path>`: drop an install by hash or stored path, pruning emptied config nodes.
 */
const GAME_REMOVE_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags, ref: string) {
		await configureLogger(flags);

		const config = readGlobalConfig();
		const sha = isSHA(ref) ? parseSHA(ref) : hashForPath(ref);

		if (!sha)
			return LOGGER.info(`No registered install matches \`${ref}\``);

		const game = config.game;

		if (isObject(game) && isObject(game.path)) {
			delete game.path[sha];

			if (Object.keys(game.path).length === 0) delete game.path;
			if (Object.keys(game).length === 0) delete config.game;
		}

		writeGlobalConfig(config);

		LOGGER.info(`Removed ${sha}`);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{
					brief: "Commit hash or install path",
					parse: String,
					placeholder: "sha|path",
				},
			],
		},
	},
	docs: { brief: "Remove a registered game install" },
});

/**
 * The `game` route map, wiring the add, discover, list, and remove subcommands.
 */
export const GAME_ROUTE_MAP = buildRouteMap({
	routes: {
		add: GAME_ADD_COMMAND,
		discover: GAME_DISCOVER_COMMAND,
		list: GAME_LIST_COMMAND,
		remove: GAME_REMOVE_COMMAND,
	},
	docs: { brief: "Manage local Cataclysm: Dark Days Ahead installs" },
});

/**
 * Finds the registered hash whose stored path matches `rawPath`, if any.
 *
 * @param rawPath Install path to match against registered installs.
 *
 * @returns The registered hash whose stored path matches, or `undefined` if none does.
 */
function hashForPath(rawPath: string): SHA | undefined {
	const target = toCanonicalPath(rawPath);

	return listInstalls().find((install) => install.path === target)?.sha;
}

/**
 * Asks a yes/no question on the terminal. Only a literal `y` confirms.
 *
 * @param question Prompt text to display before the `(y/N)` suffix.
 *
 * @returns Whether the answer is a literal `y`.
 */
async function promptYesNo(question: string): Promise<boolean> {
	const readline = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const answer = await readline.question(`${question} (y/N) `);

	readline.close();

	return answer.trim().toLowerCase() === "y";
}

/**
 * Prompts the user to pick one path among duplicates for a hash and returns the chosen index.
 *
 * @param sha Commit hash whose duplicate paths are being disambiguated.
 * @param candidates Candidate paths to choose among.
 *
 * @returns The zero-based index of the chosen path, defaulting to `0` on invalid input.
 */
async function promptChoice(
	sha: SHA,
	candidates: CanonicalPath[],
): Promise<number> {
	const readline = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	LOGGER.info(`Commit ${sha} found at multiple paths; pick one:`);

	candidates.forEach((candidate, index) =>
		LOGGER.info(`  ${index + 1}. ${candidate}`),
	);

	const answer = await readline.question(`Choice (1-${candidates.length}): `);

	readline.close();

	const index = Number(answer.trim()) - 1;

	return index >= 0 && index < candidates.length ? index : 0;
}
