import { getCommandRegistry, getContextKeyService } from "@/commands";
import { ContextKey } from "@/commands/contextKeys/ContextKey";
import { useMenu } from "@/commands/hooks/useMenu";
import { MenuId } from "@/commands/menus/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("useMenu", () => {
  const shown = new ContextKey<boolean>("useMenuTest.shown", false);
  const enabled = new ContextKey<boolean>("useMenuTest.enabled", false);
  const registrations: { dispose: () => void }[] = [];

  afterEach(() => {
    for (const registration of registrations.splice(0)) {
      registration.dispose();
    }
  });

  function register(
    id: string,
    menu: { group: string; order?: number; title?: string },
    clauses: { when?: typeof enabled; shownWhen?: typeof shown } = {},
  ) {
    registrations.push(
      getCommandRegistry().registerCommand({
        id,
        title: `${id} title`,
        when: clauses.when?.isTrue(),
        menu: {
          id: MenuId.QuickPane,
          ...menu,
          when: clauses.shownWhen?.isTrue(),
        },
        run: vi.fn(),
      }),
    );
  }

  const ours = (entries: ReturnType<typeof useMenu>) =>
    entries
      .filter((entry) => entry.commandId.startsWith("useMenuTest."))
      .map(({ commandId, title, enabled }) => ({ commandId, title, enabled }));

  it("shows items by their when and enables them by their command's, as the context changes", () => {
    getContextKeyService().setGlobal(shown.key, false);
    getContextKeyService().setGlobal(enabled.key, false);
    register("useMenuTest.close", { group: "2_close", title: "Close" });
    register(
      "useMenuTest.open",
      { group: "1_move", order: 2 },
      { when: enabled },
    );
    register(
      "useMenuTest.move",
      { group: "1_move", order: 1, title: "Move" },
      { shownWhen: shown },
    );

    const { result } = renderHook(() => useMenu(MenuId.QuickPane));
    expect(ours(result.current)).toEqual([
      {
        commandId: "useMenuTest.open",
        title: "useMenuTest.open title",
        enabled: false,
      },
      { commandId: "useMenuTest.close", title: "Close", enabled: true },
    ]);

    act(() => {
      getContextKeyService().setGlobal(shown.key, true);
      getContextKeyService().setGlobal(enabled.key, true);
    });
    expect(ours(result.current)).toEqual([
      { commandId: "useMenuTest.move", title: "Move", enabled: true },
      {
        commandId: "useMenuTest.open",
        title: "useMenuTest.open title",
        enabled: true,
      },
      { commandId: "useMenuTest.close", title: "Close", enabled: true },
    ]);
  });
});
