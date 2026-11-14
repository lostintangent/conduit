/**
 * The contract between main-process feature services and `window.conduit`.
 *
 * A feature contributes a service by default-exporting a plain object of
 * methods from `features/<name>/main/service.ts`, and merges its type in
 * here under the same name. Events are merged in the same way, from the
 * feature's model, so main and renderer share one payload type per event.
 */

// biome-ignore lint/suspicious/noEmptyInterface: features merge into these
export interface Services {}
// biome-ignore lint/suspicious/noEmptyInterface: features merge into these
export interface Events {}

/** A service as the renderer sees it: every method becomes async. */
export type Remote<Service> = {
  [Method in keyof Service]: Service[Method] extends (
    ...args: infer Args
  ) => infer Result
    ? (...args: Args) => Promise<Awaited<Result>>
    : never;
};

/** Subscribes to one of a feature's events and returns the unsubscribe. */
export type Listen<FeatureEvents> = <
  Event extends keyof FeatureEvents & string,
>(
  event: Event,
  listener: (payload: FeatureEvents[Event]) => void,
) => () => void;

/** Every feature's API on `window.conduit`, keyed by the feature's folder name. */
export type FeatureApis = {
  [Name in keyof Services]: Remote<Services[Name]> &
    (Name extends keyof Events ? { on: Listen<Events[Name]> } : unknown);
};
