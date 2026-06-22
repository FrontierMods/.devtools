/**
 * @file Reading, writing, and mutating the on-disk plugin registry, with schema validation that turns malformed files into actionable errors.
 */

import fs from "fs-extra";
import path from "path";
import { appPaths } from "../locations.ts";
import { logger } from "../logger.ts";
import { isArray, isObject } from "../types/guards.ts";
import { getErrorCode, getErrorMessage, RegistryReadError } from "./error.ts";
import {
	type Plugin,
	type PluginMetadata,
	type PluginRegistry,
} from "./types.ts";

/**
 * Name of the registry file within the app config directory.
 */
const REGISTRY_FILE = "plugins.json";

/**
 * Validates the metadata block of a registry entry, throwing when a required string field is missing or mistyped.
 *
 * @param raw The unvalidated metadata value.
 * @param pluginId The owning plugin id, used in error messages.
 *
 * @returns The validated, typed metadata.
 *
 * @throws When the value is not an object or a required string field is missing or mistyped.
 */
function validateMetadata(raw: unknown, pluginId: string): PluginMetadata {
	if (!isObject(raw))
		throw new Error(`Plugin \`${pluginId}\`: metadata must be an object`);

	if (typeof raw.name !== "string")
		throw new Error(
			`Plugin \`${pluginId}\`: metadata.name must be a string`,
		);

	if (typeof raw.description !== "string")
		throw new Error(
			`Plugin \`${pluginId}\`: metadata.description must be a string`,
		);

	if (typeof raw.command !== "string")
		throw new Error(
			`Plugin \`${pluginId}\`: metadata.command must be a string`,
		);

	return {
		name: raw.name,
		description: raw.description,
		command: raw.command,
	};
}

/**
 * Validates a single registry entry into a typed {@link Plugin}, throwing on any missing or mistyped field.
 *
 * @param raw The unvalidated registry entry.
 *
 * @returns The validated, typed plugin record.
 *
 * @throws When the value is not an object or any required field is missing or mistyped.
 */
function validatePlugin(raw: unknown): Plugin {
	if (!isObject(raw)) throw new Error("Plugin entry must be an object");

	if (typeof raw.id !== "string")
		throw new Error("Plugin entry missing required field: id");

	if (typeof raw.apiVersion !== "number")
		throw new Error(`Plugin \`${raw.id}\`: apiVersion must be a number`);

	if (typeof raw.lastCheckedAt !== "string")
		throw new Error(`Plugin \`${raw.id}\`: lastCheckedAt must be a string`);

	return {
		id: raw.id,
		metadata: validateMetadata(raw.metadata, raw.id),
		apiVersion: raw.apiVersion,
		lastCheckedAt: raw.lastCheckedAt,
	};
}

/**
 * Validates the registry root into a typed {@link PluginRegistry}, throwing when the `plugins` array is absent.
 *
 * @param raw The unvalidated registry root.
 *
 * @returns The validated, typed registry.
 *
 * @throws When the value is not an object or the `plugins` array is absent or holds an invalid entry.
 */
function validateRegistry(raw: unknown): PluginRegistry {
	if (!isObject(raw)) throw new Error("Registry must be an object");

	if (!isArray(raw.plugins))
		throw new Error("Registry missing required field: plugins");

	return {
		plugins: raw.plugins.map(validatePlugin),
	};
}

/**
 * The absolute path to the registry file under the app config directory.
 *
 * @returns The absolute path to the registry file.
 */
export function getRegistryPath(): string {
	return path.join(appPaths().config, REGISTRY_FILE);
}

/**
 * Reads and validates the registry, returning an empty one when the file is absent. Throws {@link RegistryReadError} on read or schema failures, with a code and path for handling.
 *
 * @returns The validated registry, or an empty one when the file is absent.
 *
 * @throws {@link RegistryReadError} When the file cannot be read or fails schema validation.
 */
export async function readRegistry(): Promise<PluginRegistry> {
	const file = getRegistryPath();

	if (!(await fs.pathExists(file))) return { plugins: [] };

	let raw: unknown;

	try {
		raw = await fs.readJson(file);
	} catch (error) {
		const code = getErrorCode(error);

		throw new RegistryReadError(getErrorMessage(code, file), {
			code,
			path: file,
			cause: error,
		});
	}

	try {
		return validateRegistry(raw);
	} catch (error) {
		throw new RegistryReadError(
			`Plugin registry is corrupted: ${file}. Run 'frontier plugin reset' to repair.`,
			{ code: "INVALID_SCHEMA", path: file, cause: error },
		);
	}
}

/**
 * Persists the registry to disk, creating the config directory if needed.
 *
 * @param registry The registry to write to disk.
 *
 * @throws When the config directory cannot be created or the file cannot be written.
 */
export async function writeRegistry(registry: PluginRegistry): Promise<void> {
	const file = getRegistryPath();

	await fs.ensureDir(path.dirname(file));
	await fs.writeJson(file, registry, { spaces: 2 });
}

/**
 * Adds a plugin to the registry (id-sorted), returning the registry unchanged when it is already present.
 *
 * @param plugin The plugin record to add.
 *
 * @returns The updated registry, or the existing one when the plugin is already present.
 *
 * @throws {@link RegistryReadError} When the existing registry cannot be read or fails validation.
 */
export async function addPlugin(plugin: Plugin): Promise<PluginRegistry> {
	const registry = await readRegistry();

	if (registry.plugins.find((existing) => existing.id === plugin.id)) {
		logger.debug(`Plugin already registered: ${plugin.id}`);

		return registry;
	}

	const plugins = [...registry.plugins, plugin].sort(
		({ id: leftId }, { id: rightId }) => leftId.localeCompare(rightId),
	);

	const next: PluginRegistry = { plugins };

	await writeRegistry(next);

	return next;
}

/**
 * Removes the plugin with the given id from the registry, returning the updated registry.
 *
 * @param id The plugin id to remove.
 *
 * @returns The updated registry.
 *
 * @throws {@link RegistryReadError} When the existing registry cannot be read or fails validation.
 */
export async function removePlugin(id: string): Promise<PluginRegistry> {
	const registry = await readRegistry();
	const plugins = registry.plugins.filter((plugin) => plugin.id !== id);

	const next: PluginRegistry = { plugins };

	await writeRegistry(next);

	return next;
}

/**
 * Deletes the registry file, restoring the empty-registry state on the next read.
 *
 * @throws When the registry file exists but cannot be deleted, e.g. on a permission error.
 */
export async function resetRegistry(): Promise<void> {
	const file = getRegistryPath();

	if (await fs.pathExists(file)) await fs.remove(file);
}
