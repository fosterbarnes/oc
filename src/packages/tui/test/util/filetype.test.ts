import { describe, expect, test } from "bun:test"
import { filetype } from "../../src/util/filetype"

describe("util.filetype", () => {
  test("maps filenames to presentation languages", () => {
    expect(filetype("component.tsx")).toBe("typescript")
    expect(filetype("script.js")).toBe("typescript")
    expect(filetype("main.py")).toBe("python")
    for (const extension of ["cppm", "ccm", "cxxm", "c++m", "ixx"]) {
      expect(filetype(`module.${extension}`)).toBe("cpp")
    }
    expect(filetype("README.unknown")).toBeUndefined()
  })

  test("uses none for missing filenames", () => {
    expect(filetype()).toBe("none")
    expect(filetype("")).toBe("none")
  })
})
