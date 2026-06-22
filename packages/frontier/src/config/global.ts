/**
 * @file Read/write access to the user's global Frontier config: a permissive nested JSON object, validated at both edges.
 */

import fs from "fs-extra";
import path from "path";
import { appPaths } from "../locations.ts";
import { deepWalk } from "../object/access.ts";
import type { JSONObject } from "../types/data.ts";
import { ConfigError } from "./error.ts";
import { paramForKey } from "./params.ts";

/**
 * The user's global config: an arbitrary JSON object.
 */
export type GlobalConfig = JSONObject;

/**
 * Filename of the global config, stored in the toolkit's app-data config directory.
 */
const CONFIG_FILE = "config.json";

/**
 * Returns the absolute path to the global config file, beside `plugins.json`.
 *
 * @returns Absolute path to the global config file.
 */
export function globalConfigPath(): string {
	return path.join(appPaths().config, CONFIG_FILE);
}

/**
 * Reads and validates the global config.
 *
 * @param file Config file to read, defaults to the user's global config.
 *
 * @returns Parsed config, or an empty object when the file is absent.
 *
 * @throws ConfigError when a known leaf is invalid, or Error when the file is not valid JSON.
 */
export function readGlobalConfig(
	file: string = globalConfigPath(),
): JSONObject {
	if (!fs.pathExistsSync(file)) return {};

	const config = fs.readJsonSync(file);

	validateConfig(config);

	return config;
}

/**
 * Validates and persists the whole config object.
 *
 * @param config Config tree to validate and write.
 * @param file Config file to write, defaults to the user's global config.
 *
 * @throws ConfigError when a known leaf is invalid.
 */
export function writeGlobalConfig(
	config: JSONObject,
	file: string = globalConfigPath(),
): void {
	validateConfig(config);

	fs.ensureDirSync(path.dirname(file));
	fs.writeJsonSync(file, config, { spaces: 2 });
}

/**
 * Empties the global config, leaving an empty object on disk.
 *
 * @param file Config file to write, defaults to the user's global config.
 */
export function clearGlobalConfig(file: string = globalConfigPath()): void {
	fs.ensureDirSync(path.dirname(file));
	fs.writeJsonSync(file, {}, { spaces: 2 });
}

/**
 * Validates a config tree: every leaf under a known namespace must be a string and pass that namespace's `parse`. Unknown namespaces are left untouched.
 *
 * @param config Config tree to validate.
 *
 * @throws ConfigError when a known leaf is not a string, or whatever the namespace's `parse` raises when the leaf is invalid.
 */
export function validateConfig(config: JSONObject): void {
	deepWalk(config, (propertyPath, value) => {
		if (typeof value === "object" && value !== null) return;

		const key = propertyPath.join(".");
		const param = paramForKey(key);

		if (!param) return;

		if (typeof value !== "string")
			throw new ConfigError(`Expected a string at \`${key}\``);

		param.parse(value);
	});
}
