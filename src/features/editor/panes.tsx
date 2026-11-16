import { EditorPaneAnchor } from "@features/editor/components/EditorPaneAnchor";
import {
  closePane,
  updatePaneProperty,
} from "@features/workbench/client/actions/pane";
import type { LayoutPaneProps } from "@features/workbench/components/layout/paneKinds";
import type { EditorPane } from "@features/workbench/model";

export default function EditorLayoutPane({
  pane,
  tab,
  isActive,
  isInPreview,
  hideIndividualSandboxIndicator,
  onActivate,
  onContextMenu,
  onHover,
}: LayoutPaneProps<EditorPane>) {
  const update = (updates: Partial<EditorPane>) =>
    updatePaneProperty(tab.id, pane.id, updates);

  return (
    <div
      className="flex flex-1 w-full h-full min-h-0 min-w-0"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      <EditorPaneAnchor
        paneId={pane.id}
        pane={pane}
        onFileChange={({ file }) => update({ file })}
        onClearFile={() => update({ file: undefined })}
        onCwdChange={(cwd) => update({ cwd })}
        onTreeModeChange={(treeMode) => update({ treeMode })}
        onChangesViewModeChange={(changesViewMode) =>
          update({ changesViewMode })
        }
        onHover={onHover}
        isInPreview={isInPreview}
        isActive={isActive}
        hideIndividualSandboxIndicator={hideIndividualSandboxIndicator}
        tabId={tab.id}
        hideFileTree={pane.closeOnSave}
        onSave={pane.closeOnSave ? () => closePane(tab.id, pane.id) : undefined}
        // A quick pane has its own Close, which closes all of it
        onClose={tab.quick ? undefined : () => closePane(tab.id, pane.id)}
        className="h-full w-full"
      />
    </div>
  );
}
