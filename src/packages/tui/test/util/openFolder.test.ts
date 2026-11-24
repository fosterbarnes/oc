import { expect, test } from "bun:test"
import { folderOpener } from "../../src/util/openFolder"

test("opens folders with the platform file manager", () => {
  // Quoted: Explorer splits an unquoted argument on commas.
  expect(folderOpener("C:\\work\\oc,backup\\", "win32")).toEqual({
    command: "explorer.exe",
    args: ['"C:\\work\\oc,backup"'],
    verbatim: true,
  })
  expect(folderOpener("C:\\", "win32")).toEqual({ command: "explorer.exe", args: ["C:\\"] })
  expect(folderOpener("/work/oc", "darwin")).toEqual({ command: "open", args: ["/work/oc"] })
  expect(folderOpener("/work/oc", "linux")).toEqual({ command: "xdg-open", args: ["/work/oc"] })
})
