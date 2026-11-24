import { expect, test } from "bun:test"
import { parseWindowsMachineGuid } from "../../../src/provider/cursor/protocol/deviceId"

// F36: the hash input once kept the `REG_SZ` type name, so Cursor saw a different machine than its CLI.
test("reads only the GUID from reg query output", () => {
  const out =
    "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    0A1B2C3D-0000-4000-8000-00000000ABCD\r\n\r\n"
  expect(parseWindowsMachineGuid(out)).toBe("0a1b2c3d-0000-4000-8000-00000000abcd")
  expect(parseWindowsMachineGuid("ERROR: The system was unable to find the specified registry key")).toBeUndefined()
})
