import { describe, it, expect } from 'vitest';
import { ContextKey } from '@/commands/contextKeys/ContextKey';
import { ContextLevel, AggregateMode } from '@/commands/contextKeys/types';
import { When } from '@/commands/whenClauses/When';

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

describe('ContextKey when clause methods', () => {
  describe('toWhenClause()', () => {
    it('should evaluate truthiness correctly', () => {
      const key = new ContextKey('testKey', false);
      const whenClause = key.toWhenClause();

      expect(whenClause.evaluate({ testKey: true })).toBe(true);
      expect(whenClause.evaluate({ testKey: false })).toBe(false);
      expect(whenClause.evaluate({ testKey: 'string' })).toBe(true);
      expect(whenClause.evaluate({ testKey: 0 })).toBe(false);
    });

    it('should use default value when key is missing', () => {
      const key = new ContextKey('testKey', true);
      const whenClause = key.toWhenClause();

      expect(whenClause.evaluate({})).toBe(true);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', false);
      const whenClause = key.toWhenClause();

      expect(whenClause.toString()).toBe('myKey');
    });
  });

  describe('isTrue()', () => {
    it('should only match true', () => {
      const key = new ContextKey('testKey', false);
      const whenClause = key.isTrue();

      expect(whenClause.evaluate({ testKey: true })).toBe(true);
      expect(whenClause.evaluate({ testKey: false })).toBe(false);
      expect(whenClause.evaluate({ testKey: 1 })).toBe(false);
      expect(whenClause.evaluate({ testKey: 'true' })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', false);
      const whenClause = key.isTrue();

      expect(whenClause.toString()).toBe('myKey');
    });
  });

  describe('isFalse()', () => {
    it('should only match false', () => {
      const key = new ContextKey('testKey', true);
      const whenClause = key.isFalse();

      expect(whenClause.evaluate({ testKey: false })).toBe(true);
      expect(whenClause.evaluate({ testKey: true })).toBe(false);
      expect(whenClause.evaluate({ testKey: 0 })).toBe(false);
      expect(whenClause.evaluate({ testKey: '' })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', false);
      const whenClause = key.isFalse();

      expect(whenClause.toString()).toBe('!myKey');
    });
  });

  describe('isDefined()', () => {
    it('should check for non-undefined', () => {
      const key = new ContextKey('testKey', 'default');
      const whenClause = key.isDefined();

      expect(whenClause.evaluate({ testKey: 'value' })).toBe(true);
      expect(whenClause.evaluate({ testKey: null })).toBe(true);
      expect(whenClause.evaluate({ testKey: 0 })).toBe(true);
      expect(whenClause.evaluate({ testKey: false })).toBe(true);
      expect(whenClause.evaluate({})).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', 'default');
      const whenClause = key.isDefined();

      expect(whenClause.toString()).toBe('myKey');
    });
  });

  describe('isUndefined()', () => {
    it('should check for undefined', () => {
      const key = new ContextKey('testKey', 'default');
      const whenClause = key.isUndefined();

      expect(whenClause.evaluate({})).toBe(true);
      expect(whenClause.evaluate({ testKey: 'value' })).toBe(false);
      expect(whenClause.evaluate({ testKey: null })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', 'default');
      const whenClause = key.isUndefined();

      expect(whenClause.toString()).toBe('!myKey');
    });
  });

  describe('equals()', () => {
    it('should match exact value', () => {
      const key = new ContextKey('testKey', 'default');
      const whenClause = key.equals('target');

      expect(whenClause.evaluate({ testKey: 'target' })).toBe(true);
      expect(whenClause.evaluate({ testKey: 'other' })).toBe(false);
      expect(whenClause.evaluate({})).toBe(false);
    });

    it('should work with numbers', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.equals(42);

      expect(whenClause.evaluate({ count: 42 })).toBe(true);
      expect(whenClause.evaluate({ count: 0 })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', 'default');
      const whenClause = key.equals('value');

      expect(whenClause.toString()).toBe('myKey == "value"');
    });
  });

  describe('notEquals()', () => {
    it('should match non-equal values', () => {
      const key = new ContextKey('testKey', 'default');
      const whenClause = key.notEquals('target');

      expect(whenClause.evaluate({ testKey: 'other' })).toBe(true);
      expect(whenClause.evaluate({ testKey: 'target' })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', 'default');
      const whenClause = key.notEquals('value');

      expect(whenClause.toString()).toBe('myKey != "value"');
    });
  });

  describe('greaterThan()', () => {
    it('should compare numbers', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.greaterThan(10);

      expect(whenClause.evaluate({ count: 15 })).toBe(true);
      expect(whenClause.evaluate({ count: 10 })).toBe(false);
      expect(whenClause.evaluate({ count: 5 })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.greaterThan(10);

      expect(whenClause.toString()).toBe('count > 10');
    });
  });

  describe('greaterThanOrEqual()', () => {
    it('should compare numbers with equality', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.greaterThanOrEqual(10);

      expect(whenClause.evaluate({ count: 15 })).toBe(true);
      expect(whenClause.evaluate({ count: 10 })).toBe(true);
      expect(whenClause.evaluate({ count: 5 })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.greaterThanOrEqual(10);

      expect(whenClause.toString()).toBe('count >= 10');
    });
  });

  describe('lessThan()', () => {
    it('should compare numbers', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.lessThan(10);

      expect(whenClause.evaluate({ count: 5 })).toBe(true);
      expect(whenClause.evaluate({ count: 10 })).toBe(false);
      expect(whenClause.evaluate({ count: 15 })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.lessThan(10);

      expect(whenClause.toString()).toBe('count < 10');
    });
  });

  describe('lessThanOrEqual()', () => {
    it('should compare numbers with equality', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.lessThanOrEqual(10);

      expect(whenClause.evaluate({ count: 5 })).toBe(true);
      expect(whenClause.evaluate({ count: 10 })).toBe(true);
      expect(whenClause.evaluate({ count: 15 })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('count', 0);
      const whenClause = key.lessThanOrEqual(10);

      expect(whenClause.toString()).toBe('count <= 10');
    });
  });

  describe('matches()', () => {
    it('should test regex patterns', () => {
      const key = new ContextKey('text', '');
      const whenClause = key.matches(/^test/);

      expect(whenClause.evaluate({ text: 'testing' })).toBe(true);
      expect(whenClause.evaluate({ text: 'test' })).toBe(true);
      expect(whenClause.evaluate({ text: 'other' })).toBe(false);
    });

    it('should return false for non-string values', () => {
      const key = new ContextKey('value', '');
      const whenClause = key.matches(/test/);

      expect(whenClause.evaluate({ value: 123 })).toBe(false);
      expect(whenClause.evaluate({ value: true })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('text', '');
      const whenClause = key.matches(/^test/);

      expect(whenClause.toString()).toBe('text =~ /^test/');
    });
  });

  describe('negate()', () => {
    it('should invert result', () => {
      const key = new ContextKey('testKey', false);
      const whenClause = key.negate();

      expect(whenClause.evaluate({ testKey: false })).toBe(true);
      expect(whenClause.evaluate({ testKey: true })).toBe(false);
      expect(whenClause.evaluate({ testKey: 'string' })).toBe(false);
    });

    it('should format toString correctly', () => {
      const key = new ContextKey('myKey', false);
      const whenClause = key.negate();

      expect(whenClause.toString()).toBe('!myKey');
    });
  });

  describe('complex when clause combinations', () => {
    it('should work with When.and()', () => {
      const key1 = new ContextKey('key1', false);
      const key2 = new ContextKey('key2', false);

      const combined = When.and(key1.isTrue(), key2.isTrue());

      expect(combined.evaluate({ key1: true, key2: true })).toBe(true);
      expect(combined.evaluate({ key1: true, key2: false })).toBe(false);
      expect(combined.toString()).toBe('(key1 && key2)');
    });

    it('should work with When.or()', () => {
      const key1 = new ContextKey('key1', false);
      const key2 = new ContextKey('key2', false);

      const combined = When.or(key1.isTrue(), key2.isTrue());

      expect(combined.evaluate({ key1: true, key2: false })).toBe(true);
      expect(combined.evaluate({ key1: false, key2: false })).toBe(false);
      expect(combined.toString()).toBe('(key1 || key2)');
    });

    it('should create complex nested expressions', () => {
      const focus = new ContextKey('focus', false);
      const count = new ContextKey('count', 0);
      const mode = new ContextKey('mode', '');

      // focus && count > 0 && mode == "edit"
      const complex = When.and(
        focus.isTrue(),
        count.greaterThan(0),
        mode.equals('edit')
      );

      expect(complex.evaluate({ focus: true, count: 5, mode: 'edit' })).toBe(true);
      expect(complex.evaluate({ focus: false, count: 5, mode: 'edit' })).toBe(false);
      expect(complex.evaluate({ focus: true, count: 0, mode: 'edit' })).toBe(false);
      expect(complex.evaluate({ focus: true, count: 5, mode: 'view' })).toBe(false);
    });
  });
});
