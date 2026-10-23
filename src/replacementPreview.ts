import { findDocumentMatches, type FindOptions } from './parser';

export function previewDocumentReplacement(value: string, query: string, replacement: string, options: FindOptions = {}) {
  const matches = findDocumentMatches(value, query, options);
  return {
    total: matches.length,
    entries: matches.slice(0, 5).map(start => ({
      start,
      end: start + query.length,
      before: value.slice(Math.max(0, start - 40), start),
      match: value.slice(start, start + query.length),
      replacement,
      after: value.slice(start + query.length, start + query.length + 40),
    })),
  };
}
