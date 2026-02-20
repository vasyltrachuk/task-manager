import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateRuleCondition } from './condition-evaluator';

describe('rulebook condition evaluator', () => {
  const profile = {
    employee_count: 12,
    has_employees: true,
    status: 'active',
    tax_system: 'general_vat',
    tax_tags: ['vat', 'excise'],
    nested: {
      value: 3,
    },
  };

  it('returns true for empty condition (no filter)', () => {
    assert.equal(evaluateRuleCondition({}, profile), true);
    assert.equal(evaluateRuleCondition(null, profile), true);
  });

  it('supports all + any grouping', () => {
    const condition = {
      all: [
        { field: 'employee_count', op: 'gt', value: 10 },
        { field: 'has_employees', op: 'eq', value: true },
      ],
      any: [
        { field: 'tax_system', op: 'eq', value: 'general_vat' },
        { field: 'status', op: 'eq', value: 'onboarding' },
      ],
    } as const;

    assert.equal(evaluateRuleCondition(condition, profile), true);
  });

  it('supports contains/in/nin/exists ops', () => {
    assert.equal(
      evaluateRuleCondition({ field: 'tax_tags', op: 'contains', value: 'excise' }, profile),
      true
    );
    assert.equal(
      evaluateRuleCondition({ field: 'status', op: 'in', value: ['active', 'onboarding'] }, profile),
      true
    );
    assert.equal(
      evaluateRuleCondition({ field: 'status', op: 'nin', value: ['archived'] }, profile),
      true
    );
    assert.equal(
      evaluateRuleCondition({ field: 'nested.value', op: 'exists' }, profile),
      true
    );
    assert.equal(
      evaluateRuleCondition({ field: 'nested.unknown', op: 'exists' }, profile),
      false
    );
  });
});
