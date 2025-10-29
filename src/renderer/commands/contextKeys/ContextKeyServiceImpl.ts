import type { IContextKeyService } from './ContextKeyService';
import type { ContextValues } from './types';
import { AggregateMode } from './types';
import type { ContextKey } from './ContextKey';
import type { DerivedContextKey } from './DerivedContextKey';

/**
 * Implementation of the context key service with hierarchical support
 */
export class ContextKeyService implements IContextKeyService {
  // Storage for pane-level values: paneId -> key -> value
  private paneValues = new Map<string, Map<string, unknown>>();

  // Storage for tab-level values: tabId -> key -> value
  private tabValues = new Map<string, Map<string, unknown>>();

  // Storage for global values: key -> value
  private globalValues = new Map<string, unknown>();

  // Active IDs (used for activePane.*, activeTab.* resolution)
  private activeTabId: string | undefined;
  private activePaneId: string | undefined;

  // Track which panes belong to which tabs
  private paneToTab = new Map<string, string>();

  // Registry of all context keys (set during initialization)
  private keyRegistry = new Map<string, ContextKey<any> | DerivedContextKey>();

  // Change listeners
  private listeners: Array<(key: string, value: unknown) => void> = [];

  constructor() {
    // Initialize with no active tab/pane
  }

  /**
   * Register a context key (called during ConduitContext initialization)
   */
  registerKey(contextKey: ContextKey<any> | DerivedContextKey): void {
    this.keyRegistry.set(contextKey.getKey(), contextKey);
  }

  /**
   * Set the active tab ID (triggers recomputation of activeTab.* keys)
   */
  setActiveTab(tabId: string | undefined): void {
    this.activeTabId = tabId;
    this.recomputeActiveTabKeys();
  }

  /**
   * Set the active pane ID (triggers recomputation of activePane.* keys)
   */
  setActivePane(paneId: string | undefined): void {
    this.activePaneId = paneId;
    this.recomputeActivePaneKeys();
  }

  setPaneProperty(paneId: string, key: string, value: unknown): void {
    // Store at pane level
    if (!this.paneValues.has(paneId)) {
      this.paneValues.set(paneId, new Map());
    }
    this.paneValues.get(paneId)!.set(key, value);

    // Track which tab this pane belongs to (based on current active tab)
    if (this.activeTabId && !this.paneToTab.has(paneId)) {
      this.paneToTab.set(paneId, this.activeTabId);
    }

    // If this pane is active, update activePane.* key
    if (paneId === this.activePaneId) {
      const activePaneKey = `activePane.${key}`;
      this.notifyChange(activePaneKey, value);
    }

    // Trigger aggregation to tab/global levels
    this.aggregatePaneToTab(key);
    this.aggregatePaneToGlobal(key);
  }

  setTabProperty(tabId: string, key: string, value: unknown): void {
    // Store at tab level
    if (!this.tabValues.has(tabId)) {
      this.tabValues.set(tabId, new Map());
    }
    this.tabValues.get(tabId)!.set(key, value);

    // If this tab is active, update activeTab.* key
    if (tabId === this.activeTabId) {
      const activeTabKey = `activeTab.${key}`;
      this.notifyChange(activeTabKey, value);
    }

    // Trigger aggregation to global level
    this.aggregateTabToGlobal(key);
  }

  setGlobal(key: string, value: unknown): void {
    this.globalValues.set(key, value);
    this.notifyChange(key, value);

    // Special handling for activeTabId and activePaneId
    if (key === 'activeTabId') {
      this.setActiveTab(value as string | undefined);
    } else if (key === 'activePaneId') {
      this.setActivePane(value as string | undefined);
    }
  }

  get<T = unknown>(key: string): T | undefined {
    // Check if this is a derived/aggregated key (check first before other lookups)
    const derivedKey = this.keyRegistry.get(key);
    if (derivedKey && 'getSourceKey' in derivedKey) {
      // Compute aggregated value on-demand
      return this.computeDerivedValue(derivedKey) as T;
    }

    // Check global values
    if (this.globalValues.has(key)) {
      return this.globalValues.get(key) as T;
    }

    // Check activeTab.* keys
    if (key.startsWith('activeTab.') && this.activeTabId) {
      const tabKey = key.substring('activeTab.'.length);
      const tabMap = this.tabValues.get(this.activeTabId);
      if (tabMap?.has(tabKey)) {
        return tabMap.get(tabKey) as T;
      }
    }

    // Check activePane.* keys
    if (key.startsWith('activePane.') && this.activePaneId) {
      const paneKey = key.substring('activePane.'.length);
      const paneMap = this.paneValues.get(this.activePaneId);
      if (paneMap?.has(paneKey)) {
        return paneMap.get(paneKey) as T;
      }
    }

    // Try to find default value from registry
    const contextKey = this.keyRegistry.get(key);
    if (contextKey && 'getDefault' in contextKey) {
      return contextKey.getDefault() as T;
    }

    return undefined;
  }

  private computeDerivedValue(derivedKey: DerivedContextKey): unknown {
    const key = derivedKey.getKey();
    const sourceKey = derivedKey.getSourceKey();
    const aggregateMode = derivedKey.getAggregateMode();

    // Check if this is an activeTab.* key aggregating from panes
    if (key.startsWith('activeTab.') && sourceKey.startsWith('activePane.')) {
      // Aggregate from panes in the active tab only
      const property = sourceKey.substring('activePane.'.length);
      const values: unknown[] = [];

      if (this.activeTabId) {
        for (const [paneId, paneMap] of this.paneValues.entries()) {
          // Only include panes that belong to the active tab
          if (this.paneToTab.get(paneId) === this.activeTabId) {
            const value = paneMap.get(property);
            if (value !== undefined) {
              values.push(value);
            }
          }
        }
      }

      return this.aggregateValues(values, aggregateMode);
    }

    // Parse sourceKey to determine what to aggregate
    // Format: "level.property" where level can be activePane, activeTab, etc.
    if (sourceKey.startsWith('activePane.')) {
      // Aggregate from all panes across all tabs
      const property = sourceKey.substring('activePane.'.length);
      const values: unknown[] = [];
      for (const paneMap of this.paneValues.values()) {
        const value = paneMap.get(property);
        if (value !== undefined) {
          values.push(value);
        }
      }
      return this.aggregateValues(values, aggregateMode);
    }

    if (sourceKey.startsWith('activeTab.')) {
      // Aggregate from all tabs
      const property = sourceKey.substring('activeTab.'.length);
      const values: unknown[] = [];
      for (const tabMap of this.tabValues.values()) {
        const value = tabMap.get(property);
        if (value !== undefined) {
          values.push(value);
        }
      }
      return this.aggregateValues(values, aggregateMode);
    }

    return undefined;
  }

  getAll(): ContextValues {
    const values: ContextValues = {};

    // Collect global values
    for (const [key, value] of this.globalValues) {
      values[key] = value;
    }

    // Collect activeTab.* values
    if (this.activeTabId) {
      const tabMap = this.tabValues.get(this.activeTabId);
      if (tabMap) {
        for (const [key, value] of tabMap) {
          values[`activeTab.${key}`] = value;
        }
      }
    }

    // Collect activePane.* values
    if (this.activePaneId) {
      const paneMap = this.paneValues.get(this.activePaneId);
      if (paneMap) {
        for (const [key, value] of paneMap) {
          values[`activePane.${key}`] = value;
        }
      }
    }

    return values;
  }

  onDidChangeContext(listener: (key: string, value: unknown) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyChange(key: string, value: unknown): void {
    for (const listener of this.listeners) {
      listener(key, value);
    }
  }

  private recomputeActivePaneKeys(): void {
    // When active pane changes, recompute all activePane.* keys
    if (!this.activePaneId) {
      return;
    }

    const paneMap = this.paneValues.get(this.activePaneId);
    if (!paneMap) {
      return;
    }

    for (const [key, value] of paneMap) {
      const activePaneKey = `activePane.${key}`;
      this.notifyChange(activePaneKey, value);
    }
  }

  private recomputeActiveTabKeys(): void {
    // When active tab changes, recompute all activeTab.* keys
    if (!this.activeTabId) {
      return;
    }

    const tabMap = this.tabValues.get(this.activeTabId);
    if (!tabMap) {
      return;
    }

    for (const [key, value] of tabMap) {
      const activeTabKey = `activeTab.${key}`;
      this.notifyChange(activeTabKey, value);
    }
  }

  private aggregatePaneToTab(key: string): void {
    // Find the context key definition
    const targetKey = `activeTab.${key}`;

    // Check if there's a derived key at tab level
    const derivedKey = this.keyRegistry.get(targetKey);
    if (!derivedKey || !('getAggregateMode' in derivedKey)) {
      return;
    }

    // Get current tab's panes (we'll need tab service for this)
    // For now, aggregate across ALL panes in active tab
    // TODO: Integrate with tab service to get panes for specific tab

    const aggregateMode = derivedKey.getAggregateMode();
    const aggregatedValue = this.aggregateValues(
      Array.from(this.paneValues.values()).map(m => m.get(key)),
      aggregateMode
    );

    // Store aggregated value at tab level
    if (this.activeTabId) {
      this.setTabProperty(this.activeTabId, key, aggregatedValue);
    }
  }

  private aggregatePaneToGlobal(key: string): void {
    // Find the context key definition
    const targetKey = key;

    // Check if there's a derived key at global level
    const derivedKey = this.keyRegistry.get(targetKey);
    if (!derivedKey || !('getAggregateMode' in derivedKey)) {
      return;
    }

    // Aggregate across ALL panes
    const aggregateMode = derivedKey.getAggregateMode();
    const allPaneValues: unknown[] = [];
    for (const paneMap of this.paneValues.values()) {
      const value = paneMap.get(key);
      if (value !== undefined) {
        allPaneValues.push(value);
      }
    }

    const aggregatedValue = this.aggregateValues(allPaneValues, aggregateMode);
    this.setGlobal(targetKey, aggregatedValue);
  }

  private aggregateTabToGlobal(key: string): void {
    // Find the context key definition
    const targetKey = key;

    // Check if there's a derived key at global level
    const derivedKey = this.keyRegistry.get(targetKey);
    if (!derivedKey || !('getAggregateMode' in derivedKey)) {
      return;
    }

    // Aggregate across ALL tabs
    const aggregateMode = derivedKey.getAggregateMode();
    const allTabValues: unknown[] = [];
    for (const tabMap of this.tabValues.values()) {
      const value = tabMap.get(key);
      if (value !== undefined) {
        allTabValues.push(value);
      }
    }

    const aggregatedValue = this.aggregateValues(allTabValues, aggregateMode);
    this.setGlobal(targetKey, aggregatedValue);
  }

  private aggregateValues(values: unknown[], mode: AggregateMode): unknown {
    switch (mode) {
      case AggregateMode.Any:
        return values.some(v => !!v);

      case AggregateMode.All:
        return values.every(v => !!v);

      case AggregateMode.Count:
        return values.filter(v => !!v).length;

      case AggregateMode.First:
        return values[0];

      default:
        return undefined;
    }
  }
}
