/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCommandPaletteData } from "@/commands/commandPalette/useCommandPaletteData";
import { CommandRegistry } from "@/commands/core/CommandRegistryImpl";
import { ContextKeyService } from "@/commands/contextKeys/ContextKeyServiceImpl";
import { ContextKey } from "@/commands/contextKeys/ContextKey";
import { ContextLevel } from "@/commands/contextKeys/types";
import { When } from "@/commands/whenClauses/When";

describe("useCommandPaletteData", () => {
  let commandRegistry: CommandRegistry;
  let contextKeyService: ContextKeyService;

  beforeEach(() => {
    contextKeyService = new ContextKeyService();
    commandRegistry = new CommandRegistry(contextKeyService);
  });

  describe("basic functionality", () => {
    it("should return empty array when no commands registered", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current).toEqual([]);
    });

    it("should return all available commands", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Command 2",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current).toHaveLength(2);
      expect(result.current[0].id).toBe("cmd1");
      expect(result.current[1].id).toBe("cmd2");
    });

    it("should include command metadata", () => {
      commandRegistry.registerCommand({
        id: "test.cmd",
        title: "Test Command",
        category: "Testing",
        icon: "test-icon",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current[0]).toEqual({
        id: "test.cmd",
        title: "Test Command",
        category: "Testing",
        icon: "test-icon",
        enabled: true,
        whenClause: undefined,
      });
    });

    it("should mark all items as enabled", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Command 2",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current.every((item) => item.enabled)).toBe(true);
    });
  });

  describe("when clause filtering", () => {
    it("should filter out commands with false when clause", () => {
      const contextKey = new ContextKey("isActive", false, {
        level: ContextLevel.Global,
      });
      contextKeyService.registerKey(contextKey);
      contextKeyService.setGlobal("isActive", false);

      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        when: contextKey.isTrue(),
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Command 2",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      // Only cmd2 should be visible
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("cmd2");
    });

    it("should include commands with true when clause", () => {
      const contextKey = new ContextKey("isActive", true, {
        level: ContextLevel.Global,
      });
      contextKeyService.registerKey(contextKey);
      contextKeyService.setGlobal("isActive", true);

      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        when: contextKey.isTrue(),
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("cmd1");
    });

    it("should include commands with no when clause", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("cmd1");
    });

    it("should handle complex when clauses", () => {
      const key1 = new ContextKey("key1", true, { level: ContextLevel.Global });
      const key2 = new ContextKey("key2", false, {
        level: ContextLevel.Global,
      });
      contextKeyService.registerKey(key1);
      contextKeyService.registerKey(key2);
      contextKeyService.setGlobal("key1", true);
      contextKeyService.setGlobal("key2", false);

      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        when: When.and(key1.isTrue(), When.not(key2.isTrue())),
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("cmd1");
    });

    it("should include whenClause string in result", () => {
      const contextKey = new ContextKey("test", true, {
        level: ContextLevel.Global,
      });
      contextKeyService.registerKey(contextKey);
      contextKeyService.setGlobal("test", true);

      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        when: contextKey.isTrue(),
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current[0].whenClause).toBeTruthy();
      expect(typeof result.current[0].whenClause).toBe("string");
    });
  });

  describe("search filtering", () => {
    beforeEach(() => {
      commandRegistry.registerCommand({
        id: "terminal.clear",
        title: "Clear Terminal",
        category: "Terminal",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "editor.save",
        title: "Save File",
        category: "Editor",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "tab.close",
        title: "Close Tab",
        category: "Tab",
        run: () => {},
      });
    });

    it("should filter by title match", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "clear"),
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("terminal.clear");
    });

    it("should filter by category match", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "terminal"),
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("terminal.clear");
    });

    it("should be case-insensitive", () => {
      const { result: upperResult } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "CLEAR"),
      );
      const { result: lowerResult } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "clear"),
      );
      const { result: mixedResult } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "ClEaR"),
      );

      expect(upperResult.current).toHaveLength(1);
      expect(lowerResult.current).toHaveLength(1);
      expect(mixedResult.current).toHaveLength(1);
    });

    it("should match partial strings", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "cle"),
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].title).toBe("Clear Terminal");
    });

    it("should return all commands when search is empty", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current).toHaveLength(3);
    });

    it("should return empty array when no matches", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(
          commandRegistry,
          contextKeyService,
          "nonexistent",
        ),
      );

      expect(result.current).toEqual([]);
    });

    it("should match multiple commands", () => {
      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "tab"),
      );

      // Should match "Close Tab" (title) and potentially category
      expect(result.current.length).toBeGreaterThanOrEqual(1);
      expect(result.current.some((item) => item.id === "tab.close")).toBe(true);
    });
  });

  describe("sorting", () => {
    it("should sort by category then title", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Zebra",
        category: "Animals",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Apple",
        category: "Fruits",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd3",
        title: "Ant",
        category: "Animals",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      // Should be sorted: Animals (Ant, Zebra), then Fruits (Apple)
      expect(result.current[0].title).toBe("Ant");
      expect(result.current[1].title).toBe("Zebra");
      expect(result.current[2].title).toBe("Apple");
    });

    it("should sort commands without category first", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "With Category",
        category: "Test",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "No Category",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      // Commands without category (empty string) should come before those with
      expect(result.current[0].title).toBe("No Category");
      expect(result.current[1].title).toBe("With Category");
    });

    it("should sort alphabetically within same category", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Zoom",
        category: "View",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Alpha",
        category: "View",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd3",
        title: "Middle",
        category: "View",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      expect(result.current[0].title).toBe("Alpha");
      expect(result.current[1].title).toBe("Middle");
      expect(result.current[2].title).toBe("Zoom");
    });
  });

  describe("integration", () => {
    it("should combine when clause and search filtering", () => {
      const contextKey = new ContextKey("canEdit", false, {
        level: ContextLevel.Global,
      });
      contextKeyService.registerKey(contextKey);
      contextKeyService.setGlobal("canEdit", false);

      commandRegistry.registerCommand({
        id: "editor.save",
        title: "Save File",
        category: "Editor",
        when: contextKey.isTrue(),
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "editor.open",
        title: "Open File",
        category: "Editor",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "editor"),
      );

      // Only 'Open File' should match (Save is filtered by when clause)
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe("editor.open");
    });

    it("should apply search after when clause filtering", () => {
      const contextKey = new ContextKey("active", true, {
        level: ContextLevel.Global,
      });
      contextKeyService.registerKey(contextKey);
      contextKeyService.setGlobal("active", true);

      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Active Command",
        when: contextKey.isTrue(),
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Inactive Command",
        when: contextKey.isFalse(),
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd3",
        title: "Always Available Command",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "command"),
      );

      // Should only include cmd1 and cmd3 (cmd2 filtered by when clause)
      expect(result.current).toHaveLength(2);
      expect(result.current.some((item) => item.id === "cmd1")).toBe(true);
      expect(result.current.some((item) => item.id === "cmd3")).toBe(true);
    });

    it("should maintain sort order after filtering", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Zebra Action",
        category: "Test",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd2",
        title: "Alpha Action",
        category: "Test",
        run: () => {},
      });
      commandRegistry.registerCommand({
        id: "cmd3",
        title: "No Match",
        category: "Other",
        run: () => {},
      });

      const { result } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, "action"),
      );

      // Should be sorted alphabetically
      expect(result.current).toHaveLength(2);
      expect(result.current[0].title).toBe("Alpha Action");
      expect(result.current[1].title).toBe("Zebra Action");
    });
  });

  describe("memoization", () => {
    it("should return same reference when inputs unchanged", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Command 1",
        run: () => {},
      });

      const { result, rerender } = renderHook(() =>
        useCommandPaletteData(commandRegistry, contextKeyService, ""),
      );

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      expect(firstResult).toBe(secondResult);
    });

    it("should recompute when search query changes", () => {
      commandRegistry.registerCommand({
        id: "cmd1",
        title: "Test Command",
        run: () => {},
      });

      const { result, rerender } = renderHook(
        ({ search }) =>
          useCommandPaletteData(commandRegistry, contextKeyService, search),
        { initialProps: { search: "" } },
      );

      expect(result.current).toHaveLength(1);

      rerender({ search: "nonexistent" });
      expect(result.current).toHaveLength(0);
    });
  });
});
