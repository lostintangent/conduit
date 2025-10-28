import { describe, it, expect } from 'vitest';
import { ContextKey } from '../ContextKey';
import { ContextLevel, AggregateMode } from '../types';

describe('ContextKey', () => {
  it('should construct with key and default value', () => {
    const key = new ContextKey('testKey', true);
    expect(key.getKey()).toBe('testKey');
    expect(key.getDefault()).toBe(true);
  });

  it('should construct with config', () => {
    const config = { level: ContextLevel.Pane, aggregate: AggregateMode.Any };
    const key = new ContextKey('testKey', false, config);
    expect(key.getConfig()).toEqual(config);
  });

  it('should return undefined config when not provided', () => {
    const key = new ContextKey('testKey', 'value');
    expect(key.getConfig()).toBeUndefined();
  });

  it('should support different value types', () => {
    const boolKey = new ContextKey('bool', true);
    const stringKey = new ContextKey('string', 'test');
    const numberKey = new ContextKey('number', 42);

    expect(boolKey.getDefault()).toBe(true);
    expect(stringKey.getDefault()).toBe('test');
    expect(numberKey.getDefault()).toBe(42);
  });
});
