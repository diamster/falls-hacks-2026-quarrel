import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "@/components/settings-page";
import { DisplayPreferencesProvider, displayPreferencesKey, useDisplayPreferences } from "@/components/display-preferences";
import { useRoomClient } from "@/lib/room-client";
import type { RoomSnapshot } from "@/lib/room-types";

vi.mock("@/lib/room-client", () => ({ useRoomClient: vi.fn() }));
const mockedClient = vi.mocked(useRoomClient);
function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return { id: "settings-room", code: "ABC234", expiresAt: "2030-01-02T00:00:00Z", you: "A", players: [{ name: "Avery", slot: "A", ready: false, connected: true }, { name: "Blair", slot: "B", ready: false, connected: true }], bothReady: false, themeId: "courtroom", themeLocked: false, ...overrides };
}
function client(current: RoomSnapshot | null = room(), overrides = {}) {
  return { room: current, loading: false, pending: false, offline: false, live: true, error: "", refresh: vi.fn().mockResolvedValue(true), setTheme: vi.fn().mockResolvedValue(true), ...overrides } as unknown as ReturnType<typeof useRoomClient>;
}
function showSettings() { return render(<DisplayPreferencesProvider><SettingsPage/></DisplayPreferencesProvider>); }

beforeEach(() => { window.localStorage.clear(); mockedClient.mockReturnValue(client()); });

describe("Dedicated settings page", () => {
  it("lets only the host change the shared room theme and preserves the room return link", async () => {
    const user = userEvent.setup();
    const session = client(); mockedClient.mockReturnValue(session);
    showSettings();
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Courtroom theme" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Detective theme" }));
    expect(session.setTheme).toHaveBeenCalledExactlyOnceWith("detective");
    expect(screen.getByRole("link", { name: "Back to room" })).toHaveAttribute("href", "/?room=ABC234");
    expect(screen.getByRole("link", { name: "Return to your room" })).toHaveAttribute("href", "/?room=ABC234");
    expect(screen.queryByRole("button", { name: /ready|start debate|leave/i })).not.toBeInTheDocument();
  });

  it("shows the guest live updates without enabling shared theme changes", () => {
    let session = client(room({ you: "B", themeId: "jungle" })); mockedClient.mockReturnValue(session);
    const view = showSettings();
    expect(screen.getByRole("radio", { name: "Jungle theme" })).toHaveAttribute("aria-checked", "true");
    for (const card of screen.getAllByRole("radio")) expect(card).toBeDisabled();
    session = client(room({ you: "B", themeId: "superhero" })); mockedClient.mockReturnValue(session);
    view.rerender(<DisplayPreferencesProvider><SettingsPage/></DisplayPreferencesProvider>);
    expect(screen.getByRole("radio", { name: "Superhero theme" })).toHaveAttribute("aria-checked", "true");
    expect(session.setTheme).not.toHaveBeenCalled();
  });

  it("keeps the theme locked while personal display controls remain usable", async () => {
    const user = userEvent.setup(); const session = client(room({ themeLocked: true })); mockedClient.mockReturnValue(session);
    showSettings();
    for (const card of screen.getAllByRole("radio")) expect(card).toBeDisabled();
    expect(screen.getByText(/The debate has started, so its theme is locked/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Pause artwork animations/ }));
    expect(screen.getByRole("checkbox", { name: /Pause artwork animations/ })).toBeChecked();
    expect(session.setTheme).not.toHaveBeenCalled();
  });

  it("blocks theme writes when the session is offline and offers reconnection", async () => {
    const user = userEvent.setup(); const session = client(room(), { offline: true, live: false, error: "Connection lost." }); mockedClient.mockReturnValue(session);
    showSettings();
    for (const card of screen.getAllByRole("radio")) expect(card).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Connection lost.");
    await user.click(screen.getByRole("button", { name: "Try reconnecting" }));
    expect(session.refresh).toHaveBeenCalledExactlyOnceWith();
  });

  it("does not change a room during loading or while a theme update is pending", () => {
    let session = client(null, { loading: true }); mockedClient.mockReturnValue(session);
    const view = showSettings();
    expect(screen.getByText("Checking your room…")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    session = client(room(), { pending: true, live: false }); mockedClient.mockReturnValue(session);
    view.rerender(<DisplayPreferencesProvider><SettingsPage/></DisplayPreferencesProvider>);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-busy", "true");
    for (const card of screen.getAllByRole("radio")) expect(card).toBeDisabled();
    expect(screen.getByText(/Connecting live updates/)).toBeInTheDocument();
  });

  it("allows unaffiliated visitors to inspect all four preview cards and return to start", () => {
    const session = client(null); mockedClient.mockReturnValue(session); showSettings();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    for (const card of screen.getAllByRole("radio")) expect(card).toBeDisabled();
    expect(screen.getByRole("link", { name: "Back to start" })).toHaveAttribute("href", "/?start=1");
    expect(screen.getByRole("link", { name: "Return to start" })).toHaveAttribute("href", "/?start=1");
    expect(session.setTheme).not.toHaveBeenCalled();
  });
});

describe("Personal display preferences", () => {
  it("offers to play animations despite the device setting, disabled while Reduce motion is on", async () => {
    const user = userEvent.setup(); showSettings();
    const anyway = screen.getByRole("checkbox", { name: /Play animations even if my device asks for less motion/ });
    expect(anyway).not.toBeChecked();
    await user.click(anyway); expect(anyway).toBeChecked();
    expect(document.querySelector(".display-preferences")).toHaveAttribute("data-device-motion", "ignore");
    expect(JSON.parse(window.localStorage.getItem(displayPreferencesKey)!)).toMatchObject({ ignoreDeviceMotion: true });
    await user.click(screen.getByRole("checkbox", { name: /Reduce motion/ }));
    expect(anyway).toBeDisabled();
  });

  it("persists local display choices across remounts without calling room mutations", async () => {
    const user = userEvent.setup(); const session = client(); mockedClient.mockReturnValue(session);
    const view = showSettings();
    await user.click(screen.getByRole("checkbox", { name: /Pause artwork animations/ }));
    await user.click(screen.getByRole("checkbox", { name: /Reduce motion/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: /Dialogue and transcript text size/ }), "large");
    const wrapper = view.container.querySelector(".display-preferences");
    expect(wrapper).toHaveAttribute("data-pause-animations", "true");
    expect(wrapper).toHaveAttribute("data-reduced-motion", "true");
    expect(wrapper).toHaveAttribute("data-text-size", "large");
    expect(JSON.parse(window.localStorage.getItem(displayPreferencesKey)!)).toEqual({ pauseAnimations: true, reducedMotion: true, ignoreDeviceMotion: false, textSize: "large" });
    expect(session.setTheme).not.toHaveBeenCalled();
    view.unmount(); showSettings();
    expect(screen.getByRole("checkbox", { name: /Pause artwork animations/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Reduce motion/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /Dialogue and transcript text size/ })).toHaveValue("large");
    await user.selectOptions(screen.getByRole("combobox", { name: /Dialogue and transcript text size/ }), "standard");
    expect(JSON.parse(window.localStorage.getItem(displayPreferencesKey)!).textSize).toBe("standard");
  });

  it.each(["not json", "null", "[]", '"large"', '{"pauseAnimations":"yes","reducedMotion":1,"textSize":"giant","themeId":"superhero"}'])("ignores invalid saved preferences %s", saved => {
    window.localStorage.setItem(displayPreferencesKey, saved); const view = showSettings();
    expect(view.container.querySelector(".display-preferences")).toHaveAttribute("data-text-size", "standard");
    expect(screen.getByRole("checkbox", { name: /Pause artwork animations/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Reduce motion/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Courtroom theme" })).toHaveAttribute("aria-checked", "true");
  });

  it("synchronizes same-browser preferences from another tab and safely handles clearing them", () => {
    const view = showSettings();
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: displayPreferencesKey, newValue: '{"pauseAnimations":true,"textSize":"large"}' })); });
    expect(screen.getByRole("checkbox", { name: /Pause artwork animations/ })).toBeChecked();
    expect(view.container.querySelector(".display-preferences")).toHaveAttribute("data-text-size", "large");
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "{}" })); });
    expect(screen.getByRole("checkbox", { name: /Pause artwork animations/ })).toBeChecked();
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null })); });
    expect(screen.getByRole("checkbox", { name: /Pause artwork animations/ })).not.toBeChecked();
    expect(view.container.querySelector(".display-preferences")).toHaveAttribute("data-text-size", "standard");
  });

  it("still applies preferences when the browser refuses storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const user = userEvent.setup(); const view = showSettings();
    expect(screen.getByText(/Browser storage is unavailable/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Reduce motion/ }));
    expect(view.container.querySelector(".display-preferences")).toHaveAttribute("data-reduced-motion", "true");
  });

  it("sanitizes unexpected update values at the provider boundary", async () => {
    function Probe() {
      const { preferences, updatePreferences } = useDisplayPreferences();
      return <button onClick={() => updatePreferences({ textSize: "invalid" as "large" })}>{preferences.textSize}</button>;
    }
    render(<DisplayPreferencesProvider><Probe/></DisplayPreferencesProvider>);
    fireEvent.click(screen.getByRole("button", { name: "standard" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(displayPreferencesKey)!).textSize).toBe("standard"));
  });
});
