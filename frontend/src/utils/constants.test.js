import { describe, it, expect } from 'vitest';
import { getApiCost, getApiCategoryMeta, groupApisByCategory } from './constants';

describe('utils/constants', () => {
  it('getApiCost falls back cost -> cost_weight -> 1', () => {
    expect(getApiCost({ cost: 3 })).toBe(3);
    expect(getApiCost({ cost_weight: 2 })).toBe(2);
    expect(getApiCost({})).toBe(1);
  });

  it('getApiCategoryMeta falls back to general for unknown categories', () => {
    expect(getApiCategoryMeta('made-up')).toEqual(getApiCategoryMeta('general'));
  });

  it('groupApisByCategory groups by category and sorts items by name', () => {
    const grouped = groupApisByCategory([
      { id: '1', name: 'B API', category: 'news' },
      { id: '2', name: 'A API', category: 'news' },
      { id: '3', name: 'Quote', category: 'market' },
    ]);
    expect(grouped.map((g) => g.category)).toEqual(['news', 'market']);
    expect(grouped[0].items.map((a) => a.name)).toEqual(['A API', 'B API']);
  });
});
