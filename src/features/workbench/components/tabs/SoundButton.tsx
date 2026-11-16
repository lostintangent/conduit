import type { PaneSound } from "@features/workbench/model";
import { Volume2, VolumeX } from "lucide-react";

/**
 * A speaker on a label whose pages make sound, which mutes them while they
 * play and unmutes them once they're muted. It sits inside the label's own
 * button, so its clicks stay its own, and two quick ones don't rename a tab.
 */
export function SoundButton({
  sound,
  onMute,
}: {
  sound: PaneSound;
  onMute: (muted: boolean) => void;
}) {
  return (
    <span
      role="button"
      aria-label={sound === "muted" ? "Unmute" : "Mute"}
      data-sound={sound}
      className="flex flex-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity duration-150"
      onClick={(event) => {
        event.stopPropagation();
        onMute(sound === "playing");
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <SoundIcon sound={sound} />
    </span>
  );
}

/** The speaker alone, for a label that shows its pages' sound but can't mute them */
export function SoundIcon({ sound }: { sound: PaneSound }) {
  const Icon = sound === "muted" ? VolumeX : Volume2;
  return <Icon size={14} />;
}
