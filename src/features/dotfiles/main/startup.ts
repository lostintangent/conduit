import { settings } from "@features/settings/main/settings";
import { initializeRepo } from ".";

/**
 * Syncs the dotfiles repo from settings, or finds one on the user's GitHub
 * account and saves it to settings.
 */
export default async function syncDotfiles() {
  const suggestedRepo = await initializeRepo(settings.get().dotfilesRepo);
  if (suggestedRepo) {
    // A settings.json that doesn't parse can't be saved to, and that
    // shouldn't stop the app from starting. The next launch finds it again.
    await settings
      .update(() => ({ dotfilesRepo: suggestedRepo }))
      .catch((error) =>
        console.error("Couldn't save the dotfiles repo to settings:", error),
      );
  }
}
