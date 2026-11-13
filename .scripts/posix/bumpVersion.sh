#!/bin/sh
# POSIX port of ../bumpVersion.ps1 for the shellbench A/B (docs/dev/shellBenchPlan.md, Test 2).
# The ps1 stays the source of truth. Usage: bumpVersion.sh [--reroll-tag]
set -eu
. "$(dirname -- "$0")/scriptHelper.sh"

case ${1-} in
    --reroll-tag)
        # Assigned first: a failing $(...) inside printf's arguments would not stop set -e.
        tag=$(newVersionTag)
        printf 'Version tag %s\n' "$tag"
        ;;
    '') incrementMaintenancePatch ;;
    *) fail 'Usage: bumpVersion.sh [--reroll-tag]' ;;
esac
