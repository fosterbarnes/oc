// Pane entry for P4/P6/P7: loads the selected instrumentation, then the unchanged source CLI.
if (process.env.OC_PERF_SPINNER === "1") await import("./spinnerPreload")
if (process.env.OC_PERF_EVENTS === "1") await import("./eventPreload")
if (process.env.OC_PERF_GIT === "1") await import("./gitPreload")
await import("../../src/index")
