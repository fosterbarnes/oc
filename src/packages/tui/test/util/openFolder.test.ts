import { expect, test } from "bun:test"
import { folderOpener } from "../../src/util/openFolder"

test("opens folders with the platform file manager", () => {
  expect(folderOpener("C:\\work\\oc", "win32")).toEqual({ command: "explorer.exe", args: ["C:\\work\\oc"] })
  expect(folderOpener("/work/oc", "darwin")).toEqual({ command: "open", args: ["/work/oc"] })
  expect(folderOpener("/work/oc", "linux")).toEqual({ command: "xdg-open", args: ["/work/oc"] })
})
