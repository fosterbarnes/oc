import type * as Arr from "effect/Array"
import { NodeFileSystem, NodeSink, NodeStream } from "@effect/platform-node"
import * as NodePath from "@effect/platform-node/NodePath"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as PlatformError from "effect/PlatformError"
import * as Predicate from "effect/Predicate"
import type * as Scope from "effect/Scope"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import {
  ChildProcessSpawner,
  ExitCode,
  make as makeSpawner,
  makeHandle,
  ProcessId,
} from "effect/unstable/process/ChildProcessSpawner"
import * as NodeChildProcess from "node:child_process"
import { dirname, join } from "node:path"
import * as NodeNet from "node:net"
import { randomUUID } from "node:crypto"
import { PassThrough } from "node:stream"
import launch from "cross-spawn"
import { makeGlobalNode } from "./effect/app-node"
import { filesystem, path } from "./effect/app-node-platform"

const toError = (err: unknown): Error => (err instanceof globalThis.Error ? err : new globalThis.Error(String(err)))

const toTag = (err: NodeJS.ErrnoException): PlatformError.SystemErrorTag => {
  switch (err.code) {
    case "ENOENT":
      return "NotFound"
    case "EACCES":
      return "PermissionDenied"
    case "EEXIST":
      return "AlreadyExists"
    case "EISDIR":
      return "BadResource"
    case "ENOTDIR":
      return "BadResource"
    case "EBUSY":
      return "Busy"
    case "ELOOP":
      return "BadResource"
    default:
      return "Unknown"
  }
}

const flatten = (command: ChildProcess.Command) => {
  const commands: Array<ChildProcess.StandardCommand> = []
  const opts: Array<ChildProcess.PipeOptions> = []

  const walk = (cmd: ChildProcess.Command): void => {
    switch (cmd._tag) {
      case "StandardCommand":
        commands.push(cmd)
        return
      case "PipedCommand":
        walk(cmd.left)
        opts.push(cmd.options)
        walk(cmd.right)
        return
    }
  }

  walk(command)
  if (commands.length === 0) throw new Error("flatten produced empty commands array")
  const [head, ...tail] = commands
  return {
    commands: [head, ...tail] as Arr.NonEmptyReadonlyArray<ChildProcess.StandardCommand>,
    opts,
  }
}

const toPlatformError = (
  method: string,
  err: NodeJS.ErrnoException,
  command: ChildProcess.Command,
): PlatformError.PlatformError => {
  const cmd = flatten(command)
    .commands.map((x) => `${x.command} ${x.args.join(" ")}`)
    .join(" | ")
  return PlatformError.systemError({
    _tag: toTag(err),
    module: "ChildProcess",
    method,
    pathOrDescriptor: cmd,
    syscall: err.syscall,
    cause: err,
  })
}

type ExitSignal = Deferred.Deferred<readonly [code: number | null, signal: NodeJS.Signals | null]>

const SUPERVISOR_VERSION = 1
const SUPERVISOR_REQUEST = 1
const SUPERVISOR_CANCEL = 2
const SUPERVISOR_READY = 3
const SUPERVISOR_ROOT_EXIT = 4
const SUPERVISOR_JOB_EMPTY = 5
const SUPERVISOR_FAILURE = 6

type SupervisorOptions = { readonly windowsSupervisorPath?: string }
type SupervisedExtra = { readonly fd: number; readonly type: "input" | "output"; readonly pipe: string }

const frame = (type: number, payload: Uint8Array) => {
  const out = Buffer.allocUnsafe(8 + payload.length)
  out.writeUInt16LE(SUPERVISOR_VERSION, 0)
  out.writeUInt16LE(type, 2)
  out.writeUInt32LE(payload.length, 4)
  Buffer.from(payload).copy(out, 8)
  return out
}

const field = (value: string) => {
  const bytes = Buffer.from(value, "utf8")
  const out = Buffer.allocUnsafe(4 + bytes.length)
  out.writeUInt32LE(bytes.length, 0)
  bytes.copy(out, 4)
  return out
}

const quoteWindowsArg = (arg: string) =>
  /^[^\s"]+$/.test(arg) ? arg : `"${arg.replaceAll(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, "$1$1")}"`

const commandLine = (command: string, args: ReadonlyArray<string>) => [command, ...args].map(quoteWindowsArg).join(" ")

const supervisorRequest = (
  command: string,
  args: ReadonlyArray<string>,
  opts: NodeChildProcess.SpawnOptions,
  descriptors: ReadonlyArray<SupervisedExtra>,
) => {
  const shell = opts.shell === true || typeof opts.shell === "string" || /\.(?:cmd|bat)$/i.test(command)
  const executable = shell
    ? typeof opts.shell === "string"
      ? opts.shell
      : globalThis.process.env.ComSpec || "cmd.exe"
    : command
  const executableArgs = shell ? ["/d", "/s", "/c", commandLine(command, args)] : args
  const shellPayload = opts.windowsVerbatimArguments
    ? [command, ...args].join(" ")
    : /\.(?:cmd|bat)$/i.test(command)
      ? `call ${commandLine(command, args)}`
      : commandLine(command, args)
  const fields = [
    field(executable),
    field(
      shell
        ? `${quoteWindowsArg(executable)} /d /s /c ${shellPayload}`
        : opts.windowsVerbatimArguments
          ? [quoteWindowsArg(executable), ...args].join(" ")
          : commandLine(executable, executableArgs),
    ),
    field(opts.cwd === undefined ? "" : String(opts.cwd)),
    field(opts.shell ? "shell" : "direct"),
    field(
      opts.env === undefined
        ? ""
        : `${Object.entries(opts.env)
            .map(([key, value]) => `${key}=${value}`)
            .join("\0")}\0\0`,
    ),
    field(descriptors.map((descriptor) => `${descriptor.fd}|${descriptor.type}|${descriptor.pipe}`).join("\n")),
  ]
  return Buffer.concat(fields)
}

const crossSpawnParse = launch as typeof launch & {
  _parse: (
    command: string,
    args: ReadonlyArray<string>,
    options: NodeChildProcess.SpawnOptions,
  ) => { command: string; args: ReadonlyArray<string>; options: NodeChildProcess.SpawnOptions; file?: string }
}

export const make = (supervisorOptions: SupervisorOptions = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const cwd = Effect.fnUntraced(function* (opts: ChildProcess.CommandOptions) {
      if (Predicate.isUndefined(opts.cwd)) return undefined
      yield* fs.access(opts.cwd)
      return path.resolve(opts.cwd)
    })

    const env = (opts: ChildProcess.CommandOptions) =>
      opts.extendEnv ? { ...globalThis.process.env, ...opts.env } : opts.env

    const input = (x: ChildProcess.CommandInput | undefined): NodeChildProcess.IOType | undefined =>
      Stream.isStream(x) ? "pipe" : x

    const output = (x: ChildProcess.CommandOutput | undefined): NodeChildProcess.IOType | undefined =>
      Sink.isSink(x) ? "pipe" : x

    const stdin = (opts: ChildProcess.CommandOptions): ChildProcess.StdinConfig => {
      const cfg: ChildProcess.StdinConfig = { stream: "pipe", encoding: "utf-8", endOnDone: true }
      if (Predicate.isUndefined(opts.stdin)) return cfg
      if (typeof opts.stdin === "string") return { ...cfg, stream: opts.stdin }
      if (Stream.isStream(opts.stdin)) return { ...cfg, stream: opts.stdin }
      return {
        stream: opts.stdin.stream,
        encoding: opts.stdin.encoding ?? cfg.encoding,
        endOnDone: opts.stdin.endOnDone ?? cfg.endOnDone,
      }
    }

    const stdio = (opts: ChildProcess.CommandOptions, key: "stdout" | "stderr"): ChildProcess.StdoutConfig => {
      const cfg = opts[key]
      if (Predicate.isUndefined(cfg)) return { stream: "pipe" }
      if (typeof cfg === "string") return { stream: cfg }
      if (Sink.isSink(cfg)) return { stream: cfg }
      return { stream: cfg.stream }
    }

    const fds = (opts: ChildProcess.CommandOptions) => {
      if (Predicate.isUndefined(opts.additionalFds)) return []
      return Object.entries(opts.additionalFds)
        .flatMap(([name, config]) => {
          const fd = ChildProcess.parseFdName(name)
          return Predicate.isUndefined(fd) ? [] : [{ fd, config }]
        })
        .toSorted((a, b) => a.fd - b.fd)
    }

    const stdios = (
      sin: ChildProcess.StdinConfig,
      sout: ChildProcess.StdoutConfig,
      serr: ChildProcess.StderrConfig,
      extra: ReadonlyArray<{ fd: number; config: ChildProcess.AdditionalFdConfig }>,
    ): NodeChildProcess.StdioOptions => {
      const pipe = (x: NodeChildProcess.IOType | undefined) =>
        process.platform === "win32" && x === "pipe" ? "overlapped" : x
      const arr: Array<NodeChildProcess.IOType | undefined> = [
        pipe(input(sin.stream)),
        pipe(output(sout.stream)),
        pipe(output(serr.stream)),
      ]
      if (extra.length === 0) return arr as NodeChildProcess.StdioOptions
      const max = extra.reduce((acc, x) => Math.max(acc, x.fd), 2)
      for (let i = 3; i <= max; i++) arr[i] = "ignore"
      for (const x of extra) arr[x.fd] = pipe("pipe")
      return arr as NodeChildProcess.StdioOptions
    }

    const setupFds = Effect.fnUntraced(function* (
      command: ChildProcess.StandardCommand,
      proc: NodeChildProcess.ChildProcess,
      extra: ReadonlyArray<{ fd: number; config: ChildProcess.AdditionalFdConfig }>,
      descriptorStreams: ReadonlyMap<number, NodeNet.Socket> | undefined,
    ) {
      if (extra.length === 0) {
        return {
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        }
      }

      const ins = new Map<number, Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError>>()
      const outs = new Map<number, Stream.Stream<Uint8Array, PlatformError.PlatformError>>()

      for (const x of extra) {
        const node = descriptorStreams?.get(x.fd) ?? proc.stdio[x.fd]
        switch (x.config.type) {
          case "input": {
            let sink: Sink.Sink<void, Uint8Array, never, PlatformError.PlatformError> = Sink.drain
            if (node && "write" in node) {
              sink = NodeSink.fromWritable({
                evaluate: () => node,
                onError: (err) => toPlatformError(`fromWritable(fd${x.fd})`, toError(err), command),
                endOnDone: true,
              })
            }
            if (x.config.stream) yield* Effect.forkScoped(Stream.run(x.config.stream, sink))
            ins.set(x.fd, sink)
            break
          }
          case "output": {
            let stream: Stream.Stream<Uint8Array, PlatformError.PlatformError> = Stream.empty
            if (node && "read" in node) {
              const tap = new PassThrough()
              node.on("error", (err) => tap.destroy(toError(err)))
              node.pipe(tap)
              stream = NodeStream.fromReadable({
                evaluate: () => tap,
                onError: (err) => toPlatformError(`fromReadable(fd${x.fd})`, toError(err), command),
              })
            }
            if (x.config.sink) stream = Stream.transduce(stream, x.config.sink)
            outs.set(x.fd, stream)
            break
          }
        }
      }

      return {
        getInputFd: (fd: number) => ins.get(fd) ?? Sink.drain,
        getOutputFd: (fd: number) => outs.get(fd) ?? Stream.empty,
      }
    })

    const setupStdin = (
      command: ChildProcess.StandardCommand,
      proc: NodeChildProcess.ChildProcess,
      cfg: ChildProcess.StdinConfig,
    ) =>
      Effect.suspend(() => {
        let sink: Sink.Sink<void, unknown, never, PlatformError.PlatformError> = Sink.drain
        if (Predicate.isNotNull(proc.stdin)) {
          sink = NodeSink.fromWritable({
            evaluate: () => proc.stdin!,
            onError: (err) => toPlatformError("fromWritable(stdin)", toError(err), command),
            endOnDone: cfg.endOnDone,
            encoding: cfg.encoding,
          })
        }
        if (Stream.isStream(cfg.stream)) return Effect.as(Effect.forkScoped(Stream.run(cfg.stream, sink)), sink)
        return Effect.succeed(sink)
      })

    const setupOutput = (
      command: ChildProcess.StandardCommand,
      proc: NodeChildProcess.ChildProcess,
      out: ChildProcess.StdoutConfig,
      err: ChildProcess.StderrConfig,
    ) => {
      let stdout = proc.stdout
        ? NodeStream.fromReadable({
            evaluate: () => proc.stdout!,
            onError: (cause) => toPlatformError("fromReadable(stdout)", toError(cause), command),
          })
        : Stream.empty
      let stderr = proc.stderr
        ? NodeStream.fromReadable({
            evaluate: () => proc.stderr!,
            onError: (cause) => toPlatformError("fromReadable(stderr)", toError(cause), command),
          })
        : Stream.empty

      if (Sink.isSink(out.stream)) stdout = Stream.transduce(stdout, out.stream)
      if (Sink.isSink(err.stream)) stderr = Stream.transduce(stderr, err.stream)

      return { stdout, stderr, all: Stream.merge(stdout, stderr) }
    }

    const supervisors = new WeakMap<
      NodeChildProcess.ChildProcess,
      () => Effect.Effect<void, PlatformError.PlatformError>
    >()

    const supervisorPath =
      supervisorOptions.windowsSupervisorPath ?? join(dirname(globalThis.process.execPath), "opencode-process-tree.exe")

    const spawnSupervised = (
      command: ChildProcess.StandardCommand,
      opts: NodeChildProcess.SpawnOptions,
      extra: ReadonlyArray<{ fd: number; config: ChildProcess.AdditionalFdConfig }>,
    ) =>
      Effect.callback<
        readonly [NodeChildProcess.ChildProcess, ExitSignal, number, ReadonlyMap<number, NodeNet.Socket> | undefined],
        PlatformError.PlatformError
      >((resume) => {
        const signal = Deferred.makeUnsafe<readonly [code: number | null, signal: NodeJS.Signals | null]>()
        const pipeName = `\\\\.\\pipe\\opencode-process-${randomUUID()}`
        let socket: NodeNet.Socket | undefined
        let proc: NodeChildProcess.ChildProcess | undefined
        let settled = false
        let rootPid: number | undefined
        let rootCode: number | undefined
        let buffer = Buffer.alloc(0)
        const descriptorStreams = new Map<number, NodeNet.Socket>()
        const descriptorPipeName = String.raw`\\.\pipe\opencode-process-fd-${randomUUID()}`
        const descriptorEntries = extra.map(
          (item) => ({ fd: item.fd, type: item.config.type, pipe: descriptorPipeName }) as SupervisedExtra,
        )
        let descriptorIndex = 0
        const descriptorServer =
          extra.length === 0
            ? undefined
            : NodeNet.createServer((connection) => {
                const item = extra[descriptorIndex++]
                if (item) descriptorStreams.set(item.fd, connection)
                else connection.destroy()
              })
        const server = NodeNet.createServer((connection) => {
          socket = connection
          connection.on("data", (chunk) => {
            buffer = Buffer.concat([buffer, chunk])
            while (buffer.length >= 8) {
              const size = buffer.readUInt32LE(4)
              if (size > 16 * 1024 * 1024 || buffer.length < size + 8) break
              const type = buffer.readUInt16LE(2)
              const payload = buffer.subarray(8, size + 8)
              buffer = buffer.subarray(size + 8)
              if (type === SUPERVISOR_READY && payload.length === 4) {
                if (settled) continue
                rootPid = payload.readUInt32LE(0)
                if (proc && rootPid !== undefined) {
                  settled = true
                  resume(Effect.succeed([proc, signal, rootPid, descriptorStreams]))
                }
                continue
              }
              if (type === SUPERVISOR_ROOT_EXIT && payload.length === 4) {
                rootCode = payload.readUInt32LE(0)
                continue
              }
              if (type === SUPERVISOR_JOB_EMPTY) {
                if (!settled) {
                  settled = true
                  Deferred.doneUnsafe(signal, Exit.succeed([rootCode ?? 1, null]))
                }
                continue
              }
              if (type === SUPERVISOR_FAILURE) {
                const error = new Error(new TextDecoder().decode(payload)) as NodeJS.ErrnoException
                error.code = "EPROTO"
                if (!settled) {
                  settled = true
                  resume(Effect.fail(toPlatformError("supervisor", error, command)))
                }
              }
            }
          })
          connection.once("close", () => {
            if (!settled) {
              settled = true
              const error = new Error("process supervisor control channel closed") as NodeJS.ErrnoException
              error.code = "EPROTO"
              resume(Effect.fail(toPlatformError("supervisor", error, command)))
            }
            if (!Deferred.isDoneUnsafe(signal)) {
              Deferred.doneUnsafe(signal, Exit.succeed(rootCode === undefined ? [null, "SIGTERM"] : [rootCode, null]))
            }
          })
          const prepared = crossSpawnParse._parse(command.command, command.args, opts)
          connection.write(
            frame(
              SUPERVISOR_REQUEST,
              supervisorRequest(
                prepared.options.windowsVerbatimArguments ? prepared.command : (prepared.file ?? prepared.command),
                prepared.args,
                prepared.options,
                descriptorEntries,
              ),
            ),
          )
        })
        const fail = (error: unknown) => {
          if (settled) return
          settled = true
          resume(Effect.fail(toPlatformError("supervisor", toError(error), command)))
        }
        server.once("error", fail)
        const cancel = () =>
          Effect.suspend(() => {
            if (Deferred.isDoneUnsafe(signal)) return Effect.void
            if (socket && !socket.destroyed) socket.write(frame(SUPERVISOR_CANCEL, Buffer.alloc(0)))
            return Effect.asVoid(Deferred.await(signal))
          })
        const start = () => {
          const stdio = Array.isArray(opts.stdio)
            ? opts.stdio.slice(0, 3)
            : [opts.stdio ?? "ignore", opts.stdio ?? "ignore", opts.stdio ?? "ignore"]
          const child = NodeChildProcess.spawn(supervisorPath, ["--control", pipeName], {
            stdio: stdio as NodeChildProcess.StdioOptions,
            windowsHide: false,
          })
          proc = child
          child.once("error", fail)
          child.once("exit", () => {
            if (!settled) fail(new Error("process supervisor exited before ready"))
          })
          supervisors.set(child, cancel)
        }
        if (!descriptorServer) {
          server.listen(pipeName, start)
        } else {
          descriptorServer.once("error", fail)
          descriptorServer.listen(descriptorPipeName, () => server.listen(pipeName, start))
        }
        return Effect.callback<void, never>((done) => {
          socket?.destroy()
          server.close()
          descriptorServer?.close()
          for (const stream of descriptorStreams.values()) stream.destroy()
          if (!proc || proc.killed) return done(Effect.void)
          proc.once("close", () => done(Effect.void))
        })
      })

    const spawn = (
      command: ChildProcess.StandardCommand,
      opts: NodeChildProcess.SpawnOptions,
      extra: ReadonlyArray<{ fd: number; config: ChildProcess.AdditionalFdConfig }>,
    ) => {
      if (globalThis.process.platform === "win32" && opts.windowsHide === true && opts.detached !== true) {
        return spawnSupervised(command, opts, extra)
      }
      return Effect.callback<
        readonly [NodeChildProcess.ChildProcess, ExitSignal, number, ReadonlyMap<number, NodeNet.Socket> | undefined],
        PlatformError.PlatformError
      >((resume) => {
        const signal = Deferred.makeUnsafe<readonly [code: number | null, signal: NodeJS.Signals | null]>()
        const proc = launch(command.command, command.args, opts)
        let end = false
        let exit: readonly [code: number | null, signal: NodeJS.Signals | null] | undefined
        proc.on("error", (err) => {
          resume(Effect.fail(toPlatformError("spawn", err, command)))
        })
        proc.on("exit", (...args) => {
          exit = args
        })
        proc.on("close", (...args) => {
          if (end) return
          end = true
          Deferred.doneUnsafe(signal, Exit.succeed(exit ?? args))
        })
        proc.on("spawn", () => {
          resume(Effect.succeed([proc, signal, proc.pid!, undefined]))
        })
        return Effect.sync(() => {
          proc.kill("SIGTERM")
        })
      })
    }

    const killGroup = (
      command: ChildProcess.StandardCommand,
      proc: NodeChildProcess.ChildProcess,
      signal: NodeJS.Signals,
    ) => {
      // Bun does not reliably hide console-based tree terminators on Windows.
      if (globalThis.process.platform === "win32") return killOne(command, proc, signal)

      return Effect.try({
        try: () => {
          globalThis.process.kill(-proc.pid!, signal)
        },
        catch: (err) => toPlatformError("kill", toError(err), command),
      })
    }

    const killOne = (
      command: ChildProcess.StandardCommand,
      proc: NodeChildProcess.ChildProcess,
      signal: NodeJS.Signals,
    ) =>
      Effect.suspend(() => {
        const supervised = supervisors.get(proc)
        if (supervised) return supervised()
        if (proc.kill(signal)) return Effect.void
        return Effect.fail(toPlatformError("kill", new Error("Failed to kill child process"), command))
      })

    const timeout =
      (
        proc: NodeChildProcess.ChildProcess,
        command: ChildProcess.StandardCommand,
        opts: ChildProcess.KillOptions | undefined,
      ) =>
      <A, E, R>(
        f: (
          command: ChildProcess.StandardCommand,
          proc: NodeChildProcess.ChildProcess,
          signal: NodeJS.Signals,
        ) => Effect.Effect<A, E, R>,
      ) => {
        const signal = opts?.killSignal ?? "SIGTERM"
        if (Predicate.isUndefined(opts?.forceKillAfter)) return f(command, proc, signal)
        return Effect.timeoutOrElse(f(command, proc, signal), {
          duration: opts.forceKillAfter,
          orElse: () => f(command, proc, "SIGKILL"),
        })
      }

    const source = (handle: ChildProcessHandle, from: ChildProcess.PipeFromOption | undefined) => {
      const opt = from ?? "stdout"
      switch (opt) {
        case "stdout":
          return handle.stdout
        case "stderr":
          return handle.stderr
        case "all":
          return handle.all
        default: {
          const fd = ChildProcess.parseFdName(opt)
          return Predicate.isNotUndefined(fd) ? handle.getOutputFd(fd) : handle.stdout
        }
      }
    }

    const spawnCommand: (
      command: ChildProcess.Command,
    ) => Effect.Effect<ChildProcessHandle, PlatformError.PlatformError, Scope.Scope> = Effect.fnUntraced(
      function* (command) {
        switch (command._tag) {
          case "StandardCommand": {
            const sin = stdin(command.options)
            const sout = stdio(command.options, "stdout")
            const serr = stdio(command.options, "stderr")
            const extra = fds(command.options)
            const dir = yield* cwd(command.options)

            const [proc, signal, pid, descriptorStreams] = yield* Effect.acquireRelease(
              spawn(
                command,
                {
                  cwd: dir,
                  env: env(command.options),
                  stdio: stdios(sin, sout, serr, extra),
                  detached: command.options.detached ?? process.platform !== "win32",
                  shell: command.options.shell,
                  windowsHide: process.platform === "win32",
                },
                extra,
              ),
              Effect.fnUntraced(function* ([proc, signal]) {
                const done = yield* Deferred.isDone(signal)
                const kill = timeout(proc, command, command.options)
                if (done) {
                  const [code] = yield* Deferred.await(signal)
                  if (process.platform === "win32") return yield* Effect.void
                  if (code !== 0 && Predicate.isNotNull(code)) return yield* Effect.ignore(kill(killGroup))
                  return yield* Effect.void
                }
                const send = (s: NodeJS.Signals) =>
                  Effect.catch(killGroup(command, proc, s), () => killOne(command, proc, s))
                const sig = command.options.killSignal ?? "SIGTERM"
                const attempt = send(sig).pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid)
                const escalated = command.options.forceKillAfter
                  ? Effect.timeoutOrElse(attempt, {
                      duration: command.options.forceKillAfter,
                      orElse: () => send("SIGKILL").pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid),
                    })
                  : attempt
                return yield* Effect.ignore(escalated)
              }),
            )

            const fd = yield* setupFds(command, proc, extra, descriptorStreams)
            const out = setupOutput(command, proc, sout, serr)
            let ref = true
            return makeHandle({
              pid: ProcessId(pid),
              stdin: yield* setupStdin(command, proc, sin),
              stdout: out.stdout,
              stderr: out.stderr,
              all: out.all,
              getInputFd: fd.getInputFd,
              getOutputFd: fd.getOutputFd,
              isRunning: Effect.map(Deferred.isDone(signal), (done) => !done),
              exitCode: Effect.flatMap(Deferred.await(signal), ([code, signal]) => {
                if (Predicate.isNotNull(code)) return Effect.succeed(ExitCode(code))
                return Effect.fail(
                  toPlatformError(
                    "exitCode",
                    new Error(`Process interrupted due to receipt of signal: '${signal}'`),
                    command,
                  ),
                )
              }),
              kill: (opts?: ChildProcess.KillOptions) => {
                const sig = opts?.killSignal ?? "SIGTERM"
                const send = (s: NodeJS.Signals) =>
                  Effect.catch(killGroup(command, proc, s), () => killOne(command, proc, s))
                const attempt = send(sig).pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid)
                if (!opts?.forceKillAfter) return attempt
                return Effect.timeoutOrElse(attempt, {
                  duration: opts.forceKillAfter,
                  orElse: () => send("SIGKILL").pipe(Effect.andThen(Deferred.await(signal)), Effect.asVoid),
                })
              },
              unref: Effect.sync(() => {
                if (ref) {
                  proc.unref()
                  ref = false
                }
                return Effect.sync(() => {
                  if (!ref) {
                    proc.ref()
                    ref = true
                  }
                })
              }),
            })
          }
          case "PipedCommand": {
            const flat = flatten(command)
            const [head, ...tail] = flat.commands
            let handle = spawnCommand(head)
            for (let i = 0; i < tail.length; i++) {
              const next = tail[i]
              const opts = flat.opts[i] ?? {}
              const sin = stdin(next.options)
              const stream = Stream.unwrap(Effect.map(handle, (x) => source(x, opts.from)))
              const to = opts.to ?? "stdin"
              if (to === "stdin") {
                handle = spawnCommand(
                  ChildProcess.make(next.command, next.args, {
                    ...next.options,
                    stdin: { ...sin, stream },
                  }),
                )
                continue
              }
              const fd = ChildProcess.parseFdName(to)
              if (Predicate.isUndefined(fd)) {
                handle = spawnCommand(
                  ChildProcess.make(next.command, next.args, {
                    ...next.options,
                    stdin: { ...sin, stream },
                  }),
                )
                continue
              }
              handle = spawnCommand(
                ChildProcess.make(next.command, next.args, {
                  ...next.options,
                  additionalFds: {
                    ...next.options.additionalFds,
                    [ChildProcess.fdName(fd) as `fd${number}`]: { type: "input", stream },
                  },
                }),
              )
            }
            return yield* handle
          }
        }
      },
    )

    return makeSpawner(spawnCommand)
  })

const layer: Layer.Layer<ChildProcessSpawner, never, FileSystem.FileSystem | Path.Path> = Layer.effect(
  ChildProcessSpawner,
  make(),
)

export const node = makeGlobalNode({ service: ChildProcessSpawner, layer, deps: [filesystem, path] })

export const nodeWithOptions = (options: SupervisorOptions) =>
  makeGlobalNode({
    service: ChildProcessSpawner,
    layer: Layer.effect(ChildProcessSpawner, make(options)),
    deps: [filesystem, path],
  })

export * as CrossSpawnSpawner from "./cross-spawn-spawner"
