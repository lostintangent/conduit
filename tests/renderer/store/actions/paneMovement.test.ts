import { describe, it, expect, beforeEach } from 'vitest';
import { movePaneToTarget } from '@/store/actions/pane';
import { tabsAtom } from '@/store/atoms';
import type { Tab, LayoutNode, Pane } from '@/types';
import { getDefaultStore } from 'jotai';

describe('paneMovement', () => {
  const store = getDefaultStore();

  beforeEach(() => {
    // Reset the store before each test
    store.set(tabsAtom, []);
  });

  describe('movePaneToTarget', () => {
    it('should move a pane within the same tab without losing pane data', () => {
      const pane1: Pane = {
        id: 'pane1',
        type: 'terminal',
        sessionId: 'session1',
        cwd: '/test',
        processTitle: 'bash',
      };

      const pane2: Pane = {
        id: 'pane2',
        type: 'terminal',
        sessionId: 'session2',
        cwd: '/test',
        processTitle: 'bash',
      };

      const layout: LayoutNode = {
        id: 'split1',
        type: 'split',
        direction: 'row',
        children: [
          {
            id: 'node1',
            type: 'pane',
            paneId: 'pane1',
          },
          {
            id: 'node2',
            type: 'pane',
            paneId: 'pane2',
          },
        ],
      };

      const tab: Tab = {
        id: 'tab1',
        panes: {
          pane1,
          pane2,
        },
        layout,
        activePaneId: 'pane1',
      };

      store.set(tabsAtom, [tab]);

      // Move pane1 to the right of pane2
      const success = movePaneToTarget('tab1', 'pane1', 'tab1', 'pane2', 'row', false);

      expect(success).toBe(true);

      const tabs = store.get(tabsAtom);
      expect(tabs).toHaveLength(1);

      const updatedTab = tabs[0];
      
      // Both panes should still exist in the panes object
      expect(updatedTab.panes).toHaveProperty('pane1');
      expect(updatedTab.panes).toHaveProperty('pane2');
      
      // Pane data should be preserved (same reference)
      expect(updatedTab.panes.pane1).toBe(pane1);
      expect(updatedTab.panes.pane2).toBe(pane2);

      // The moved pane should become active
      expect(updatedTab.activePaneId).toBe('pane1');
    });

    it('should move a pane to a different tab and transfer the pane data', () => {
      const pane1: Pane = {
        id: 'pane1',
        type: 'terminal',
        sessionId: 'session1',
        cwd: '/test',
        processTitle: 'bash',
      };

      const pane2: Pane = {
        id: 'pane2',
        type: 'terminal',
        sessionId: 'session2',
        cwd: '/test',
        processTitle: 'bash',
      };

      const tab1: Tab = {
        id: 'tab1',
        panes: { pane1 },
        layout: {
          id: 'node1',
          type: 'pane',
          paneId: 'pane1',
        },
        activePaneId: 'pane1',
      };

      const tab2: Tab = {
        id: 'tab2',
        panes: { pane2 },
        layout: {
          id: 'node2',
          type: 'pane',
          paneId: 'pane2',
        },
        activePaneId: 'pane2',
      };

      store.set(tabsAtom, [tab1, tab2]);

      // Move pane1 from tab1 to tab2 (to the left of pane2)
      const success = movePaneToTarget('tab1', 'pane1', 'tab2', 'pane2', 'row', true);

      expect(success).toBe(true);

      const tabs = store.get(tabsAtom);
      
      // tab1 should be closed since it had only one pane
      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe('tab2');

      const updatedTab2 = tabs[0];
      
      // Both panes should now be in tab2
      expect(updatedTab2.panes).toHaveProperty('pane1');
      expect(updatedTab2.panes).toHaveProperty('pane2');
      
      // Pane data should be preserved
      expect(updatedTab2.panes.pane1).toBe(pane1);
      expect(updatedTab2.panes.pane2).toBe(pane2);

      // The moved pane should become active
      expect(updatedTab2.activePaneId).toBe('pane1');
    });

    it('should not move a pane to itself', () => {
      const pane1: Pane = {
        id: 'pane1',
        type: 'terminal',
        sessionId: 'session1',
        cwd: '/test',
        processTitle: 'bash',
      };

      const tab: Tab = {
        id: 'tab1',
        panes: { pane1 },
        layout: {
          id: 'node1',
          type: 'pane',
          paneId: 'pane1',
        },
        activePaneId: 'pane1',
      };

      store.set(tabsAtom, [tab]);

      // Try to move pane1 to itself
      const success = movePaneToTarget('tab1', 'pane1', 'tab1', 'pane1', 'row', false);

      expect(success).toBe(false);

      const tabs = store.get(tabsAtom);
      expect(tabs).toHaveLength(1);
      expect(tabs[0]).toEqual(tab);
    });

    it('should handle moving a pane with complex layout', () => {
      const pane1: Pane = {
        id: 'pane1',
        type: 'terminal',
        sessionId: 'session1',
        cwd: '/test',
        processTitle: 'bash',
      };

      const pane2: Pane = {
        id: 'pane2',
        type: 'editor',
        cwd: '/test',
      };

      const pane3: Pane = {
        id: 'pane3',
        type: 'webview',
        url: 'https://example.com',
      };

      const layout: LayoutNode = {
        id: 'split1',
        type: 'split',
        direction: 'row',
        children: [
          {
            id: 'node1',
            type: 'pane',
            paneId: 'pane1',
          },
          {
            id: 'split2',
            type: 'split',
            direction: 'column',
            children: [
              {
                id: 'node2',
                type: 'pane',
                paneId: 'pane2',
              },
              {
                id: 'node3',
                type: 'pane',
                paneId: 'pane3',
              },
            ],
          },
        ],
      };

      const tab: Tab = {
        id: 'tab1',
        panes: {
          pane1,
          pane2,
          pane3,
        },
        layout,
        activePaneId: 'pane1',
      };

      store.set(tabsAtom, [tab]);

      // Move pane1 to the top of pane2 (column split)
      const success = movePaneToTarget('tab1', 'pane1', 'tab1', 'pane2', 'column', true);

      expect(success).toBe(true);

      const tabs = store.get(tabsAtom);
      expect(tabs).toHaveLength(1);

      const updatedTab = tabs[0];
      
      // All panes should still exist
      expect(updatedTab.panes).toHaveProperty('pane1');
      expect(updatedTab.panes).toHaveProperty('pane2');
      expect(updatedTab.panes).toHaveProperty('pane3');
      
      // Pane data should be preserved (same reference)
      expect(updatedTab.panes.pane1).toBe(pane1);
      expect(updatedTab.panes.pane2).toBe(pane2);
      expect(updatedTab.panes.pane3).toBe(pane3);

      // The moved pane should become active
      expect(updatedTab.activePaneId).toBe('pane1');
    });

    it('should preserve terminal pane session IDs during move', () => {
      const pane1: Pane = {
        id: 'pane1',
        type: 'terminal',
        sessionId: 'unique-session-123',
        cwd: '/test',
        processTitle: 'bash',
      };

      const pane2: Pane = {
        id: 'pane2',
        type: 'terminal',
        sessionId: 'unique-session-456',
        cwd: '/test',
        processTitle: 'zsh',
      };

      const tab: Tab = {
        id: 'tab1',
        panes: { pane1, pane2 },
        layout: {
          id: 'split1',
          type: 'split',
          direction: 'row',
          children: [
            { id: 'node1', type: 'pane', paneId: 'pane1' },
            { id: 'node2', type: 'pane', paneId: 'pane2' },
          ],
        },
        activePaneId: 'pane1',
      };

      store.set(tabsAtom, [tab]);

      // Move pane1
      const success = movePaneToTarget('tab1', 'pane1', 'tab1', 'pane2', 'row', false);

      expect(success).toBe(true);

      const tabs = store.get(tabsAtom);
      const updatedTab = tabs[0];
      
      // Terminal session IDs should be preserved
      expect(updatedTab.panes.pane1.type).toBe('terminal');
      if (updatedTab.panes.pane1.type === 'terminal') {
        expect(updatedTab.panes.pane1.sessionId).toBe('unique-session-123');
      }
      
      expect(updatedTab.panes.pane2.type).toBe('terminal');
      if (updatedTab.panes.pane2.type === 'terminal') {
        expect(updatedTab.panes.pane2.sessionId).toBe('unique-session-456');
      }
    });
  });
});
