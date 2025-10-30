import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as notifications from '@/store/actions/notifications';
import * as paneActions from '@/store/actions/pane';
import type { AgentSessionInfo } from '@shared/types';

// Mock window.conduit BEFORE importing handlers
const mockApi = {
  listAgentSessions: vi.fn(),
};

global.window = {
  conduit: mockApi,
} as any;

// Import handlers AFTER setting up window.conduit
import {
  handleManageSessions,
  handleMergeAndClose,
  handleTerminate,
} from '@/commands/handlers/agentHandlers';

// Mock store actions
vi.mock('@/store/actions/notifications', () => ({
  enqueueNotification: vi.fn(),
  updateNotification: vi.fn(),
}));

vi.mock('@/store/actions/pane', () => ({
  completeAgentSession: vi.fn(),
  deleteAgentSession: vi.fn(),
}));

describe('agentHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleManageSessions', () => {
    it('should show dialog with sessions when sessions exist', async () => {
      const mockSessions: AgentSessionInfo[] = [
        { id: 'session-1', branchName: 'feature-1', path: '/path1' } as AgentSessionInfo,
        { id: 'session-2', branchName: 'feature-2', path: '/path2' } as AgentSessionInfo,
      ];
      const mockShowDialog = vi.fn();
      const mockContext = {
        agent: {
          showManageSessionsDialog: mockShowDialog,
        },
      };

      mockApi.listAgentSessions.mockResolvedValue(mockSessions);

      await handleManageSessions(mockContext);

      expect(mockApi.listAgentSessions).toHaveBeenCalled();
      expect(mockShowDialog).toHaveBeenCalledWith(mockSessions);
      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
    });

    it('should show info notification when no sessions exist', async () => {
      const mockContext = {
        agent: {
          showManageSessionsDialog: vi.fn(),
        },
      };

      mockApi.listAgentSessions.mockResolvedValue([]);

      await handleManageSessions(mockContext);

      expect(mockApi.listAgentSessions).toHaveBeenCalled();
      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'info',
        message: 'No agent sessions.',
        autoCloseMs: 2500,
      });
      expect(mockContext.agent.showManageSessionsDialog).not.toHaveBeenCalled();
    });

    it('should show error notification on failure', async () => {
      const mockContext = {
        agent: {
          showManageSessionsDialog: vi.fn(),
        },
      };
      const error = new Error('API error');

      mockApi.listAgentSessions.mockRejectedValue(error);

      await handleManageSessions(mockContext);

      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'error',
        message: 'Unable to list agent sessions',
        details: 'API error',
        autoCloseMs: null,
      });
      expect(mockContext.agent.showManageSessionsDialog).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      const mockContext = {
        agent: {
          showManageSessionsDialog: vi.fn(),
        },
      };

      mockApi.listAgentSessions.mockRejectedValue('String error');

      await handleManageSessions(mockContext);

      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'error',
        message: 'Unable to list agent sessions',
        details: 'String error',
        autoCloseMs: null,
      });
    });
  });

  describe('handleMergeAndClose', () => {
    it('should merge agent session successfully', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
            agentBranchName: 'feature-branch',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-1');
      vi.mocked(paneActions.completeAgentSession).mockResolvedValue({
        status: 'success',
        message: 'Merged successfully',
      });

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'info',
        message: 'Merging feature-branch...',
        persistent: true,
      });

      expect(paneActions.completeAgentSession).toHaveBeenCalledWith('tab-123', 'agent-789');

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-1', {
        kind: 'success',
        message: 'Agent session merged successfully.',
        details: 'Merged successfully',
        autoCloseMs: 5000,
      });
    });

    it('should use default branch name when not provided', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
            // No agentBranchName
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-2');
      vi.mocked(paneActions.completeAgentSession).mockResolvedValue({
        status: 'success',
        message: 'Merged',
      });

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'info',
        message: 'Merging agent session...',
        persistent: true,
      });
    });

    it('should handle merge conflicts', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
            agentBranchName: 'conflicting-branch',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-3');
      vi.mocked(paneActions.completeAgentSession).mockResolvedValue({
        status: 'conflict',
        message: 'Conflicts in file.txt',
      });

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-3', {
        kind: 'error',
        message: 'Merge conflicts detected',
        details: 'Conflicts in file.txt',
        autoCloseMs: null,
      });
    });

    it('should handle no-op merge', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
            agentBranchName: 'empty-branch',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-4');
      vi.mocked(paneActions.completeAgentSession).mockResolvedValue({
        status: 'noop',
        message: 'No changes',
      });

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-4', {
        kind: 'info',
        message: 'Agent session had no new commits.',
        details: 'No changes',
        autoCloseMs: 5000,
      });
    });

    it('should return early when activeTab is null', async () => {
      await handleMergeAndClose(null);

      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
      expect(paneActions.completeAgentSession).not.toHaveBeenCalled();
    });

    it('should return early when activePane is not terminal', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'webview',
            agentSessionId: 'agent-789',
          },
        },
      };

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
      expect(paneActions.completeAgentSession).not.toHaveBeenCalled();
    });

    it('should return early when no agentSessionId', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            // No agentSessionId
          },
        },
      };

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
      expect(paneActions.completeAgentSession).not.toHaveBeenCalled();
    });

    it('should handle merge failure', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-5');
      vi.mocked(paneActions.completeAgentSession).mockResolvedValue(null);

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-5', {
        kind: 'error',
        message: 'Failed to merge and close agent session',
        details: 'Unable to finalize agent session',
        autoCloseMs: null,
      });
    });

    it('should handle exception during merge', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-6');
      vi.mocked(paneActions.completeAgentSession).mockRejectedValue(new Error('Git error'));

      await handleMergeAndClose(mockActiveTab);

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-6', {
        kind: 'error',
        message: 'Failed to merge and close agent session',
        details: 'Git error',
        autoCloseMs: null,
      });
    });
  });

  describe('handleTerminate', () => {
    it('should terminate agent session successfully', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
            agentBranchName: 'feature-branch',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-1');
      vi.mocked(paneActions.deleteAgentSession).mockResolvedValue({
        status: 'success',
        message: 'Terminated successfully',
      });

      await handleTerminate(mockActiveTab);

      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'info',
        message: 'Cleaning up feature-branch...',
        persistent: true,
      });

      expect(paneActions.deleteAgentSession).toHaveBeenCalledWith('tab-123', 'agent-789');

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-1', {
        kind: 'success',
        message: 'Agent session terminated',
        details: 'Terminated successfully',
        autoCloseMs: 4000,
      });
    });

    it('should use default branch name when not provided', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-2');
      vi.mocked(paneActions.deleteAgentSession).mockResolvedValue({
        status: 'success',
        message: 'Cleaned up',
      });

      await handleTerminate(mockActiveTab);

      expect(notifications.enqueueNotification).toHaveBeenCalledWith({
        kind: 'info',
        message: 'Cleaning up agent session...',
        persistent: true,
      });
    });

    it('should return early when activeTab is null', async () => {
      await handleTerminate(null);

      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
      expect(paneActions.deleteAgentSession).not.toHaveBeenCalled();
    });

    it('should return early when activePane is not terminal', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'webview',
            agentSessionId: 'agent-789',
          },
        },
      };

      await handleTerminate(mockActiveTab);

      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
      expect(paneActions.deleteAgentSession).not.toHaveBeenCalled();
    });

    it('should return early when no agentSessionId', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
          },
        },
      };

      await handleTerminate(mockActiveTab);

      expect(notifications.enqueueNotification).not.toHaveBeenCalled();
      expect(paneActions.deleteAgentSession).not.toHaveBeenCalled();
    });

    it('should handle termination failure', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-3');
      vi.mocked(paneActions.deleteAgentSession).mockResolvedValue(null);

      await handleTerminate(mockActiveTab);

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-3', {
        kind: 'error',
        message: 'Failed to clean up agent session',
        details: 'Unable to clean up agent session',
        autoCloseMs: null,
      });
    });

    it('should handle exception during termination', async () => {
      const mockActiveTab = {
        id: 'tab-123',
        activePaneId: 'pane-456',
        panes: {
          'pane-456': {
            type: 'terminal',
            agentSessionId: 'agent-789',
          },
        },
      };

      vi.mocked(notifications.enqueueNotification).mockReturnValue('notif-4');
      vi.mocked(paneActions.deleteAgentSession).mockRejectedValue(new Error('Delete failed'));

      await handleTerminate(mockActiveTab);

      expect(notifications.updateNotification).toHaveBeenCalledWith('notif-4', {
        kind: 'error',
        message: 'Failed to clean up agent session',
        details: 'Delete failed',
        autoCloseMs: null,
      });
    });
  });
});
