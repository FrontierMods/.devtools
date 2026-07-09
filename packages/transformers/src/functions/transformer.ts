/**
 * @file The `functions` transformer: matches function invocations via {@link FunctionInvocationSchema} and substitutes the looked-up definition's body.
 */

import { assertSchema, type Transformer } from "@frmds/autodoc";
import { makeKey } from "@frmds/frontier";
import {
	createBindings,
	substitute,
	validateArgumentCount,
	validateArgumentTypes,
	validateFunctionDefinition,
} from "./engine.ts";
import {
	FunctionInvocationSchema,
	FunctionObjectSchema,
	type FunctionInvocation,
} from "./schema.ts";

/**
 * The `functions` transformer.
 */
const FUNCTION_TRANSFORMER: Transformer<FunctionInvocation> = {
	name: "resolveFunctions",
	version: "1.0.0",
	api: "1.0.0",
	description: "Resolves function invocations by substituting arguments",
	target: { content: FunctionInvocationSchema },

	extractDependencies(value, context) {
		return [makeKey(value.fn, "FUNCTION", context.modId)];
	},

	transform(value, context) {
		const fnDef = context.objects.get(value.fn, "FUNCTION", context.scope);

		if (!fnDef)
			throw new Error(
				`Function not found: ${value.fn}\n` +
					`  at: ${context.modId}:${context.sourcePath} (object: ${context.currentObject.id})`,
			);

		assertSchema(
			FunctionObjectSchema,
			fnDef,
			`Invalid function definition structure for ${value.fn}`,
		);

		validateFunctionDefinition(fnDef, context);
		validateArgumentCount(value, fnDef, context);
		validateArgumentTypes(value, fnDef, context);

		const bindings = createBindings(value.args, fnDef.args);
		const template = structuredClone(fnDef.returns);
		const result = substitute(template, bindings);

		return [{ op: "replace", value: result }];
	},
};

export default FUNCTION_TRANSFORMER;
