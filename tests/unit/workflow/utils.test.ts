/**
 * Tests for Workflow Utilities
 */

import { describe, it , expect } from 'vitest'
import {
  generateId,
  renderTemplate,
  extractValue,
  mergeContext,
  evaluateCondition,
  createContext,
} from '@/workflow/utils';

describe('Workflow Utilities', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should generate IDs with correct prefix', () => {
      const id = generateId('test');
      expect(id.startsWith('test-')).toBeTruthy();
    });

    it('should generate IDs with default prefix', () => {
      const id = generateId();
      expect(id.startsWith('id-')).toBeTruthy();
    });

    it('should generate IDs with correct format', () => {
      const id = generateId('execution');
      const parts = id.split('-');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('execution');
      expect(!isNaN(parseInt(parts[1]))).toBeTruthy(); // timestamp
      expect(parts[2].length > 0).toBeTruthy(); // random component
    });
  });

  describe('renderTemplate', () => {
    it('should replace single variable', () => {
      const context = { name: 'World' };
      const result = renderTemplate('Hello {{name}}', context);
      expect(result).toBe('Hello World');
    });

    it('should replace multiple variables', () => {
      const context = { name: 'Alice', age: 30 };
      const result = renderTemplate(
        'Hello {{name}}, you are {{age}} years old',
        context
      );
      expect(result).toBe('Hello Alice, you are 30 years old');
    });

    it('should replace multiple occurrences of same variable', () => {
      const context = { value: 'test' };
      const result = renderTemplate('{{value}} and {{value}}', context);
      expect(result).toBe('test and test');
    });

    it('should handle missing variables by leaving placeholder', () => {
      const context = { name: 'World' };
      const result = renderTemplate('Hello {{name}}, age {{age}}', context);
      expect(result).toBe('Hello World, age {{age}}');
    });

    it('should handle nested context paths', () => {
      const context = {
        user: { name: 'Bob', email: 'bob@test.com' },
      };
      const result = renderTemplate(
        'User: {{user.name}}, Email: {{user.email}}',
        context
      );
      expect(result).toBe('User: Bob, Email: bob@test.com');
    });

    it('should handle empty template', () => {
      const context = { name: 'World' };
      const result = renderTemplate('', context);
      expect(result).toBe('');
    });

    it('should handle template with no placeholders', () => {
      const context = { name: 'World' };
      const result = renderTemplate('Hello World', context);
      expect(result).toBe('Hello World');
    });

    it('should convert non-string values to strings', () => {
      const context = { count: 42, enabled: true };
      const result = renderTemplate('Count: {{count}}, Enabled: {{enabled}}', context);
      expect(result).toBe('Count: 42, Enabled: true');
    });

    it('should handle null values', () => {
      const context = { value: null };
      const result = renderTemplate('Value: {{value}}', context);
      expect(result).toBe('Value: {{value}}');
    });

    it('should handle undefined values', () => {
      const context = { value: undefined };
      const result = renderTemplate('Value: {{value}}', context);
      expect(result).toBe('Value: {{value}}');
    });
  });

  describe('extractValue', () => {
    it('should extract simple value', () => {
      const obj = { name: 'Alice' };
      const result = extractValue(obj, 'name');
      expect(result).toBe('Alice');
    });

    it('should extract nested value', () => {
      const obj = { user: { profile: { name: 'Bob' } } };
      const result = extractValue(obj, 'user.profile.name');
      expect(result).toBe('Bob');
    });

    it('should return undefined for non-existent path', () => {
      const obj = { name: 'Alice' };
      const result = extractValue(obj, 'age');
      expect(result).toBe(undefined);
    });

    it('should return undefined for non-existent nested path', () => {
      const obj = { user: { name: 'Alice' } };
      const result = extractValue(obj, 'user.profile.name');
      expect(result).toBe(undefined);
    });

    it('should handle null object', () => {
      const result = extractValue(null, 'name');
      expect(result).toBe(undefined);
    });

    it('should handle undefined object', () => {
      const result = extractValue(undefined, 'name');
      expect(result).toBe(undefined);
    });

    it('should handle array values', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const result = extractValue(obj, 'items');
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('should handle array indexing', () => {
      const obj = { items: ['a', 'b', 'c'] };
      const result = extractValue(obj, 'items.1');
      expect(result).toBe('b');
    });

    it('should handle deeply nested objects', () => {
      const obj = {
        level1: {
          level2: {
            level3: {
              level4: { value: 'deep' },
            },
          },
        },
      };
      const result = extractValue(obj, 'level1.level2.level3.level4.value');
      expect(result).toBe('deep');
    });
  });

  describe('mergeContext', () => {
    it('should merge two contexts', () => {
      const base = { a: 1 };
      const updates = { b: 2 };
      const result = mergeContext(base, updates);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should override existing keys', () => {
      const base = { a: 1, b: 2 };
      const updates = { b: 3, c: 4 };
      const result = mergeContext(base, updates);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should handle empty base', () => {
      const base = {};
      const updates = { a: 1 };
      const result = mergeContext(base, updates);
      expect(result).toEqual({ a: 1 });
    });

    it('should handle empty updates', () => {
      const base = { a: 1 };
      const updates = {};
      const result = mergeContext(base, updates);
      expect(result).toEqual({ a: 1 });
    });

    it('should not mutate original contexts', () => {
      const base = { a: 1 };
      const updates = { b: 2 };
      const result = mergeContext(base, updates);

      expect(base).toEqual({ a: 1 });
      expect(updates).toEqual({ b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });
  });

  describe('evaluateCondition', () => {
    it('should evaluate true condition', () => {
      const context = { isEnabled: true };
      const result = evaluateCondition('{{isEnabled}}', context);
      expect(result).toBe(true);
    });

    it('should evaluate false condition', () => {
      const context = { isEnabled: false };
      const result = evaluateCondition('{{isEnabled}}', context);
      expect(result).toBe(false);
    });

    it('should evaluate string "true" as true', () => {
      const context = { value: 'true' };
      const result = evaluateCondition('{{value}}', context);
      expect(result).toBe(true);
    });

    it('should evaluate string "false" as false', () => {
      const context = { value: 'false' };
      const result = evaluateCondition('{{value}}', context);
      expect(result).toBe(false);
    });

    it('should evaluate "1" as true', () => {
      const context = { value: '1' };
      const result = evaluateCondition('{{value}}', context);
      expect(result).toBe(true);
    });

    it('should evaluate "0" as false', () => {
      const context = { value: '0' };
      const result = evaluateCondition('{{value}}', context);
      expect(result).toBe(false);
    });

    it('should evaluate empty string as false', () => {
      const context = { value: '' };
      const result = evaluateCondition('{{value}}', context);
      expect(result).toBe(false);
    });

    it('should evaluate non-empty string as true', () => {
      const context = { value: 'any text' };
      const result = evaluateCondition('{{value}}', context);
      expect(result).toBe(true);
    });

    it('should evaluate missing variable as false', () => {
      const context = {};
      const result = evaluateCondition('{{missing}}', context);
      expect(result).toBe(false);
    });
  });

  describe('createContext', () => {
    it('should create empty context', () => {
      const context = createContext();
      expect(context).toEqual({});
    });

    it('should create context with initial values', () => {
      const context = createContext({ name: 'test', value: 42 });
      expect(context).toEqual({ name: 'test', value: 42 });
    });

    it('should not mutate initial values', () => {
      const initial = { name: 'test' };
      const context = createContext(initial);

      context.name = 'modified';
      expect(initial.name).toBe('test');
    });
  });
});
