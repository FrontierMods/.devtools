/**
 * @file Shared quantity glue over the third-party `@quantities` libs: the base extended with `toCompound`.
 *
 * Every transformer emitting canonical metric or currency values goes through this constructor.
 */

import BaseQuantity from "@quantities/core";
import toCompoundExtension from "@quantities/to-compound";

/** An instance produced by {@link Quantity}. */
export type Quantity = ReturnType<typeof Quantity>;

/** The `@quantities` base extended with `toCompound`. */
export const Quantity = BaseQuantity.extend(toCompoundExtension);
