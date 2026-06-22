/**
 * @file Resolves the toolkit's OS app-data directories. Single owner of `env-paths`.
 */

import envPaths from "env-paths";

/**
 * Resolved OS app-data directories for the toolkit, under the `.frontier` namespace.
 */
export interface AppPaths {
	/** Directory for user config. */
	config: string;
	/** Directory for regenerable caches. */
	cache: string;
	/** Directory for persistent data. */
	data: string;
}

/**
 * `suffix: ""` avoids env-paths' default `-nodejs` suffix on the directory name.
 */
const ENV_PATHS_OPTIONS = { suffix: "" };

/**
 * Resolves the toolkit's app-data directories.
 * Useful for configs or other persistent data a toolkit app needs to store.
 *
 * @returns The resolved config, cache, and data directories under the `.frontier` namespace.
 */
export function appPaths(): AppPaths {
	const paths = envPaths(".frontier", ENV_PATHS_OPTIONS);

	return {
		config: paths.config,
		cache: paths.cache,
		data: paths.data,
	};
}
