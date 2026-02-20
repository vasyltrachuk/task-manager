import type { RuleConditionNode, RuleConditionPredicate } from './types';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPredicate(value: unknown): value is RuleConditionPredicate {
  return isObject(value) && typeof value.field === 'string' && typeof value.op === 'string';
}

function getByPath(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let cursor: unknown = record;

  for (const part of parts) {
    if (!isObject(cursor) && !Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }

  return cursor;
}

function normalizeComparable(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  return value;
}

function evaluatePredicate(
  predicate: RuleConditionPredicate,
  profile: Record<string, unknown>
): boolean {
  const left = normalizeComparable(getByPath(profile, predicate.field));
  const right = normalizeComparable(predicate.value);

  switch (predicate.op) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'gt':
      return typeof left === 'number' && typeof right === 'number' && left > right;
    case 'gte':
      return typeof left === 'number' && typeof right === 'number' && left >= right;
    case 'lt':
      return typeof left === 'number' && typeof right === 'number' && left < right;
    case 'lte':
      return typeof left === 'number' && typeof right === 'number' && left <= right;
    case 'in':
      return Array.isArray(right) && right.includes(left);
    case 'nin':
      return Array.isArray(right) && !right.includes(left);
    case 'contains':
      if (Array.isArray(left)) return left.includes(right);
      if (typeof left === 'string' && typeof right === 'string') return left.includes(right);
      return false;
    case 'exists':
      return left !== undefined && left !== null;
    default:
      return false;
  }
}

function evaluateNode(node: RuleConditionNode, profile: Record<string, unknown>): boolean {
  if (isPredicate(node)) {
    return evaluatePredicate(node, profile);
  }

  if (!isObject(node)) return false;

  const all = Array.isArray(node.all) ? node.all : [];
  const any = Array.isArray(node.any) ? node.any : [];

  const allPassed = all.length === 0 || all.every((child) => evaluateNode(child, profile));
  const anyPassed = any.length === 0 || any.some((child) => evaluateNode(child, profile));

  return allPassed && anyPassed;
}

/**
 * Evaluates rulebook JSON conditions against a normalized client profile.
 *
 * Empty or invalid condition payload is treated as "no filter" (true).
 */
export function evaluateRuleCondition(
  rawCondition: RuleConditionNode | Record<string, unknown> | null | undefined,
  profile: Record<string, unknown>
): boolean {
  if (!rawCondition || !isObject(rawCondition)) return true;
  return evaluateNode(rawCondition as RuleConditionNode, profile);
}
