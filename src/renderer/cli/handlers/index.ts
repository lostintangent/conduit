import type { HandlerMap } from "./types";

// Each feature handles its commands from `features/<name>/cli/handler.ts`.
const features = import.meta.glob<Partial<HandlerMap>>(
  "../../../features/*/cli/handler.ts",
  { eager: true, import: "default" },
);

export const handlerMap = Object.assign(
  {},
  ...Object.values(features),
) as HandlerMap;

export * from "./types";
