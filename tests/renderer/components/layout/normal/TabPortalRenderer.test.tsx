/**
 * @vitest-environment jsdom
 */
import {
  TabContentPortalProvider,
  useTabContentPortal,
} from "@/components/layout/normal/TabContentPortalContext";
import { TabPortalRenderer } from "@/components/layout/normal/TabPortalRenderer";
import { act, render } from "@testing-library/react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ComponentType,
} from "react";
import { describe, expect, it } from "vitest";

function createHost(): HTMLDivElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  return host;
}

type HarnessHandle = {
  moveToPreview: () => void;
  returnToLayout: () => void;
  getHosts: () => {
    layout: HTMLDivElement | null;
    preview: HTMLDivElement | null;
  };
};

type HarnessProps = {
  Pane: ComponentType;
};

function createMountTracker() {
  let mounts = 0;
  let unmounts = 0;

  function Pane() {
    useEffect(() => {
      mounts += 1;
      return () => {
        unmounts += 1;
      };
    }, []);

    return <div data-testid="pane">Pane</div>;
  }

  return {
    Pane,
    getCounts: () => ({ mounts, unmounts }),
  };
}

describe("TabPortalRenderer", () => {
  it("keeps tab content mounted while switching parents", async () => {
    const tracker = createMountTracker();

    const Harness = forwardRef<HarnessHandle, HarnessProps>(function Harness(
      { Pane },
      ref
    ) {
      const {
        setLayoutParent,
        registerPreviewParents,
        clearPreviewParents,
      } = useTabContentPortal();
      const layoutHostRef = useRef<HTMLDivElement | null>(null);
      const previewHostRef = useRef<HTMLDivElement | null>(null);

      useEffect(() => {
        if (!layoutHostRef.current) {
          layoutHostRef.current = createHost();
          setLayoutParent("tab-1", layoutHostRef.current);
        }

        return () => {
          setLayoutParent("tab-1", null);

          if (layoutHostRef.current?.parentElement) {
            layoutHostRef.current.parentElement.removeChild(
              layoutHostRef.current
            );
          }
          layoutHostRef.current = null;

          if (previewHostRef.current?.parentElement) {
            previewHostRef.current.parentElement.removeChild(
              previewHostRef.current
            );
          }
          previewHostRef.current = null;
        };
      }, [setLayoutParent]);

      useImperativeHandle(
        ref,
        () => ({
          moveToPreview: () => {
            if (!previewHostRef.current) {
              previewHostRef.current = createHost();
            }
            registerPreviewParents({ "tab-1": previewHostRef.current });
          },
          returnToLayout: () => {
            clearPreviewParents();
          },
          getHosts: () => ({
            layout: layoutHostRef.current,
            preview: previewHostRef.current,
          }),
        }),
        [clearPreviewParents, registerPreviewParents]
      );

      return (
        <TabPortalRenderer tabId="tab-1">
          <Pane />
        </TabPortalRenderer>
      );
    });

    const harnessRef = { current: null as HarnessHandle | null };

    render(
      <TabContentPortalProvider>
        <Harness
          ref={(value) => {
            harnessRef.current = value;
          }}
          Pane={tracker.Pane}
        />
      </TabContentPortalProvider>
    );

    await act(async () => {});

    expect(tracker.getCounts()).toEqual({ mounts: 1, unmounts: 0 });

    const initialHosts = harnessRef.current?.getHosts();
    const paneElement = document.querySelector(
      "[data-testid='pane']"
    ) as HTMLDivElement | null;

    expect(paneElement).not.toBeNull();
    expect(initialHosts?.layout?.contains(paneElement!)).toBe(true);

    await act(async () => {
      harnessRef.current?.moveToPreview();
    });

    const afterPreviewHosts = harnessRef.current?.getHosts();
    expect(tracker.getCounts()).toEqual({ mounts: 1, unmounts: 0 });
    expect(afterPreviewHosts?.preview?.contains(paneElement!)).toBe(true);

    await act(async () => {
      harnessRef.current?.returnToLayout();
    });

    const afterReturnHosts = harnessRef.current?.getHosts();
    expect(tracker.getCounts()).toEqual({ mounts: 1, unmounts: 0 });
    expect(afterReturnHosts?.layout?.contains(paneElement!)).toBe(true);
  });
});
