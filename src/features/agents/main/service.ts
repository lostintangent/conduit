import {
  cleanupSession,
  finalizeSession,
  listSessions,
  spawnSession,
} from "./sessions";

const service = {
  spawnSession,
  listSessions,
  finalizeSession,
  cleanupSession,
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    agents: typeof service;
  }
}
