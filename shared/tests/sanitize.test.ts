import { describe, expect, it } from 'vitest';
import { csvSafe, isUnsafeKey, sanitizeText } from '../src/sanitize';

describe('sanitizeText', () => {
  it.each([
    ['<script>alert(1)</script>Priya', 'alert(1)Priya'],
    ['<img src=x onerror=alert(1)>Rahul', 'Rahul'],
    ['javascript:alert(1)', 'alert(1)'],
    ['  Meera   Krishnan  ', 'Meera Krishnan'],
    ['Bad\u0000Name\u0007', 'BadName'],
    ['<b>Pro</b> plan', 'Pro plan'],
  ])('cleans %j', (input, expected) => {
    expect(sanitizeText(input)).toBe(expected);
  });

  it('keeps ordinary punctuation and non-Latin letters', () => {
    expect(sanitizeText("O'Brien-Smith Jr. — ₹799 · शर्मा")).toBe(
      "O'Brien-Smith Jr. — ₹799 · शर्मा",
    );
  });
});

describe('isUnsafeKey', () => {
  it.each(['$gt', '$where', 'a.b', '__proto__', 'constructor', 'prototype'])('flags %s', (key) => {
    expect(isUnsafeKey(key)).toBe(true);
  });

  it('allows normal keys', () => {
    expect(isUnsafeKey('email')).toBe(false);
  });
});

describe('csvSafe', () => {
  it.each(['=SUM(A1)', '+1', '-1', '@cmd', '\tx'])('neutralises %j', (value) => {
    expect(csvSafe(value)).toBe(`'${value}`);
  });

  it('leaves normal text alone', () => {
    expect(csvSafe('Priya Sharma')).toBe('Priya Sharma');
  });
});
