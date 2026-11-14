export type UpdateStatus =
  | "idle"
  | "checking"
  | "unavailable"
  | "downloading"
  | "downloaded"
  | "installing"
  | "disabled";

export type UpdateState = {
  status: UpdateStatus;
  releaseName?: string;
  releaseNotes?: string;
};

declare module "@shared/rpc" {
  interface Events {
    updates: { statusChanged: UpdateState };
  }
}
