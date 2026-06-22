/**
 * @file Generic mutable work queue for iterative process-and-mutate workloads.
 *
 * Provides safe iteration with deduplication, ordering, runaway detection, and cooperative cancellation. Designed for pipelines where processing one item can invalidate or produce new items.
 */

export interface WorkQueueOptions<T> {
	/**
	 * Derives a unique string key for deduplication.
	 *
	 * @param item The item to key.
	 *
	 * @returns The deduplication key.
	 */
	keyOf: (item: T) => string;
	/**
	 * Compares two items to order them after queue mutations.
	 *
	 * @param left The first item.
	 * @param right The second item.
	 *
	 * @returns A negative, zero, or positive number per standard comparator semantics.
	 */
	compare: (left: T, right: T) => number;
	/**
	 * Maximum total items yielded before throwing.
	 *
	 * @default 1000
	 */
	maxIterations?: number;
	/** Abort signal for cooperative cancellation. */
	signal?: AbortSignal;
	/** Label for error messages. Included in runaway/cancellation errors. */
	label?: string;
}

/**
 * Default ceiling on items yielded before runaway detection throws.
 */
const DEFAULT_MAX_ITERATIONS = 1000;

/**
 * Number of most-recent processed items retained for runaway diagnostics.
 */
const HISTORY_SIZE = 10;

export class WorkQueue<T> {
	private items: T[];
	private cursor = 0;
	private readonly keyOf: (item: T) => string;
	private readonly compare: (left: T, right: T) => number;
	private readonly maxIterations: number;
	private readonly signal?: AbortSignal;
	private readonly label?: string;
	private readonly history: T[] = [];

	/**
	 * Constructs a work queue from initial items and behavior options.
	 *
	 * @param items The initial items to seed the queue with.
	 * @param options The keying, ordering, limit, cancellation, and labeling options.
	 */
	constructor(items: T[], options: WorkQueueOptions<T>) {
		this.items = [...items];
		this.keyOf = options.keyOf;
		this.compare = options.compare;
		this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
		this.signal = options.signal;
		this.label = options.label;
	}

	/**
	 * Number of items yielded so far via {@link next()}.
	 *
	 * @returns The count of items already yielded.
	 */
	get processed(): number {
		return this.cursor;
	}

	/**
	 * Current total queue length (including already-processed items).
	 *
	 * @returns The total number of items in the queue.
	 */
	get size(): number {
		return this.items.length;
	}

	/**
	 * Whether there are more items to process.
	 *
	 * @returns `true` when the cursor has not reached the end of the queue.
	 */
	hasNext(): boolean {
		return this.cursor < this.items.length;
	}

	/**
	 * Returns the next item and advances the cursor.
	 * Checks cancellation and iteration limits before yielding.
	 *
	 * @returns The next item in the queue.
	 *
	 * @throws Error if the signal is aborted.
	 * @throws Error if the iteration limit is exceeded, with diagnostic context.
	 * @throws Error if no items remain to yield.
	 */
	next(): T {
		if (this.signal?.aborted) {
			const suffix = this.label ? ` (${this.label})` : "";

			throw new Error(`WorkQueue: aborted${suffix}`);
		}

		if (this.cursor >= this.maxIterations) {
			const current = this.items[this.cursor];
			const suffix = this.label ? ` (${this.label})` : "";

			const recent = this.history
				.map((item) => this.keyOf(item))
				.join(", ");

			throw new Error(
				`WorkQueue: exceeded ${this.maxIterations} iterations${suffix}\n` +
					`  Queue size: ${this.items.length}\n` +
					`  Current item: ${current ? this.keyOf(current) : "<none>"}\n` +
					`  Last ${this.history.length} processed: ${recent}`,
			);
		}

		if (this.cursor >= this.items.length) {
			const suffix = this.label ? ` (${this.label})` : "";

			throw new Error(`WorkQueue: no more items${suffix}`);
		}

		const item = this.items[this.cursor++]!;

		this.history.push(item);

		if (this.history.length > HISTORY_SIZE) this.history.shift();

		return item;
	}

	/**
	 * Returns the items remaining after the current cursor position.
	 * Returns a shallow copy.
	 *
	 * @returns A shallow copy of the unprocessed items.
	 */
	remaining(): T[] {
		return this.items.slice(this.cursor);
	}

	/**
	 * Replaces the remaining queue with kept items plus new additions.
	 *
	 * @param kept The unprocessed items to retain.
	 * @param additions The new items to append before deduplication and sorting.
	 */
	update(kept: T[], additions: T[]): void {
		const merged = [...kept, ...additions];

		const seen = new Set<string>();
		const deduplicated: T[] = [];

		for (const item of merged) {
			const key = this.keyOf(item);

			if (!seen.has(key)) {
				seen.add(key);
				deduplicated.push(item);
			}
		}

		deduplicated.sort(this.compare);

		// Replace remaining items (keep processed prefix intact)
		this.items = [...this.items.slice(0, this.cursor), ...deduplicated];
	}
}
