/**
 * @file Generic dependency graph utilities: topological sort (Kahn's algorithm) and transitive closure (BFS).
 */

import type { ObjectID } from "../types/data.ts";
import { DependencySortError } from "./error.ts";

/**
 * Options for sortByDependencies.
 */
export interface SortByDependenciesOptions {
	/**
	 * If true, treat dependencies not in items as "already satisfied".
	 * If false (default), throw error when dependency not found in items.
	 *
	 * Use relaxed mode for sorting subsets where dependencies may exist outside the set (e.g., game objects depending on objects from other mods).
	 *
	 * @default false
	 */
	relaxed?: boolean;
}

/**
 * Sorts items by their dependencies using Kahn's topological sort algorithm.
 *
 * Items are returned in dependency order: dependencies appear before dependents.
 *
 * **By default, all dependencies must exist in the input set.** Use `relaxed: true` to allow dependencies outside the set (e.g., cross-mod object dependencies).
 *
 * @param items Array of items to sort.
 * @param getId Extracts the unique identifier from an item.
 * @param getDependencies Extracts dependency identifiers from an item (can return array or Set).
 * @param options Optional configuration.
 *
 * @returns Items sorted in dependency order
 *
 * @throws DependencySortError if circular dependency detected or missing dependency found
 *
 * @example
 * ```typescript
 * // Sort transformers (strict by default)
 * const sorted = sortByDependencies(
 *   transformers,
 *   t => t.name,
 *   t => t.dependencies || []
 * );
 *
 * // Sort game objects (allow cross-mod dependencies)
 * const sorted = sortByDependencies(
 *   objects,
 *   obj => makeKey(obj.id, obj.type, modId),
 *   obj => Array.from(extractDependencies(obj, registry, scope, modId)),
 *   { relaxed: true }
 * );
 * ```
 */
export function sortByDependencies<T>(
	items: T[],
	getId: (item: T) => string,
	getDependencies: (item: T) => string[] | Set<string>,
	options?: SortByDependenciesOptions,
): T[] {
	const relaxed = options?.relaxed ?? false;
	const itemMap = new Map<ObjectID, T>();

	// item id → dependency ids
	const graph = new Map<ObjectID, Set<ObjectID>>();
	// dependency id → dependent ids
	const reverseGraph = new Map<ObjectID, Set<ObjectID>>();
	// item id → number of dependencies
	const inDegree = new Map<ObjectID, number>();

	// Phase 1: Build item map and extract dependencies
	for (const item of items) {
		const id = getId(item);

		// Check for duplicate IDs
		if (itemMap.has(id))
			throw new DependencySortError(
				`Duplicate item ID detected: ${id}\n\n` +
					`Each item must have a unique identifier.`,
				[id],
				"cycle",
			);

		itemMap.set(id, item);

		// Extract dependencies
		const dependencies = getDependencies(item);

		graph.set(id, new Set(dependencies));

		// Initialize reverse graph entry
		if (!reverseGraph.has(id)) reverseGraph.set(id, new Set());
	}

	// Phase 2: Initialize in-degrees and build reverse graph
	for (const id of itemMap.keys()) inDegree.set(id, 0);

	for (const [itemId, dependencies] of graph) {
		// Set in-degree to number of dependencies
		inDegree.set(itemId, dependencies.size);

		// Build reverse edges: depId → itemId
		for (const dependencyId of dependencies) {
			// Check if dependency exists
			if (!itemMap.has(dependencyId)) {
				if (relaxed) {
					// Relaxed mode: treat missing as "already satisfied"
					// Add to in-degree map with 0 (no dependencies)
					if (!inDegree.has(dependencyId))
						inDegree.set(dependencyId, 0);
				} else {
					throw new DependencySortError(
						`Missing dependency detected.\n\n` +
							`Item "${itemId}" depends on "${dependencyId}" which was not found in the input.\n\n` +
							`Available items:\n` +
							Array.from(itemMap.keys())
								.map((id) => `  - ${id}`)
								.join("\n"),
						[dependencyId],
						"missing",
					);
				}
			}

			// Add reverse edge
			if (!reverseGraph.has(dependencyId))
				reverseGraph.set(dependencyId, new Set());

			reverseGraph.get(dependencyId)!.add(itemId);
		}
	}

	// Phase 3: Find items with no dependencies (starting points)
	const queue: string[] = [];

	for (const [id, degree] of inDegree) if (!degree) queue.push(id);

	// Phase 4: Process queue (Kahn's algorithm)
	const sorted: T[] = [];

	while (queue.length) {
		const id = queue.shift()!;
		const item = itemMap.get(id);

		// Add item to sorted result (skip external dependencies in relaxed mode)
		if (item) sorted.push(item);

		// For each item that depends on this one, decrement its in-degree
		const dependents = reverseGraph.get(id) || new Set();

		for (const dependentId of dependents) {
			const newDegree = (inDegree.get(dependentId) || 0) - 1;

			inDegree.set(dependentId, newDegree);

			if (newDegree === 0) queue.push(dependentId);
		}
	}

	// Phase 5: Check for cycles
	if (sorted.length !== itemMap.size) {
		// Find unprocessed items (involved in cycle)
		const processed = new Set(sorted.map((item) => getId(item)));

		const unprocessed = Array.from(itemMap.entries())
			.filter(([id]) => !processed.has(id))
			.map(([id]) => id);

		// Build dependency details for error message
		const dependencyDetails = unprocessed
			.map((id) => {
				const dependencies = Array.from(graph.get(id) || []);

				return `  - ${id}\n      depends on: ${
					dependencies.length ? dependencies.join(", ") : "(none)"
				}`;
			})
			.join("\n");

		throw new DependencySortError(
			`Circular dependency detected. Cannot determine processing order.\n\n` +
				`Items involved in cycle:\n` +
				dependencyDetails +
				`\n\nCheck for circular dependency chains between these items.`,
			unprocessed,
			"cycle",
		);
	}

	return sorted;
}

/**
 * Computes the transitive closure of dependencies using BFS.
 *
 * Starting from a set of IDs, finds all transitively reachable IDs by following edges returned by the `getEdges` function.
 *
 * @param startIds Initial IDs to expand from.
 * @param getEdges Returns direct dependencies for an ID. Returns undefined or empty iterable if ID has no edges.
 *
 * @returns Set of all transitively reachable IDs (excludes start IDs unless they're reachable via cycles)
 *
 * @example
 * ```typescript
 * // Given: A depends on B, B depends on C
 * const deps = new Map([
 *   ["A", ["B"]],
 *   ["B", ["C"]],
 *   ["C", []],
 * ]);
 *
 * const closure = getTransitiveClosure(
 *   ["A"],
 *   (id) => deps.get(id)
 * );
 * // → Set { "B", "C" }
 *
 * // Works with any iterable for edges
 * const closure2 = getTransitiveClosure(
 *   ["A", "B"],
 *   (id) => someMap.get(id)?.dependencies
 * );
 * ```
 */
export function getTransitiveClosure<T extends string>(
	startIds: Iterable<T>,
	getEdges: (id: T) => Iterable<T> | undefined,
): Set<T> {
	const closure = new Set<T>();
	const queue = [...startIds];

	while (queue.length) {
		const id = queue.shift()!;

		if (closure.has(id)) continue;

		closure.add(id);

		const edges = getEdges(id);

		if (edges)
			for (const edge of edges) if (!closure.has(edge)) queue.push(edge);
	}

	// Remove start IDs from closure (they're not dependencies of themselves)
	for (const startId of startIds) closure.delete(startId);

	return closure;
}
