import { describe, it, expect } from 'vitest';
import { formatDuration, formatCost } from '../formatters';

describe('formatDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(30)).toBe('30s');
    expect(formatDuration(59)).toBe('59s');
  });

  it('formats seconds under one hour as minutes', () => {
    expect(formatDuration(60)).toBe('1m');
    expect(formatDuration(3599)).toBe('59m');
  });

  it('formats seconds over one hour with hours and minutes', () => {
    expect(formatDuration(3600)).toBe('1h 0m');
    expect(formatDuration(3661)).toBe('1h 1m');
    expect(formatDuration(7322)).toBe('2h 2m');
    expect(formatDuration(86399)).toBe('23h 59m');
  });

  it('handles large values', () => {
    expect(formatDuration(360000)).toBe('100h 0m');
  });
});

describe('formatCost', () => {
  it('formats zero cost', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats positive costs to 2 decimal places', () => {
    expect(formatCost(1)).toBe('$1.00');
    expect(formatCost(0.5)).toBe('$0.50');
    expect(formatCost(12.345)).toBe('$12.35');
  });

  it('shows 4 decimal places for very small costs', () => {
    expect(formatCost(0.001)).toBe('$0.0010');
    expect(formatCost(0.0099)).toBe('$0.0099');
    expect(formatCost(0.01)).toBe('$0.01');
  });

  it('formats costs without losing precision on display', () => {
    expect(formatCost(100.99)).toBe('$100.99');
  });
});
