# @frmds/transformers

## 1.0.6

### Patch Changes

- f3d1b8d: Add `filter` support to the `merge` patch operation: merges `value` into every array item that matches the filter

    Validate every patch operation against its schema: unknown fields, `key` with `path`, and `drop` without exactly one of `value` or a non-empty `filter` now fail the build

- Updated dependencies [f3d1b8d]
- Updated dependencies [ff6fe97]
    - @frmds/frontier@0.8.1

## 1.0.5

### Patch Changes

- Updated dependencies [e690fd8]
    - @frmds/frontier@0.8.0
    - @frmds/autodoc@0.8.4

## 1.0.4

### Patch Changes

- Updated dependencies [83d5995]
    - @frmds/frontier@0.7.0
    - @frmds/autodoc@0.8.2

## 1.0.3

### Patch Changes

- Add `result` to list of ID shapes, allow recipes to be resolved and transformed
- Updated dependencies
- Updated dependencies
    - @frmds/frontier@0.6.3

## 1.0.2

### Patch Changes

- Update magazine pouch transformer schema to only capture on pockets

## 1.0.1

### Patch Changes

- Fix `multi` schema to always capture `multi` pockets
