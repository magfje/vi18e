/**
 * Shared scoring utilities (used in both TM implementation and renderer UI).
 */

/** Compute normalised Levenshtein distance between two strings (0.0 = identical, 1.0 = completely different) */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return 1

  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[b.length][a.length] / Math.max(a.length, b.length)
}

/** Convert edit distance to a suggestion score (1.0 = exact, 0.0 = too different) */
export function distanceToScore(distance: number): number {
  return 1.0 - distance
}

/** Minimum score to include a fuzzy TM match in results */
export const MIN_FUZZY_SCORE = 0.5

/** Sort suggestions by score desc, then storedAt desc for ties */
export function sortSuggestions<T extends { score: number; storedAt: number }>(
  suggestions: T[]
): T[] {
  return [...suggestions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.storedAt - a.storedAt
  })
}
