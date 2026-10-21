import { expect, test } from "bun:test"
import { imagePreviewDetails, imageSizeLabel } from "../../src/component/dialog-image-preview"

// 1x1 PNG, same fixture as the paste submit test.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
)

test("details list name, size, and pixel dimensions", () => {
  expect(imagePreviewDetails("shot.png", PNG)).toBe(`shot.png · ${PNG.length} B · 1×1`)
})

test("details skip dimensions when the image cannot be decoded", () => {
  expect(imagePreviewDetails("clipboard", Buffer.from("not an image"))).toBe("clipboard · 12 B")
})

test("sizes use B, KB, and MB", () => {
  expect(imageSizeLabel(512)).toBe("512 B")
  expect(imageSizeLabel(2048)).toBe("2.0 KB")
  expect(imageSizeLabel(3 * 1024 * 1024)).toBe("3.0 MB")
})
