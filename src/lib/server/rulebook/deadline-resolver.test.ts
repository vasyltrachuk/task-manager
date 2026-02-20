import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enumeratePeriodsInRange, resolveDueDateForPeriod } from './deadline-resolver';
import type { DueRuleConfig, RuleRecurrenceConfig } from './types';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('rulebook deadline resolver', () => {
  it('enumerates monthly periods', () => {
    const recurrence: RuleRecurrenceConfig = { kind: 'monthly' };
    const periods = enumeratePeriodsInRange(d('2026-01-10'), d('2026-03-05'), recurrence);

    assert.equal(periods.length, 3);
    assert.equal(periods[0].periodKey, '2026-01');
    assert.equal(periods[1].periodKey, '2026-02');
    assert.equal(periods[2].periodKey, '2026-03');
  });

  it('builds semi-monthly key with event', () => {
    const recurrence: RuleRecurrenceConfig = { kind: 'semi_monthly', event: 'advance' };
    const periods = enumeratePeriodsInRange(d('2026-01-01'), d('2026-01-31'), recurrence);

    assert.equal(periods.length, 1);
    assert.equal(periods[0].periodKey, '2026-01-advance');
  });

  it('resolves day_of_month and shifts from weekend to previous business day', () => {
    const recurrence: RuleRecurrenceConfig = { kind: 'monthly' };
    const [period] = enumeratePeriodsInRange(d('2026-03-01'), d('2026-03-31'), recurrence);
    const dueRule: DueRuleConfig = {
      kind: 'day_of_month',
      day: 15, // 2026-03-15 is Sunday
      shift_if_non_business_day: 'prev_business_day',
    };

    const resolved = resolveDueDateForPeriod(period, dueRule);
    assert.equal(resolved.dueDate.toISOString().slice(0, 10), '2026-03-13');
  });

  it('resolves quarterly due date by days_after_period_end', () => {
    const recurrence: RuleRecurrenceConfig = { kind: 'quarterly' };
    const [period] = enumeratePeriodsInRange(d('2026-01-01'), d('2026-03-31'), recurrence);
    const dueRule: DueRuleConfig = {
      kind: 'days_after_period_end',
      days: 40,
      shift_if_non_business_day: 'none',
    };

    const resolved = resolveDueDateForPeriod(period, dueRule);
    assert.equal(period.periodKey, '2026-Q1');
    assert.equal(resolved.dueDate.toISOString().slice(0, 10), '2026-05-10');
  });

  it('resolves profile_day_of_month using payroll day from profile values', () => {
    const recurrence: RuleRecurrenceConfig = { kind: 'semi_monthly', event: 'advance' };
    const [period] = enumeratePeriodsInRange(d('2026-02-01'), d('2026-02-28'), recurrence);
    const dueRule: DueRuleConfig = {
      kind: 'profile_day_of_month',
      profile_field: 'payroll_advance_day',
      shift_if_non_business_day: 'none',
    };

    const resolved = resolveDueDateForPeriod(period, dueRule, {
      profileDayValues: {
        payroll_advance_day: 7,
        payroll_final_day: 22,
      },
    });

    assert.equal(resolved.dueDate.toISOString().slice(0, 10), '2026-02-07');
  });
});
