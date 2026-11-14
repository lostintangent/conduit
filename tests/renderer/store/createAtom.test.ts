import { describe, expect, it } from "vitest";
import { createAtom, createFrozenAtom } from "@/store/createAtom";

describe("createAtom", () => {
  it("throws on set(undefined) instead of silently keeping the old value", () => {
    const atom = createAtom<string | undefined>("workspace");

    expect(() => atom.set(undefined)).toThrow(/set\(undefined\)/);
    expect(atom.get()).toBe("workspace");

    atom.set(() => undefined);
    expect(atom.get()).toBeUndefined();
  });
});

describe("createFrozenAtom", () => {
  it("deeply freezes values and updater results, like atomWithImmer", () => {
    const atom = createFrozenAtom<{ panes: { id: string }[] }[]>([]);

    atom.set([{ panes: [{ id: "a" }] }]);
    expect(Object.isFrozen(atom.get()[0].panes[0])).toBe(true);

    atom.set((tabs) => [...tabs, { panes: [{ id: "b" }] }]);
    expect(Object.isFrozen(atom.get()[1].panes[0])).toBe(true);
  });
});
