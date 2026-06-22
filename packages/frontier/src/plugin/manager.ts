/**
 * @file Plugin discovery and loading: resolves plugin ids against every global package site, imports the module, and reports a typed outcome per id.
 */

import fs from "fs-extra";
import globalDirectory from "global-directory";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { extractErrorMessage } from "../error.ts";
import { logger } from "../logger.ts";
import { isObject } from "../types/guards.ts";
import type { LoadedPlugin, LoadMode, PluginDefinition } from "./types.ts";

/**
 * Outcome of resolving a plugin id against every known global site.
 */
type PluginLocation =
	| { kind: "found"; path: string }
	| { kind: "missing"; searched: GlobalRoot[] }
	| { kind: "conflict"; matches: PluginMatch[] };

/**
 * A global package directory to search for plugins, tagged by the manager that owns it.
 */
interface GlobalRoot {
	manager: string;
	packages: string;
}

/**
 * A plugin module found on disk, and which manager's global site held it.
 */
interface PluginMatch {
	manager: string;
	path: string;
}

/**
 * Child logger for plugin discovery and loading.
 */
const LOGGER = logger.getChild("plugins");

/**
 * The plugin API version the core implements. A plugin reporting a different version is rejected as incompatible.
 */
export const PLUGIN_API_VERSION = 1;

/**
 * The global package directories Frontier searches for plugins, in report order: npm and pnpm (via `global-directory`), plus Bun's global store (derived from `$BUN_INSTALL`, defaulting to `~/.bun`). Searching all of them lets `npm i -g`, `bun add -g`, and either manager's `link` all surface plugins, so the install path is not tied to a single package manager.
 *
 * @returns The global package roots to search, tagged by manager.
 */
function globalPackageRoots(): GlobalRoot[] {
	const roots: GlobalRoot[] = [];

	try {
		roots.push({ manager: "npm", packages: globalDirectory.npm.packages });
		roots.push({
			manager: "pnpm",
			packages: globalDirectory.pnpm.packages,
		});
	} catch (error) {
		LOGGER.debug(
			`Failed to resolve npm/pnpm global directories: ${extractErrorMessage(error)}`,
		);
	}

	const bunInstall =
		process.env.BUN_INSTALL ?? path.join(os.homedir(), ".bun");

	roots.push({
		manager: "bun",
		packages: path.join(bunInstall, "install", "global", "node_modules"),
	});

	return roots;
}

/**
 * Resolves a symlinked match to its real path so links pointing at the same package are not mistaken for a conflict.
 *
 * @param target The path to resolve to its real on-disk location.
 *
 * @returns The resolved real path, or the original target when resolution fails.
 */
function resolveRealpath(target: string): string {
	try {
		return fs.realpathSync(target);
	} catch {
		return target;
	}
}

/**
 * Collapses matches that resolve to the same on-disk package. Distinct targets remain as a genuine conflict.
 *
 * @param matches The candidate matches to deduplicate by real path.
 *
 * @returns The matches with same-package duplicates removed.
 */
function dedupeByRealpath(matches: PluginMatch[]): PluginMatch[] {
	const byTarget = new Map<string, PluginMatch>();

	for (const match of matches) {
		const real = resolveRealpath(match.path);

		if (!byTarget.has(real)) byTarget.set(real, match);
	}

	return [...byTarget.values()];
}

/**
 * Locates a plugin id across every global site. `missing` carries the searched roots for a helpful error, while `conflict` carries the distinct matches when two managers hold different packages under the same id.
 *
 * @param moduleName The plugin package name to locate.
 *
 * @returns The resolution outcome: found, missing, or conflict.
 */
function pluginRoot(moduleName: string): PluginLocation {
	const searched = globalPackageRoots();
	const matches: PluginMatch[] = [];

	for (const root of searched) {
		if (!fs.pathExistsSync(root.packages)) continue;

		const candidate = path.join(root.packages, moduleName);

		if (fs.pathExistsSync(candidate))
			matches.push({ manager: root.manager, path: candidate });
	}

	if (!matches.length) return { kind: "missing", searched };

	const distinct = dedupeByRealpath(matches);

	if (distinct.length > 1) return { kind: "conflict", matches: distinct };

	return { kind: "found", path: distinct[0]!.path };
}

/**
 * Builds a human-facing "where did we look, how do I install it" message for an unresolved plugin.
 *
 * @param id The plugin package name that was not found.
 * @param searched The global roots that were searched.
 *
 * @returns A message listing the searched locations and install hints.
 */
function describeMissing(id: string, searched: GlobalRoot[]): string {
	const locations = searched
		.map((root) => `    - ${root.manager}: ${root.packages}`)
		.join("\n");

	return (
		`Plugin \`${id}\` not found in any global package directory. Searched:\n${locations}\n` +
		`Install it globally with one of:\n` +
		`    npm i -g ${id}    (or \`npm link\` from the package for local dev)\n` +
		`    bun add -g ${id}  (or \`bun link\` from the package for local dev)`
	);
}

/**
 * Builds a human-facing "remove one of these" message when the same id resolves to different packages.
 *
 * @param id The plugin package name that resolved ambiguously.
 * @param matches The distinct packages found under the same id.
 *
 * @returns A message listing the conflicting locations and removal hints.
 */
function describeConflict(id: string, matches: PluginMatch[]): string {
	const locations = matches
		.map((match) => `    - ${match.manager}: ${match.path}`)
		.join("\n");

	return (
		`Plugin \`${id}\` resolved to different packages in multiple global sites:\n${locations}\n` +
		`Frontier cannot choose between them. Remove all but one, e.g.:\n` +
		`    npm rm -g ${id}\n` +
		`    bun remove -g ${id}`
	);
}

/**
 * Resolves a plugin package's `./plugin` export to an absolute entry path, or `undefined` when no usable export exists.
 *
 * @param plugin The plugin package directory to resolve the entry from.
 *
 * @returns The absolute entry path, or `undefined` when no usable export exists.
 *
 * @throws When the package's `package.json` is present but cannot be parsed as JSON.
 */
function resolvePluginEntry(plugin: string): string | undefined {
	const packageFile = path.join(plugin, "package.json");

	if (!fs.pathExistsSync(packageFile)) return undefined;

	const packageData = fs.readJsonSync(packageFile);
	const exports = packageData?.exports;
	const entry = exports?.["./plugin"];

	if (!entry) return undefined;

	if (typeof entry === "string") return path.join(plugin, entry);

	if (isObject(entry)) {
		if (typeof entry.import === "string")
			return path.join(plugin, entry.import);

		if (typeof entry.default === "string")
			return path.join(plugin, entry.default);
	}

	return undefined;
}

/**
 * Reports whether a plugin's API `version` matches the core's {@link PLUGIN_API_VERSION}.
 *
 * @param version The plugin's reported API version.
 *
 * @returns Whether the version matches the core's API version.
 */
export function isCompatible(version: number): boolean {
	return version === PLUGIN_API_VERSION;
}

/**
 * Resolves and loads each plugin id, returning one {@link LoadedPlugin} outcome per id. In `inspect` mode metadata is reported without calling `register()`. Failures (missing, conflicting, uncompilable, or incompatible) become `FailedPlugin` entries rather than throwing, so one bad plugin never blocks the rest.
 *
 * @param plugins The plugin package names to resolve and load.
 * @param mode Whether to register routes or only report metadata.
 *
 * @returns One load outcome per requested plugin id.
 */
export async function loadPlugins(
	plugins: string[],
	mode: LoadMode = "register",
): Promise<LoadedPlugin[]> {
	const results: LoadedPlugin[] = [];

	for (const id of plugins) {
		const location = pluginRoot(id);

		if (location.kind === "missing") {
			const reason = describeMissing(id, location.searched);

			results.push({ id, status: "missing", reason });

			LOGGER.warn(reason);

			continue;
		}

		if (location.kind === "conflict") {
			const reason = describeConflict(id, location.matches);

			results.push({ id, status: "conflict", reason });

			LOGGER.error(reason);

			continue;
		}

		const entry = resolvePluginEntry(location.path);

		if (!entry) {
			results.push({
				id,
				status: "missing-export",
				reason: "missing './plugin' export in package.json",
			});

			LOGGER.warn(
				`Plugin \`${id}\` missing "./plugin" export in \`package.json\`. See \`.devtools\` docs for plugin requirements.`,
			);

			continue;
		}

		const url = pathToFileURL(entry).href;

		let pluginModule;

		try {
			pluginModule = await import(url);
		} catch (error) {
			const reason = extractErrorMessage(error);

			results.push({
				id,
				status: "import-error",
				reason,
			});

			LOGGER.warn(`Unable to import plugin \`${id}\`: ${reason}`);

			continue;
		}

		const plugin = pluginModule.default as PluginDefinition | undefined;

		if (!plugin) {
			results.push({
				id,
				status: "invalid-export",
				reason: "default export not found or not a valid plugin",
			});

			LOGGER.warn(`Plugin \`${id}\` default export not found or invalid`);

			continue;
		}

		if (!isCompatible(plugin.version)) {
			const reason = `API version mismatch: plugin uses v${plugin.version}, core requires v${PLUGIN_API_VERSION}`;

			results.push({
				id,
				status: "incompatible",
				reason,
			});

			LOGGER.warn(
				`${reason}\n` +
					`  Plugin developer: Update plugin to API v${PLUGIN_API_VERSION}\n` +
					`  Plugin user: Check for updated version of ${id}`,
			);

			continue;
		}

		// in inspect mode, do not call register, only report metadata
		if (mode === "inspect") {
			results.push({
				id,
				status: "active",
				apiVersion: plugin.version,
				metadata: {
					name: plugin.name,
					description: plugin.description,
					command: plugin.command,
				},
				routes: [],
			});

			continue;
		}

		let registration;

		try {
			registration = await plugin.register();
		} catch (error) {
			results.push({
				id,
				status: "import-error",
				reason: `register() threw: ${extractErrorMessage(error)}`,
			});

			continue;
		}

		results.push({
			id,
			status: "active",
			apiVersion: plugin.version,
			metadata: {
				name: plugin.name,
				description: plugin.description,
				command: plugin.command,
			},
			routes: registration.routes,
			defaultRoute: registration.defaultRoute,
		});

		LOGGER.debug(
			`Loaded plugin: \`${plugin.name}\` (${registration.routes.length} routes)`,
		);
	}

	return results;
}
