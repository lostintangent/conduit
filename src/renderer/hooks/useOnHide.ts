import { useEffect, useEffectEvent } from "react";

/**
 * Runs `onHide` when an `<Activity>` hides the component, and when it
 * unmounts. Background tabs and the collapsed sidebar stay mounted but get no
 * pointer or key events, so a drag, held key or open menu would otherwise
 * still be in progress when they return.
 */
export function useOnHide(onHide: () => void) {
  const handleHide = useEffectEvent(onHide);
  // Hiding runs effect cleanups, so this runs on hide as well as on unmount.
  useEffect(() => () => handleHide(), []);
}
