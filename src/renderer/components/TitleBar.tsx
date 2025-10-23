type TitleBarProps = {
  backgroundClass: string;
};

export const TitleBar = ({ backgroundClass }: TitleBarProps) => {
  const api = window.conduit;
  if (api?.platform !== "darwin") {
    return null;
  }

  return (
    <div
      className={`title-bar h-[28px] flex items-center justify-center text-[0.8rem] text-white/40 font-medium ${backgroundClass} rounded-xl`}
    >
      🔌 Conduit
    </div>
  );
};
