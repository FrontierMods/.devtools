/**
 * @file CLI route map for managing global Frontier config.
 */

import {
	buildCommand,
	buildRouteMap,
	type CommandContext,
} from "@stricli/core";
import { createInterface } from "node:readline/promises";
import { type CoreFlags, withCoreFlags } from "../flags.ts";
import { configureLogger, logger } from "../logger.ts";
import { getAtPath } from "../object/access.ts";
import type { JSONObject, JSONValue } from "../types/data.ts";
import { isObject } from "../types/guards.ts";
import { ConfigError } from "./error.ts";
import {
	clearGlobalConfig,
	readGlobalConfig,
	writeGlobalConfig,
} from "./global.ts";
import { paramForKey, PARAMS } from "./params.ts";

/**
 * The config route logger.
 */
const LOGGER = logger.getChild("config");

/**
 * Known config namespaces rendered as a help blurb for the route map brief.
 */
const KNOWN_KEYS = Object.values(PARAMS)
	.map((param) => `${param.namespace}: ${param.brief}`)
	.join("; ");

/**
 * `frontier config set <key> <value>`: validate, store, and persist one leaf.
 */
const CONFIG_SET_COMMAND = buildCommand({
	func: async function (
		this: CommandContext,
		flags: CoreFlags,
		key: string,
		value: string,
	) {
		await configureLogger(flags);

		try {
			const param = paramForKey(key);

			if (!param) throw new ConfigError(`Unknown config key: \`${key}\``);

			const parsed = param.parse(value);
			const config = readGlobalConfig();
			const segments = key.split(".");
			const leaf = segments.at(-1);

			if (leaf === undefined) throw new ConfigError(`Empty config key`);

			let node = config;

			for (const segment of segments.slice(0, -1)) {
				const next = node[segment];
				const child = isObject(next) ? next : {};

				node[segment] = child;
				node = child;
			}

			node[leaf] = parsed;

			writeGlobalConfig(config);

			LOGGER.info(`Set \`${key}\``);
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
				{ brief: "Config key", parse: String, placeholder: "key" },
				{ brief: "Config value", parse: String, placeholder: "value" },
			],
		},
	},
	docs: { brief: "Set a global config value" },
});

/**
 * `frontier config get <key>`: print a single leaf or a whole subtree.
 */
const CONFIG_GET_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags, key: string) {
		await configureLogger(flags);

		const value = getAtPath(readGlobalConfig(), key.split("."));

		if (value === undefined) return LOGGER.info(`\`${key}\` is not set`);

		for (const line of renderConfigValue(key, value)) LOGGER.info(line);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{ brief: "Config key", parse: String, placeholder: "key" },
			],
		},
	},
	docs: { brief: "Print a global config value or subtree" },
});

/**
 * `frontier config list`: print every currently-set config value.
 */
const CONFIG_LIST_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		const lines = renderConfigValue("", readGlobalConfig());

		if (!lines.length) return LOGGER.info("No global config set");

		for (const line of lines) LOGGER.info(line);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: { kind: "tuple", parameters: [] },
	},
	docs: { brief: "List currently-set global config values" },
});

/**
 * `frontier config unset <key>`: remove one leaf and prune emptied ancestors.
 */
const CONFIG_UNSET_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags, key: string) {
		await configureLogger(flags);

		const config = readGlobalConfig();

		deleteConfigPath(config, key.split("."));
		writeGlobalConfig(config);

		LOGGER.info(`Unset \`${key}\``);
	},
	parameters: {
		flags: withCoreFlags(),
		positional: {
			kind: "tuple",
			parameters: [
				{ brief: "Config key", parse: String, placeholder: "key" },
			],
		},
	},
	docs: { brief: "Remove a single global config value" },
});

/**
 * `frontier config clear`: erase all config after a terminal confirmation.
 */
const CONFIG_CLEAR_COMMAND = buildCommand({
	func: async function (this: CommandContext, flags: CoreFlags) {
		await configureLogger(flags);

		const confirmed = await promptYesNo(
			"This will erase ALL global Frontier config. Continue?",
		);

		if (!confirmed) return LOGGER.info("Aborted");

		clearGlobalConfig();

		LOGGER.info("Cleared all global config");
	},
	parameters: {
		flags: withCoreFlags(),
		positional: { kind: "tuple", parameters: [] },
	},
	docs: { brief: "Erase all global config (asks for confirmation)" },
});

/**
 * The `frontier config` subcommand tree.
 */
export const CONFIG_ROUTE_MAP = buildRouteMap({
	routes: {
		set: CONFIG_SET_COMMAND,
		get: CONFIG_GET_COMMAND,
		list: CONFIG_LIST_COMMAND,
		unset: CONFIG_UNSET_COMMAND,
		clear: CONFIG_CLEAR_COMMAND,
	},
	docs: {
		brief: `Manage global Frontier config. Known keys: ${KNOWN_KEYS}`,
	},
});

/**
 * Deletes the leaf at `segments`, pruning any ancestor objects left empty.
 *
 * @param node Config object to delete from, mutated in place.
 * @param segments Dotted-key path to the leaf to remove.
 */
function deleteConfigPath(node: JSONObject, segments: string[]): void {
	const [head, ...rest] = segments;

	if (head === undefined) return;

	if (rest.length === 0) {
		delete node[head];

		return;
	}

	const child = node[head];

	if (!isObject(child)) return;

	deleteConfigPath(child, rest);

	if (Object.keys(child).length === 0) delete node[head];
}

/**
 * Flattens a leaf or subtree to `dotted.key = value` lines (the key prefix may be empty).
 *
 * @param prefix Dotted-key prefix accumulated so far, empty at the root.
 * @param value Leaf or subtree to render.
 *
 * @returns Rendered `dotted.key = value` lines.
 */
function renderConfigValue(prefix: string, value: JSONValue): string[] {
	if (!isObject(value)) {
		const rendered = JSON.stringify(value);

		return [prefix ? `${prefix} = ${rendered}` : rendered];
	}

	return Object.entries(value).flatMap(([segment, child]) =>
		child === undefined
			? []
			: renderConfigValue(
					prefix ? `${prefix}.${segment}` : segment,
					child,
				),
	);
}

/**
 * Asks a yes/no question on the terminal. Only a literal `y` confirms.
 *
 * @param question Prompt text shown before the `(y/N)` suffix.
 *
 * @returns `true` when the answer is a literal `y`.
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
