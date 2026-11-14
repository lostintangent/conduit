import {
  type AtomOptions,
  createAtom as createStoreAtom,
} from "@tanstack/react-store";
import { freeze } from "immer";

/**
 * TanStack Store's `createAtom`, except that `set(undefined)` throws.
 *
 * Store treats `set(undefined)` as "no update", so the old value silently
 * stays. Clear an atom with `null` instead, or with `set(() => undefined)`.
 */
export const createAtom = ((
  valueOrFn: unknown,
  options?: AtomOptions<unknown>,
) => {
  const atom = createStoreAtom(valueOrFn, options);
  // Derived atoms are read-only and have no setter to guard.
  if ("set" in atom) {
    const { set } = atom;
    atom.set = (update: unknown) => {
      if (update === undefined) {
        throw new Error(
          "atom.set(undefined) is ignored by TanStack Store. Use null or set(() => undefined).",
        );
      }
      set(update);
    };
  }
  return atom;
}) as typeof createStoreAtom;

/**
 * A writable atom whose values are deeply frozen, as they were when every
 * write to jotai-immer's `atomWithImmer` ran through `produce`.
 */
export function createFrozenAtom<T>(initialValue: T) {
  const atom = createAtom(initialValue);
  const { set } = atom;
  atom.set = (update: T | ((previous: T) => T)) =>
    typeof update === "function"
      ? set((previous: T) =>
          freeze((update as (previous: T) => T)(previous), true),
        )
      : set(freeze(update as T, true));
  return atom;
}
