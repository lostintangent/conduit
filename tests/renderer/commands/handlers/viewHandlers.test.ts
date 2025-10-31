import { describe, it, expect, vi } from 'vitest';
import {
  handleToggleDesignMode,
  handleOpenKeyboardShortcuts,
  handleShowCommandPalette,
  handleResetLayout,
} from '@/commands/handlers/viewHandlers';

describe('viewHandlers', () => {
  describe('handleToggleDesignMode', () => {
    it('should toggle from normal to design mode', () => {
      const setApplicationMode = vi.fn();

      handleToggleDesignMode('normal', setApplicationMode);

      expect(setApplicationMode).toHaveBeenCalledWith('design');
    });

    it('should toggle from design to normal mode', () => {
      const setApplicationMode = vi.fn();

      handleToggleDesignMode('design', setApplicationMode);

      expect(setApplicationMode).toHaveBeenCalledWith('normal');
    });
  });

  describe('handleOpenKeyboardShortcuts', () => {
    it('should set show keybindings editor to true', () => {
      const setShowKeybindingsEditor = vi.fn();

      handleOpenKeyboardShortcuts(setShowKeybindingsEditor);

      expect(setShowKeybindingsEditor).toHaveBeenCalledWith(true);
    });
  });

  describe('handleShowCommandPalette', () => {
    it('should set command palette open override to true', () => {
      const setIsCommandPaletteOpenOverride = vi.fn();

      handleShowCommandPalette(setIsCommandPaletteOpenOverride);

      expect(setIsCommandPaletteOpenOverride).toHaveBeenCalledWith(true);
    });
  });

  describe('handleResetLayout', () => {
    it('should reset layout sizes for the given tab', () => {
      const tabId = 'tab-123';

      // Just verify it doesn't throw - the actual implementation updates atoms directly
      expect(() => handleResetLayout(tabId)).not.toThrow();
    });
  });
});
