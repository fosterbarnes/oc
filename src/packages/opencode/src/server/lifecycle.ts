export type Controller = {
  shutdown: () => void
  restart: () => void
  markRestart?: () => Promise<void>
}

let controller: Controller | undefined
let draining = false

export function setController(value: Controller) {
  controller = value
  draining = false
  return () => {
    if (controller === value) controller = undefined
  }
}

export function getController() {
  return controller
}

export function isHealthy() {
  return !draining
}

export async function beginShutdown(restart: boolean) {
  draining = true
  if (restart) await controller?.markRestart?.()
}

export * as ServerLifecycle from "./lifecycle"
