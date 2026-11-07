import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

// jsdom has no native dialog implementation. This shim supplies only the
// open/close DOM contract; it intentionally does not fake focus trapping,
// Escape handling, painting, or the browser's top layer.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

// Fail the suite on unexpected React errors/warnings instead of silently
// accepting a passing assertion alongside a broken render or missing key.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  expect(console.error, "unexpected console.error during component test").not.toHaveBeenCalled();
  expect(console.warn, "unexpected console.warn during component test").not.toHaveBeenCalled();
});
