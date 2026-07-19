/**
 * @param {number} current
 * @param {number} resultCount
 * @param {1 | -1} direction
 */
export function moveSearchSelection(current, resultCount, direction) {
  if (resultCount <= 0) return 0;
  return Math.max(0, Math.min(current + direction, resultCount - 1));
}

/**
 * @template T
 * @param {T[]} results
 * @param {number} activeIndex
 * @param {boolean} loading
 * @returns {T | undefined}
 */
export function selectedSearchResult(results, activeIndex, loading) {
  return loading ? undefined : results[activeIndex];
}
