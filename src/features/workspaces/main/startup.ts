import { refreshApplicationMenu } from "../../../ipc/ui";
import { loadWorkspaceState } from "./service";

/** The application menu lists saved workspaces, so it refreshes once they load. */
export default async function loadWorkspaces() {
  await loadWorkspaceState();
  await refreshApplicationMenu();
}
