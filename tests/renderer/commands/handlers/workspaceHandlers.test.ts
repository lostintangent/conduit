import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleSaveWorkspace,
  handleCloseWorkspace,
  handleRenameWorkspace,
  handleOpenWorkspace,
  handleOpenLastWorkspace,
} from '@/commands/handlers/workspaceHandlers';
import type { Tab } from '@/store/atoms';

describe('workspaceHandlers', () => {
  let mockTabs: Tab[];
  let mockQuickSaveWorkspace: ReturnType<typeof vi.fn>;
  let mockCloseWorkspace: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockTabs = [
      { id: 'tab-1', title: 'Tab 1' },
      { id: 'tab-2', title: 'Tab 2' },
    ] as Tab[];

    mockQuickSaveWorkspace = vi.fn().mockResolvedValue(undefined);
    mockCloseWorkspace = vi.fn();
  });

  describe('handleSaveWorkspace', () => {
    it('should call quickSaveWorkspace when activeTabId is provided', async () => {
      const activeTabId = 'tab-1';

      await handleSaveWorkspace(mockTabs, activeTabId, mockQuickSaveWorkspace);

      expect(mockQuickSaveWorkspace).toHaveBeenCalledWith(mockTabs, activeTabId);
      expect(mockQuickSaveWorkspace).toHaveBeenCalledTimes(1);
    });

    it('should not call quickSaveWorkspace when activeTabId is undefined', async () => {
      await handleSaveWorkspace(mockTabs, undefined, mockQuickSaveWorkspace);

      expect(mockQuickSaveWorkspace).not.toHaveBeenCalled();
    });

    it('should handle different tab arrays', async () => {
      const singleTab = [{ id: 'tab-only', title: 'Only Tab' }] as Tab[];
      const activeTabId = 'tab-only';

      await handleSaveWorkspace(singleTab, activeTabId, mockQuickSaveWorkspace);

      expect(mockQuickSaveWorkspace).toHaveBeenCalledWith(singleTab, activeTabId);
    });

    it('should propagate errors from quickSaveWorkspace', async () => {
      const error = new Error('Save failed');
      mockQuickSaveWorkspace.mockRejectedValue(error);

      await expect(
        handleSaveWorkspace(mockTabs, 'tab-1', mockQuickSaveWorkspace)
      ).rejects.toThrow('Save failed');
    });
  });

  describe('handleCloseWorkspace', () => {
    it('should call closeWorkspace with correct parameters', () => {
      const activeTabId = 'tab-1';

      handleCloseWorkspace(mockTabs, activeTabId, mockCloseWorkspace);

      expect(mockCloseWorkspace).toHaveBeenCalledWith(mockTabs, activeTabId);
      expect(mockCloseWorkspace).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined activeTabId', () => {
      handleCloseWorkspace(mockTabs, undefined, mockCloseWorkspace);

      expect(mockCloseWorkspace).toHaveBeenCalledWith(mockTabs, undefined);
    });

    it('should handle different tab arrays', () => {
      const manyTabs = [
        { id: 'tab-1', title: 'Tab 1' },
        { id: 'tab-2', title: 'Tab 2' },
        { id: 'tab-3', title: 'Tab 3' },
        { id: 'tab-4', title: 'Tab 4' },
      ] as Tab[];

      handleCloseWorkspace(manyTabs, 'tab-2', mockCloseWorkspace);

      expect(mockCloseWorkspace).toHaveBeenCalledWith(manyTabs, 'tab-2');
    });

    it('should work with empty tab array', () => {
      const emptyTabs: Tab[] = [];

      handleCloseWorkspace(emptyTabs, undefined, mockCloseWorkspace);

      expect(mockCloseWorkspace).toHaveBeenCalledWith(emptyTabs, undefined);
    });

    it('should not throw on closeWorkspace error', () => {
      mockCloseWorkspace.mockImplementation(() => {
        throw new Error('Close failed');
      });

      expect(() =>
        handleCloseWorkspace(mockTabs, 'tab-1', mockCloseWorkspace)
      ).toThrow('Close failed');
    });
  });

  describe('handleRenameWorkspace', () => {
    it('should set show rename workspace dialog to true', () => {
      const setShowRenameWorkspaceDialog = vi.fn();

      handleRenameWorkspace(setShowRenameWorkspaceDialog);

      expect(setShowRenameWorkspaceDialog).toHaveBeenCalledWith(true);
    });
  });

  describe('handleOpenWorkspace', () => {
    it('should set show workspace picker to true', () => {
      const setShowWorkspacePicker = vi.fn();

      handleOpenWorkspace(setShowWorkspacePicker);

      expect(setShowWorkspacePicker).toHaveBeenCalledWith(true);
    });
  });

  describe('handleOpenLastWorkspace', () => {
    it('should call openLastWorkspace', () => {
      const openLastWorkspace = vi.fn();

      handleOpenLastWorkspace(openLastWorkspace);

      expect(openLastWorkspace).toHaveBeenCalled();
    });
  });
});
