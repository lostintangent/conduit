import { refreshApplicationMenu } from "../../../main/ui";
import { loadWorkspaceState } from "./service";

/** The application menu lists saved workspaces, so it refreshes once they load. */
export default async function loadWorkspaces() {
  await loadWorkspaceState();
  await refreshApplicationMenu();
}
