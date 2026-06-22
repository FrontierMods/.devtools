/**
 * @file Shared module-level constants for the toolkit core.
 */

/**
 * Mod ID for the core *Cataclysm: Dark Days Ahead* mod.
 */
export const BASE_GAME_MOD_ID = "dda";

/**
 * Directory name for Frontier build artifacts and caches.
 */
export const FRONTIER_CACHE_DIR = ".frontier";

/**
 * LMDB namespace prefix for cache metadata.
 * Stores version info, file tracking, and validation data.
 */
export const META_NAMESPACE = "__meta__";

/**
 * Filename of the per-mod config that opts a mod into the toolkit.
 */
export const MOD_CONFIG_FILENAME = "frontier.json5";

/**
 * Default input and output directories used when a mod config omits them.
 */
export const PATH_DEFAULTS = {
	input: "./src",
	output: "./json",
} as const;

// TODO: derive from game's own schema once we can access that
/**
 * List of categories mods can belong to. The game uses these to sort mods under category headings in the mod selector UI.
 */
export const CATEGORIES = [
	"content",
	"total_conversion",
	"items",
	"creatures",
	"misc_additions",
	"buildings",
	"vehicles",
	"rebalance",
	"magical",
	"item_exclude",
	"monster_exclude",
	"graphical",
] as const;
