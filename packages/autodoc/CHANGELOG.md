# @frmds/autodoc

## 0.8.4

### Patch Changes

- e690fd8: Add object lookup tool: `frontier lookup <id>` to quickly find object(s) matching provided ID
  Rework object cache to accomodate the lookup tool
- Updated dependencies [e690fd8]
    - @frmds/frontier@0.8.0

## 0.8.3

### Patch Changes

- dd44a60: Skip transforming `mapgen` objects: we don't have the infrastructure to store them in object storage currently

## 0.8.2

### Patch Changes

- Updated dependencies [83d5995]
    - @frmds/frontier@0.7.0

## 0.8.1

### Patch Changes

- Derive length of items without `longest_side` to the nearest centimeter, just like the game does.
