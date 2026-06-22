/**
 * @file Shared build context holding the resolved configuration and mod resolver for the current run.
 */

import { ModResolver, type ResolvedConfig } from "@frmds/frontier";

/**
 * Resolved configuration for the active build.
 */
export let config: ResolvedConfig;

/**
 * Mod resolver derived from {@link config}.
 */
export let modResolver: ModResolver;

/**
 * Populates the shared {@link config} and {@link modResolver} from a resolved configuration.
 *
 * @param resolved The resolved configuration that seeds the context.
 */
export function initContext(resolved: ResolvedConfig): void {
	config = resolved;
	modResolver = new ModResolver(resolved);
}
