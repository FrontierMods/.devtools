# @frmds/frontier

## 0.8.1

### Patch Changes

- f3d1b8d: Add `filter` support to the `merge` patch operation: merges `value` into every array item that matches the filter

    Validate every patch operation against its schema: unknown fields, `key` with `path`, and `drop` without exactly one of `value` or a non-empty `filter` now fail the build

- ff6fe97: Add 0.I-1 to the stable releases list

## 0.8.0

### Minor Changes

- e690fd8: Add object lookup tool: `frontier lookup <id>` to quickly find object(s) matching provided ID
  Rework object cache to accomodate the lookup tool

## 0.7.0

### Minor Changes

- 83d5995: Add mod versioning tool: uses Semantic Versioning to leverage `modinfo.json`'s `version` field

## 0.6.4

### Patch Changes

- Show stable version or short hash on `game` commands, align message text

## 0.6.3

### Patch Changes

- Add `result` to list of ID shapes, allow recipes to be resolved and transformed

## 0.6.2

### Patch Changes

- Allow `replace` patch to replace items by `filter`

## 0.6.1

### Patch Changes

- Fix JSON patch path not recognizing array indices
