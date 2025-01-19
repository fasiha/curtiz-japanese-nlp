/**
 * Simple Cartesian product generator.
 *
 * Given an N-long array of numbers `lenarr`, where each element representing how many choices are available for that
 * position, generate all N-long arrays where the `idx`th element runs from 0 to `lenarr[index]`.
 *
 * ```ts
 * for (const x of numericCartesianProduct([2, 3])) { console.log(x); }
 * ```
 * generates:
 * ```
 * [ 0, 0 ]
 * [ 1, 0 ]
 * [ 0, 1 ]
 * [ 1, 1 ]
 * [ 0, 2 ]
 * [ 1, 2 ]
 * ```
 *
 * It might be easier to use the `cartesianProduct` function if you have actual values that each index can take.
 *
 * @param lenarr represents how many choices each index position can take
 */
export function* numericCartesianProduct(lenarr: number[]): Generator<number[]> {
  let idx = lenarr.map(_ => 0);
  let carry = 0;
  while (!carry) {
    yield idx;
    carry = 1;
    for (let i = 0; i < lenarr.length; i++) {
      idx[i] += carry;
      if (idx[i] >= lenarr[i]) {
        idx[i] = 0;
        carry = 1;
      } else {
        carry = 0;
        break;
      }
    }
  }
}

/**
 * Given N arrays of arbitrary length, match all items from each array with every other item
 *
 * That is, generate all N-element arrays.
 *
 * Example:
 * ```ts
 * for (const c of cartesianProduct<number|string|boolean>(['Paris', 'Tokyo'], [10, 99], [true, false])) {
 * console.log(c) }
 * ```
 * will print:
 * ```
 * [ 'Paris', 10, true ]
 * [ 'Tokyo', 10, true ]
 * [ 'Paris', 99, true ]
 * [ 'Tokyo', 99, true ]
 * [ 'Paris', 10, false ]
 * [ 'Tokyo', 10, false ]
 * [ 'Paris', 99, false ]
 * [ 'Tokyo', 99, false ]
 * ```
 */
export function* cartesianProduct<T>(...arrs: T[][]) {
  for (const idx of numericCartesianProduct(arrs.map(v => v.length))) {
    yield idx.map((inner, outer) => arrs[outer][inner]);
  }
}

/**
 * Given an array of choices, generate all `k`-sized permutations.
 *
 * A simple way to think about this is, generate all unique shuffled versions of the choices array.
 *
 * But you can ask for a smaller size via `k` (then the "shuffle" analogy isn't accurate).
 *
 * Simple example:
 * ```ts
 * for (const x of permutations(['a', 'm', 'z'])) { console.log(x); }
 * ```
 * generates:
 * ```
 * [ 'a', 'm', 'z' ]
 * [ 'a', 'z', 'm' ]
 * [ 'm', 'a', 'z' ]
 * [ 'm', 'z', 'a' ]
 * [ 'z', 'a', 'm' ]
 * [ 'z', 'm', 'a' ]
 * ```
 *
 * An example with `k`:
 * ```ts
 * for (const x of permutations(['a', 'm', 'z'], 2)) { console.log(x); }
 * ```
 * generates:
 * ```
 * [ 'a', 'm' ]
 * [ 'a', 'z' ]
 * [ 'm', 'a' ]
 * [ 'm', 'z' ]
 * [ 'z', 'a' ]
 * [ 'z', 'm' ]
 * ```
 *
 * The classic math-class way of differentiating permutations from combinations is, for permutations (this function),
 * the order of the elements in the output is important, so "az" and "za" are both here. Therefore this generator is
 * longer than combinations.
 *
 * @param choices the input array of all choices
 * @param k the length of each generated array, by default equal to the length of `choices`
 */
export function* permutations<T>(choices: T[], k = choices.length, prefix = [] as T[]): Generator<T[]> {
  if (prefix.length === k) { yield prefix; }
  for (const [i, x] of choices.entries()) {
    yield* permutations(choices.filter((_, j) => j !== i), k, prefix.concat(x));
  }
}

function* range(start: number, end: number) {
  for (; start <= end; ++start) { yield start; }
}
function last<T>(arr: T[]) { return arr[arr.length - 1]; }
export function* numericCombinations(n: number, r: number, loc: number[] = []): IterableIterator<number[]> {
  const idx = loc.length;
  if (idx === r) {
    yield loc;
    return;
  }
  for (let next of range(idx ? last(loc) + 1 : 0, n - r + idx)) { yield* numericCombinations(n, r, loc.concat(next)); }
}

/**
 * Given an array of choices, generate all `r`-sized combinations.
 *
 * The output of this generator will be a subset of the output of the `permutations` function, since, for combinations,
 * order doesn't matter.
 *
 * Same example arguments as `permutations`:
 * ```ts
 * for (const x of combinations(['a', 'm', 'z'], 3)) { console.log(x); }
 * ```
 * generates just a single line of output:
 * ```
 * [ 'a', 'm', 'z' ]
 * ```
 * (Recall `permutations` returns all shuffled versions of this.) Meanwhile,
 * ```ts
 * for (const x of combinations(['a', 'm', 'z'], 2)) { console.log(x); }
 * ```
 * generates
 * ```
 * [ 'a', 'm' ]
 * [ 'a', 'z' ]
 * [ 'm', 'z' ]
 * ```
 *
 * @param choices input array of all choices
 * @param r how many to take from input choices
 */
export function* combinations<T>(choices: T[], r: number) {
  for (let idxs of numericCombinations(choices.length, r)) { yield idxs.map(i => choices[i]); }
}
