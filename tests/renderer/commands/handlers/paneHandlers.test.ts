import { describe, it, expect, vi } from 'vitest';
import { handleOpenWebPage } from '@/commands/handlers/paneHandlers';

describe('paneHandlers', () => {
  describe('handleOpenWebPage', () => {
    it('should set URL dialog open to true', () => {
      const setIsUrlDialogOpen = vi.fn();

      handleOpenWebPage(setIsUrlDialogOpen);

      expect(setIsUrlDialogOpen).toHaveBeenCalledWith(true);
    });
  });
});
