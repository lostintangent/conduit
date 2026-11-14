import { emitter } from "../../../ipc/events";
import { settings } from "./settings";

const emit = emitter("settings");

/** Tells the renderer when settings.json changes outside the app. */
export default function watchSettings() {
  return settings.watch((next) => emit("changed", next));
}
