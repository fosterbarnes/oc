#!/usr/bin/env bun

import { $ } from "bun"

// Prettier only reads ./.gitignore by default; the main .gitignore is at the repo root, so pass it explicitly.
await $`bun run prettier --ignore-unknown --ignore-path ../.gitignore --ignore-path .prettierignore --write .`.cwd(
  `${import.meta.dir}/..`,
)
