import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";

// Next enforces this boundary during bundling; unit tests run server modules
// directly and replace only the marker package, never their implementation.
vi.mock("server-only", () => ({}));

// Full pixel-art scenes can take more than the default second to render under
// shared-machine load. This allows async UI queries to settle; server deadlines,
// clock assertions and coverage thresholds remain unchanged.
configure({ asyncUtilTimeout: 5_000 });

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
