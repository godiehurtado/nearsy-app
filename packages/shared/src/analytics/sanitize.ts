/**
 * Validates outgoing values against the contract. Invalid values are dropped
 * and reported by name only, never by content.
 */
import { FORBIDDEN_PROPERTY_NAMES, type PropertyRule } from './contract';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._+-]*$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;
const ISO_DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export type AnalyticsValue = string | number | boolean | readonly string[];

export function isValidValue(rule: PropertyRule, value: unknown): boolean {
  switch (rule.kind) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'int':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= rule.min &&
        value <= rule.max
      );
    case 'number':
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= rule.min &&
        value <= rule.max
      );
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value);
    case 'id':
      return (
        typeof value === 'string' &&
        value.length <= rule.maxLength &&
        ID_RE.test(value)
      );
    case 'text':
      return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= rule.maxLength
      );
    case 'email':
      return (
        typeof value === 'string' && value.length <= 254 && EMAIL_RE.test(value)
      );
    case 'country':
      return typeof value === 'string' && COUNTRY_RE.test(value);
    case 'isoDateTime':
      return typeof value === 'string' && ISO_DATE_TIME_RE.test(value);
    case 'list':
      return (
        Array.isArray(value) &&
        value.length <= rule.maxItems &&
        value.every(
          (item) =>
            typeof item === 'string' &&
            item.length > 0 &&
            item.length <= rule.maxItemLength &&
            (rule.item === 'text' || ID_RE.test(item)),
        )
      );
  }
}

export type SanitizeResult = {
  values: Record<string, AnalyticsValue>;
  droppedNames: string[];
};

export function sanitizeProperties(
  rules: Readonly<Record<string, PropertyRule>>,
  input: Readonly<Record<string, unknown>> | undefined,
): SanitizeResult {
  const values: Record<string, AnalyticsValue> = {};
  const droppedNames: string[] = [];
  for (const [name, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null) continue;
    const rule = Object.prototype.hasOwnProperty.call(rules, name)
      ? rules[name]
      : undefined;
    if (
      !rule ||
      FORBIDDEN_PROPERTY_NAMES.has(name) ||
      !isValidValue(rule, value)
    ) {
      droppedNames.push(name);
      continue;
    }
    values[name] = value as AnalyticsValue;
  }
  return { values, droppedNames };
}
