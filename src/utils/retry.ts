export function calcNextRetryDate(failCount: number): Date {
  const intervals = [1, 3, 7, 14]
  const days = intervals[Math.min(failCount - 1, intervals.length - 1)]
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}
