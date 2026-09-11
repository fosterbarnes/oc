export type Controller = {
  shutdown: () => void
  restart: () => void
}

let controller: Controller | undefined

export function setController(value: Controller) {
  controller = value
  return () => {
    if (controller === value) controller = undefined
  }
}

export function getController() {
  return controller
}

export * as ServerLifecycle from "./lifecycle"
