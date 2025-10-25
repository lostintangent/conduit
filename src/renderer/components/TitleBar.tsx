import { workspaceNameAtom } from "@/store/atoms";
import { useAtomValue } from "jotai";

type TitleBarProps = {
  backgroundClass: string;
};

export const TitleBar = ({ backgroundClass }: TitleBarProps) => {
  const api = window.conduit;
  if (api?.platform !== "darwin") {
    return null;
  }

  const workspaceName = useAtomValue(workspaceNameAtom);
  const titleBarSuffix = workspaceName
    ? ` (${workspaceName})`
    : "";

  return (
    <div
      className={`h-[28px] flex items-center justify-center text-[0.8rem] text-white/40 font-medium ${backgroundClass} rounded-xl [app-region:drag]`}
    >
      🔌 Conduit{titleBarSuffix}
    </div>
  );
};
