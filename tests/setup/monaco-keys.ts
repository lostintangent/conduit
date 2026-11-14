/**
 * Monaco's real keybinding code, for tests that mock monaco-editor but check
 * keybindings. Modules are imported by path to bypass the mock.
 *
 * Conduit only runs on macOS, so this first gives happy-dom a Mac user agent.
 * Monaco reads the platform once, when it loads, to pick its macOS bindings
 * and the meaning of KeyMod.CtrlCmd.
 */

import type * as monaco from "monaco-editor";
import { readFileSync } from "node:fs";

(
  window as unknown as {
    happyDOM: { settings: { navigator: { userAgent: string } } };
  }
).happyDOM.settings.navigator.userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

const monacoPath = "../../node_modules/monaco-editor/esm/vs/";
const [
  { OS },
  { decodeKeybinding },
  { USLayoutResolvedKeybinding },
  { KeyMod: RealKeyMod },
  { KeyCode: RealKeyCode },
] = await Promise.all([
  import(`${monacoPath}base/common/platform.js`),
  import(`${monacoPath}base/common/keybindings.js`),
  import(
    `${monacoPath}platform/keybinding/common/usLayoutResolvedKeybinding.js`
  ),
  import(`${monacoPath}editor/common/services/editorBaseApi.js`),
  import(`${monacoPath}editor/common/standalone/standaloneEnums.js`),
]);

export const KeyMod: typeof monaco.KeyMod = RealKeyMod;
export const KeyCode: typeof monaco.KeyCode = RealKeyCode;

/** A Monaco keybinding as written in VS Code's keybindings.json, like "cmd+k f" */
export function keybindingLabel(keybinding: number): string {
  return USLayoutResolvedKeybinding.resolveKeybinding(
    decodeKeybinding(keybinding, OS),
    OS,
  )[0].getUserSettingsLabel();
}

/**
 * The keybindings Monaco's own commands register by default on macOS, with
 * every editor feature the app's `import "monaco-editor"` loads
 */
export async function monacoDefaultKeybindings(): Promise<
  { command: string; keybinding: string; when?: string }[]
> {
  const editorMain = readFileSync(
    new URL(`${monacoPath}editor/editor.main.js`, import.meta.url),
    "utf8",
  );
  await Promise.all(
    [...editorMain.matchAll(/^import '\.\/(.+\.js)';$/gm)].map(
      ([, path]) => import(`${monacoPath}editor/${path}`),
    ),
  );
  // Labels need the modules the registry loaded with, which differ from this
  // file's after vi.resetModules()
  const [{ KeybindingsRegistry }, { USLayoutResolvedKeybinding }, { OS }] =
    await Promise.all([
      import(`${monacoPath}platform/keybinding/common/keybindingsRegistry.js`),
      import(
        `${monacoPath}platform/keybinding/common/usLayoutResolvedKeybinding.js`
      ),
      import(`${monacoPath}base/common/platform.js`),
    ]);
  return KeybindingsRegistry.getDefaultKeybindings().flatMap(
    (item: {
      command: string | null;
      keybinding: unknown;
      when?: { serialize(): string };
    }) =>
      item.command && item.keybinding
        ? [
            {
              command: item.command,
              keybinding: USLayoutResolvedKeybinding.resolveKeybinding(
                item.keybinding,
                OS,
              )[0].getUserSettingsLabel(),
              when: item.when?.serialize(),
            },
          ]
        : [],
  );
}
