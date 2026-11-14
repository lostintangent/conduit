export type DotfilesStatus =
  "disabled" | "cloning" | "idle" | "fetching" | "pushing" | "failed";

declare module "@shared/rpc" {
  interface Events {
    dotfiles: { statusChanged: DotfilesStatus };
  }
}
