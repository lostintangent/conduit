import { nativeTheme } from "electron";
import { expect, it, vi } from "vitest";
import type { UserSettings } from "../model";
import watchSettings from "./startup";

const { settings } = vi.hoisted(() => ({
  settings: {
    get: () => ({ theme: "light" }) as UserSettings,
    watch: vi.fn((_onChange: (next: UserSettings) => void) => () => {}),
  },
}));

vi.mock("electron", () => ({ nativeTheme: { themeSource: "system" } }));
vi.mock("./settings", () => ({ settings }));
vi.mock("../../../main/events", () => ({ emitter: () => () => {} }));

it("has native menus and pages follow the theme at launch and after an outside edit", () => {
  watchSettings();
  expect(nativeTheme.themeSource).toBe("light");

  const [[onChange]] = settings.watch.mock.calls;
  onChange({ theme: "system" } as UserSettings);
  expect(nativeTheme.themeSource).toBe("system");
});
