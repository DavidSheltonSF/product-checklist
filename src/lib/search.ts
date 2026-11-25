import type { CollectionEntry, Product } from './db';

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function isFuzzyMatch(term: string, value: string): boolean {
  if (term.length < 4) return false;
  const allowedDistance = term.length <= 6 ? 1 : 2;

  return value
    .split(' ')
    .some((word) => {
      if (Math.abs(word.length - term.length) > allowedDistance) return false;
      return levenshteinDistance(term, word) <= allowedDistance;
    });
}

export function matchesSearch(item: Product | CollectionEntry, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const terms = normalizedQuery.split(' ');
  const fields = [
    item.name,
    item.reference_code,
    item.importer,
    item.manufacturer,
    'unit' in item ? item.unit : null,
  ];
  const normalizedFields = fields
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText);

  if (normalizedFields.length === 0) return false;

  const searchableText = normalizedFields.join(' ');
  const compactFields = normalizedFields.map((field) => field.replace(/\s/g, '')).join(' ');

  return terms.every((term) => {
    if (searchableText.includes(term)) return true;
    if (compactFields.includes(term) || compactFields.replace(/\s/g, '').includes(term)) return true;
    return normalizedFields.some((field) => isFuzzyMatch(term, field));
  });
}
