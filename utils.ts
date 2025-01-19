/**
 * `a.slice(0, longestCommonPrefix(a,b))` will be the common prefix
 */
export function longestCommonPrefix(a: string, b: string): number {
  const end = Math.min(a.length, b.length);
  let i = 0;
  for (; i < end; i++) {
    if (a[i] !== b[i]) { return i; }
  }
  return i + 1;
}