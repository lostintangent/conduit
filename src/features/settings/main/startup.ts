import { emitter } from "../../../main/events";
import { settings } from "./settings";
import { followTheme } from "./theme";

const emit = emitter("settings");

/**
 * Applies the theme, and tells the renderer when settings.json changes
 * outside the app.
 */
export default function watchSettings() {
  followTheme(settings.get());
  return settings.watch((next) => {
    followTheme(next);
    emit("changed", next);
  });
}
