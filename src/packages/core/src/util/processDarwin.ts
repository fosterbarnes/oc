// macOS process table through libproc (the calls `ps` and psutil use). `ps` cannot serve here: its
// `comm` column is argv[0] for many processes (`zsh`), not the executable path identity needs.
// The library opens on first call, so other platforms can import this module without touching FFI.
import { dlopen, FFIType, ptr } from "bun:ffi"

const _PROC_PIDTBSDINFO = 3
const _BSDINFO_SIZE = 136
const _PATH_MAX = 4096
// struct proc_bsdinfo (sys/proc_info.h): offsets of the fields read below.
const _STATUS = 4
const _PID = 12
const _PPID = 16
const _START_SEC = 120
const _START_USEC = 128
const _SZOMB = 5
// FILETIME (100 ns ticks since 1601-01-01) of the Unix epoch. Darwin `created` uses the same unit as
// Windows CIM, so identity checks and spawn-window math stay platform-neutral.
const _FILETIME_UNIX_EPOCH = 116444736000000000n

const open = () =>
  dlopen("/usr/lib/libSystem.B.dylib", {
    proc_listallpids: { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    proc_pidinfo: { args: [FFIType.i32, FFIType.i32, FFIType.u64, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
    proc_pidpath: { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  }).symbols
let _lib: ReturnType<typeof open> | undefined
const lib = () => (_lib ??= open())

export type DarwinProcess = {
  pid: number
  parentPid: number
  executable: string
  startedAt: number
  created: string
}

const info = new Uint8Array(_BSDINFO_SIZE)
const infoView = new DataView(info.buffer)
const pathBuffer = new Uint8Array(_PATH_MAX)

/** One live process, or undefined when the pid is free, a zombie, or not readable. */
export function read(pid: number): DarwinProcess | undefined {
  if (lib().proc_pidinfo(pid, _PROC_PIDTBSDINFO, 0n, ptr(info), _BSDINFO_SIZE) !== _BSDINFO_SIZE) return undefined
  if (infoView.getUint32(_PID, true) !== pid || infoView.getUint32(_STATUS, true) === _SZOMB) return undefined
  const sec = infoView.getBigUint64(_START_SEC, true)
  const usec = infoView.getBigUint64(_START_USEC, true)
  // Other users' processes refuse proc_pidpath; they keep an empty path like CIM's protected rows.
  const length = lib().proc_pidpath(pid, ptr(pathBuffer), _PATH_MAX)
  return {
    pid,
    parentPid: infoView.getUint32(_PPID, true),
    executable: length > 0 ? new TextDecoder().decode(pathBuffer.subarray(0, length)) : "",
    startedAt: Number(sec * 1000n + usec / 1000n),
    created: (_FILETIME_UNIX_EPOCH + sec * 10_000_000n + usec * 10n).toString(),
  }
}

export function list(): DarwinProcess[] {
  // Sized from a first count call plus headroom for processes started in between.
  const count = lib().proc_listallpids(null, 0)
  if (count <= 0) throw new Error("Failed to list processes: proc_listallpids")
  const pids = new Int32Array(count + 256)
  const found = lib().proc_listallpids(ptr(pids), pids.byteLength)
  if (found <= 0) throw new Error("Failed to list processes: proc_listallpids")
  return [...pids.subarray(0, found)].flatMap((pid) => {
    if (pid <= 0) return []
    const item = read(pid)
    return item ? [item] : []
  })
}

export * as ProcessDarwin from "./processDarwin"
