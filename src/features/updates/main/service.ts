import { autoUpdater } from "electron";

const service = {
  /** Quits and relaunches into the update that finished downloading. */
  install() {
    autoUpdater.quitAndInstall();
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    updates: typeof service;
  }
}
