---
"@frmds/transformers": patch
"@frmds/frontier": patch
---

Add `filter` support to the `merge` patch operation: merges `value` into every array item that matches the filter

Validate every patch operation against its schema: unknown fields, `key` with `path`, and `drop` without exactly one of `value` or a non-empty `filter` now fail the build
