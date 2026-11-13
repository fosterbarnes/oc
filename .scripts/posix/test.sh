#!/bin/sh
# POSIX port of the single-package path of ../test.ps1 for the shellbench A/B
# (docs/dev/shellBenchPlan.md, Test 3). test.ps1 stays the source of truth and the only runner for
# categories, -All, -List, several packages at once, and provider packages.
set -eu
. "$(dirname -- "$0")/scriptHelper.sh"

usage="test.sh -Package <package> [-File <test file>] [-Name '<test name regex>'] [-DryRun]"
package='' file='' name='' dryRun=''
while [ "$#" -gt 0 ]; do
    case $1 in
        -Package | -File | -Name)
            [ "$#" -ge 2 ] || fail "$usage"
            case $1 in
                -Package) package=$2 ;;
                -File) file=$2 ;;
                -Name) name=$2 ;;
            esac
            shift 2
            ;;
        -DryRun) dryRun=1 && shift ;;
        -h | -Help) printf '%s\n' "$usage" && exit 0 ;;
        *) fail "$usage" ;;
    esac
done
if [ -z "$package$file$name" ]; then
    printf '%s\n' "$usage"
    exit 0
fi
[ -n "$package" ] || fail '-File and -Name require exactly one -Package.'
# Same list as $unit in test.ps1; keep them in step.
case $package in
    cli | client | codemode | core | effect-drizzle-sqlite | http-recorder | httpapi-codegen | llm | opencode | protocol | schema | sdk/js | tui) ;;
    cursor-runtime) fail 'cursor-runtime runs under node --test: use test.ps1.' ;;
    *) fail "Unknown package: $package. Use test.ps1 -List." ;;
esac

directory=$repoRoot/src/packages/$package
testFile=''
if [ -n "$file" ]; then
    case $file in
        /*) candidate=$file ;;
        *) candidate=$directory/$file ;;
    esac
    # Lexical . and .. cleanup, like [IO.Path]::GetFullPath (no symlink resolution).
    candidate=$(printf '%s\n' "$candidate" | awk -F/ '{
        n = 0
        for (i = 1; i <= NF; i++) {
            if ($i == "" || $i == ".") continue
            if ($i == "..") { if (n) n--; continue }
            part[++n] = $i
        }
        path = ""
        for (i = 1; i <= n; i++) path = path "/" part[i]
        print (path == "" ? "/" : path)
    }')
    case $candidate in
        "$directory"/*) ;;
        *) fail '-File must be inside the selected package.' ;;
    esac
    [ -f "$candidate" ] || fail "Test file does not exist: $candidate"
    testFile=./${candidate#"$directory"/}
fi

set -- test --timeout 30000 --only-failures
[ -z "$name" ] || set -- "$@" --test-name-pattern "$name"
[ -z "$testFile" ] || set -- "$@" "$testFile"
if [ -n "$dryRun" ]; then
    printf 'cd %s && bun %s\n' "$directory" "$*"
    exit 0
fi

[ -d "$directory" ] || fail "Missing check directory: $directory"
command -v bun > /dev/null || fail 'bun is not on PATH.'
cd "$directory"
printf 'Running %s [unit]\n' "$package"
# Set for bun only, so the caller's environment never changes.
GITHUB_ACTIONS=false OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER=false bun "$@" || fail "$package failed (exit $?)."
printf 'Passed 1 local checks.\n'
closeOut
