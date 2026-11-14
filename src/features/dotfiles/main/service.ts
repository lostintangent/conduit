import { addFile, createRepo, fetch, getRepoPath, getStatus } from ".";

const service = {
  getPath: getRepoPath,
  getStatus,
  createRepo,
  fetch,
  addFile,
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    dotfiles: typeof service;
  }
}
