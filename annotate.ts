import {filterRight, flatmap, flatten, hasHiragana, hasKanji, kata2hira} from 'curtiz-utils'
import {promises as pfs} from 'fs';
import {Entry, Furigana, furiganaToString, JmdictFurigana, setup as setupJmdictFurigana} from 'jmdict-furigana-node';
import {
  getField,
  idsToWords,
  kanjiBeginning,
  readingBeginning,
  setup as setupJmdict,
  Word
} from 'jmdict-simplified-node';

import {AnalysisResult, ConjugatedPhrase, ContextCloze, FillInTheBlanks, ScoreHit} from './interfaces';
import {addJdepp} from './jdepp';
import {
  goodMorphemePredicate,
  invokeMecab,
  maybeMorphemesToMorphemes,
  Morpheme,
  parse,
  parseMecab
} from './mecabUnidic';

const jmdictFuriganaPromise = setupJmdictFurigana()
const jmdictPromise = setupJmdict('jmdict-simplified', 'jmdict-eng-3.0.1.json');

interface MecabJdeppParsed {
  morphemes: Morpheme[];
  bunsetsus: Morpheme[][];
}
export async function mecabJdepp(sentence: string): Promise<MecabJdeppParsed> {
  let rawMecab = await invokeMecab(sentence);
  let morphemes = maybeMorphemesToMorphemes(parseMecab(sentence, rawMecab)[0].filter(o => !!o));
  let bunsetsus = await addJdepp(rawMecab, morphemes);
  return {morphemes, bunsetsus};
}

const p = (x: any) => console.dir(x, {depth: null});
type WithSearchReading<T> = T&{ searchReading: string[]; };
type WithSearchKanji<T> = T&{ searchKanji: string[]; };
/**
 * Given MeCab morphemes, return a triply-nested array of JMDict hits.
 *
 * The outer-most layer enumerates the *starting* morpheme, the middle layer the ending morpheme, and the final
 * inner-most layer the list of dictionary hits for the sequence of morphemes between the start and end.
 *
 * Roughly, in code (except we might not find anything for all start-to-end sequences):
 * ```js
 * for (let startIdx = 0; startIdx < morphemes.length; startIdx++) {
 *  for (let endIdx = morphemes.length; endIdx > startIdx; endIdx--) {
 *    result.push(JMDict.search(morpehemes.slice(startIdx, endIdx)));
 *  }
 * }
 * ```
 */
export async function enumerateDictionaryHits(plainMorphemes: Morpheme[]): Promise<ScoreHit[][][]> {
  const {db} = await jmdictPromise;

  const jmdictFurigana = await jmdictFuriganaPromise;
  const morphemes: WithSearchKanji<WithSearchReading<Morpheme>>[] = plainMorphemes.map(
      m => ({
        ...m,
        // if "symbol" POS, don't needlessly double the number of things to search for later in forkingPaths
        searchKanji: unique(m.partOfSpeech[0].startsWith('symbol') ? [m.literal] : [m.literal, m.lemma]),
        searchReading: unique(morphemeToSearchLemma(m).concat(morphemeToStringLiteral(m, jmdictFurigana)))
      }));
  const superhits: ScoreHit[][][] = [];
  for (let i = 0; i < morphemes.length; i++) {
    const hits: ScoreHit[][] = [];
    for (let j = morphemes.length; j > i; --j) {
      const run = morphemes.slice(i, j);
      let scored: ScoreHit[] = [];

      function helperSearchesHitsToScored(readingSearches: string[], readingSubhits: Word[][]): ScoreHit[] {
        return flatten(
            readingSubhits.map((v, i) => v.map(w => ({
                                                 wordId: w.id,
                                                 score: scoreMorphemeWord(run, readingSearches[i], 'kana', w),
                                                 search: readingSearches[i]
                                               }))));
      }
      // Search reading
      {
        const readingSearches = forkingPaths(run.map(m => m.searchReading)).map(v => v.join(''));
        const readingSubhits = await Promise.all(readingSearches.map(search => readingBeginning(db, search)));
        scored = helperSearchesHitsToScored(readingSearches, readingSubhits);
      }
      // Search literals if needed, this works around MeCab mis-readings like お父さん->おちちさん
      {
        const kanjiSearches = forkingPaths(run.map(m => m.searchKanji)).map(v => v.join('')).filter(hasKanji);
        const kanjiSubhits = await Promise.all(kanjiSearches.map(search => kanjiBeginning(db, search)));
        scored.push(...helperSearchesHitsToScored(kanjiSearches, kanjiSubhits));
      }

      scored.sort((a, b) => b.score - a.score);
      if (scored.length > 0) { hits.push(dedupe(scored, o => o.wordId)); }
    }
    superhits.push(hits);
  }
  return superhits;
}
/**
 * Remove duplicates given a function mapping elements to a unique ID
 *
 * Examples:
 * `dedupe([1, 2, 3, 2, 1], x => x)` returns `[1, 2, 3]`
 * `dedupe([1, -1, 2, -2, -3, -4, 3, 4], x => x**2)` returns `[1, 2, -3, -4]`.
 */
function dedupe<T, U>(v: T[], f: (x: T, i: number, arr: T[]) => U): T[] {
  const seen: Set<U> = new Set();
  const ret: T[] = [];
  for (const [i, x] of v.entries()) {
    const y = f(x, i, v);
    if (!seen.has(y)) {
      ret.push(x);
      seen.add(y);
    }
  }
  return ret;
}
function scoreMorphemeWord(run: Morpheme[], searched: string, searchKey: 'kana'|'kanji', word: Word): number {
  const len = searched.length;

  // if the shortest kana is shorter than the search, let the cost be 0. If shortest kana is longer than search, let the
  // overrun cost be negative. Shortest because we're being optimistic
  const overrunPenalty =
      Math.min(0, len - Math.min(...word[searchKey].filter(k => k.text.includes(searched)).map(k => k.text.length)));

  // literal may contain kanji that lemma doesn't, e.g., 大阪's literal in UniDic is katakana
  const wordKanjis = new Set(flatten(word.kanji.map(k => k.text.split('').filter(hasKanji))));
  const lemmaKanjis = new Set(flatten(run.map(m => m.lemma.split('').filter(hasKanji))));
  const literalKanjis = new Set(flatten(run.map(m => m.literal.split('').filter(hasKanji))));
  const lemmaKanjiBonus = intersectionSize(lemmaKanjis, wordKanjis);
  const literalKanjiBonus = intersectionSize(literalKanjis, wordKanjis);

  // make sure one-morpheme particles rise to the top of the pile of 10k hits...
  const particleBonus = +(run.length === 1 && run[0].partOfSpeech.some(pos => pos.includes('particle')) &&
                          word.sense.some(sense => sense.partOfSpeech.includes('prt')));

  return overrunPenalty * 10 + literalKanjiBonus * 2 + lemmaKanjiBonus * 1 + 5 * particleBonus;
}
function intersection<T>(small: Set<T>, big: Set<T>): Set<T> {
  if (small.size > big.size * 1.1) { return intersection(big, small); }
  const ret: Set<T> = new Set();
  for (const x of small) {
    if (big.has(x)) { ret.add(x) }
  }
  return ret;
}
function intersectionSize<T>(small: Set<T>, big: Set<T>): number {
  if (small.size > big.size * 1.1) { return intersectionSize(big, small); }
  let ret = 0;
  for (const x of small) { ret += +big.has(x); }
  return ret;
}
function unique<T>(v: T[]): T[] { return [...new Set(v)]; }

const circledNumbers = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿".split('');
const prefixNumber = (n: number) => circledNumbers[n] || '⓪';
export function displayWord(w: Word) {
  return w.kanji.map(k => k.text).join('・') + '「' + w.kana.map(k => k.text).join('・') + '」：' +
         w.sense.map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/')).join('; ');
}
export function displayWordDetailed(w: Word, tags: {[k: string]: string}) {
  return w.kanji.map(k => k.text).join('・') + '「' + w.kana.map(k => k.text).join('・') + '」：' +
         w.sense
             .map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/') + ' {*' +
                                sense.partOfSpeech.map(pos => tags[pos]).join('; ') + '*}')
             .join('; ') +
         ' #' + w.id;
}

/**
 * Cartesian product.
 *
 * Treats each sub-array in an array of arrays as a list of choices for that slot, and enumerates all paths.
 *
 * So [['hi', 'ola'], ['Sal']] => [['hi', 'Sal'], ['ola', 'Sal']]
 *
 */
function forkingPaths<T>(v: T[][]): T[][] {
  let ret: T[][] = [[]];
  for (const u of v) { ret = flatten(u.map(x => ret.map(v => v.concat(x)))); }
  return ret;
}

/**
 * Ensure needle is found in haystack only once
 * @param haystack big string
 * @param needle little string
 */
function appearsExactlyOnce(haystack: string, needle: string): boolean {
  const hit = haystack.indexOf(needle);
  return hit >= 0 && haystack.indexOf(needle, hit + 1) < 0;
}

function contextClozeToString(c: ContextCloze): string { return c.left + c.cloze + c.right; }
/**
 * Given three consecutive substrings (the arguments), return `{left: left2, cloze, right: right2}` where
 * `left2` and `right2` are as short as possible and `${left2}${cloze}${right2}` is unique in the full string.
 * @param left left string, possibly empty
 * @param cloze middle string
 * @param right right string, possible empty
 * @throws in the unlikely event that such a return string cannot be build (I cannot think of an example though)
 */
function generateContextClozed(left: string, cloze: string, right: string): ContextCloze {
  const sentence = left + cloze + right;
  let leftContext = '';
  let rightContext = '';
  let contextLength = 0;
  while (!appearsExactlyOnce(sentence, leftContext + cloze + rightContext)) {
    contextLength++;
    if (contextLength >= left.length && contextLength >= right.length) {
      throw new Error('Ran out of context to build unique cloze');
    }
    leftContext = left.slice(-contextLength);
    rightContext = right.slice(0, contextLength);
  }
  return {left: leftContext, cloze, right: rightContext};
}
const bunsetsuToString = (morphemes: Morpheme[]) => morphemes.map(m => m.literal).join('');
async function identifyFillInBlanks(bunsetsus: Morpheme[][]): Promise<FillInTheBlanks> {
  // Find clozes: particles and conjugated verb/adjective phrases
  // const literalClozes: Map<string, Morpheme[]> = new Map([]);
  const conjugatedPhrases: Map<string, ConjugatedPhrase> = new Map();
  const particles: Map<string, ContextCloze> = new Map();
  for (const [bidx, bunsetsu] of bunsetsus.entries()) {
    const first = bunsetsu[0];
    if (!first) { continue; }
    const pos0 = first.partOfSpeech[0];
    if (bunsetsus.length > 1 && bunsetsu.length > 1 &&
        (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject'))) {
      const ignoreRight = filterRight(bunsetsu, m => !goodMorphemePredicate(m));
      const goodBunsetsu = ignoreRight.length === 0 ? bunsetsu : bunsetsu.slice(0, -ignoreRight.length);
      if (goodBunsetsu.length > 1) {
        const cloze = bunsetsuToString(goodBunsetsu);
        const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
        const right = bunsetsuToString(ignoreRight) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
        if (!conjugatedPhrases.has(cloze)) {
          const jf = await jmdictFuriganaPromise;
          conjugatedPhrases.set(cloze, {
            cloze: generateContextClozed(left, cloze, right),
            lemmas: bunsetsu.map(o => {
              const entries = jf.textToEntry.get(o.lemma) || [];
              const lemmaReading = kata2hira(o.lemmaReading);
              const entry = entries.find(e => e.reading === lemmaReading);
              return entry ? entry.furigana : [{ruby: o.lemma, rt: lemmaReading}];
            })
          });
        }
      }
    }
    const particlePredicate = (p: Morpheme) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1 &&
                                               !p.partOfSpeech[1].startsWith('phrase_final');
    for (const [pidx, particle] of bunsetsu.entries()) {
      if (particlePredicate(particle)) {
        const left =
            bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(bunsetsu.slice(0, pidx));
        const right =
            bunsetsuToString(bunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
        const cloze = generateContextClozed(left, particle.literal, right);
        particles.set(contextClozeToString(cloze), cloze);
      }
    }
  }
  return {particles, conjugatedPhrases};
}

function morphemeToSearchLemma(m: Morpheme): string[] {
  const pos0 = m.partOfSpeech[0];
  const conjugatable = (m.inflection ?.[0]) || (m.inflectionType ?.[0]) || pos0.startsWith('verb') ||
                                              pos0.endsWith('_verb') || pos0.startsWith('adject');
  const potentialRendaku = m.literal === m.lemma && hasKanji(m.lemma) && m.lemmaReading !== m.pronunciation;
  return (conjugatable || potentialRendaku) ? [kata2hira(m.lemmaReading)] : [];
  // literal's pronunciation will handle the rest
}

const CHOUONPU = 'ー'; // https://en.wikipedia.org/wiki/Ch%C5%8Donpu
/**
 * Returns array of strings in hiragana, without chouonpu, representing possible pronunciations
 * Tries hard to make sure the returned array has length 1.
 */
function morphemeToStringLiteral(m: Pick<Morpheme, 'literal'|'lemma'|'pronunciation'|'lemmaReading'>,
                                 jmdictFurigana?: JmdictFurigana): string[] {
  if (!hasKanji(m.literal)) { return [m.literal]; }
  // so literal has kanji
  if (!m.pronunciation.includes(CHOUONPU)) { return [kata2hira(m.pronunciation)]; }
  // so literal has kanji and the pronunciation has a chouonpu
  if (m.literal === m.lemma) { return [kata2hira(m.lemmaReading)]; }
  // so literal has kanji, the pronunciation has chouonpu, and the literal and lemma disagree

  // 多             | オー           | オオイ         | 多い
  // 大阪               | オーサカ           | オオサカ           | オオサカ
  // 京都               | キョート           | キョウト           | キョウト
  // 東京               | トーキョー         | トウキョウ         | トウキョウ
  // 見よう             | ミヨー             | ミル               | 見る

  // cant just replace chouonpu with equivlent in lemma! :
  // 聞い | キー | キク | 聞く

  function replaceChouonpuWithString(pronunciation: string, literal: string): string {
    return pronunciation.split('').map((p, i) => (p === CHOUONPU && hasHiragana(literal[i])) ? literal[i] : p).join('')
  }

  if (hasHiragana(m.literal)) {
    // try to see if the chouonpu in pronunication is a hiragana in literal:

    if (m.literal.length === m.pronunciation.length) {
      // same length: all kanji are one-character, so we can safely split both literal and pronunciation
      // 飛び立とう | トビタトウ | トビタトー | トビタツ | 飛び立つ
      const reconstructedPronunciation = replaceChouonpuWithString(m.pronunciation, m.literal);
      if (!reconstructedPronunciation.includes(CHOUONPU)) { return [kata2hira(reconstructedPronunciation)] }
    }

    // 話し合おう | ハナシアオウ | ハナシアオー | ハナシアウ | 話し合う

    if (jmdictFurigana) {
      const entries = jmdictFurigana.textToEntry.get(m.lemma);
      console.log(entries);
      if (entries) {
        const lemmaReading = kata2hira(m.lemmaReading);
        const entry = entries.find(e => e.reading === lemmaReading);
        if (entry) {
          const furiganaMap = new Map(entry.furigana.map(f => typeof f === 'string' ? ['', ''] : [f.ruby, f.rt]));
          const reconstructedLiteral = m.literal.split('').map(c => furiganaMap.get(c) || c).join('');
          if (m.pronunciation.length === reconstructedLiteral.length) {
            const reconstructedPronunciation = replaceChouonpuWithString(m.pronunciation, reconstructedLiteral);
            if (!reconstructedPronunciation.includes(CHOUONPU)) { return [kata2hira(reconstructedPronunciation)] }
          }
        }
      }
    }
  }

  // No choice, オー and トー need to be mapped to both options.
  // Other chouonpu mapped via `DUMB_CHOUONPU_MAP`.

  const pronunciation = m.pronunciation.split('');
  let ret: string[][] = [[]];
  for (const [i, p] of pronunciation.entries()) {
    if (p === CHOUONPU) {
      if (pronunciation[i - 1] === 'ト' || pronunciation[i - 1] === 'オ') {
        ret = [...ret.map(v => v.concat('オ')), ...ret.map(v => v.concat('ウ'))];
      } else {
        ret.forEach(v => v.push(DUMB_CHOUONPU_MAP.get(kata2hira(pronunciation[i - 1])) || CHOUONPU))
      }
      continue;
    }
    ret.forEach(v => v.push(p));
  }
  return ret.map(v => kata2hira(v.join('')));
}

const DUMB_CHOUONPU_MAP = (function makeChouonpuMap() {
  const as = `ぁあかがさざただなはばぱまゃやらゎわ`;
  const is = `ぃいきぎしじちぢにひびぴみり`;
  const us = `ぅうくぐすずっつづぬふぶぷむゅゆるゔ`
  const es = `ぇえけげせぜてでねへべぺめれ`;
  const os = `ぉおこごそぞとどのほぼぽもょよろを`;
  const m: Map<string, string> = new Map();
  const doer = (as: string, target: string) => as.split('').forEach(a => m.set(a, target));
  doer(as, 'あ');
  doer(is, 'い');
  doer(us, 'う');
  doer(es, 'い');
  doer(os, 'う');
  return m;
})();

/**
 * Try very hard to convert morphemes to furigana. `overrides` is a map of morpheme literal to the furigana you want.
 * This is useful because, e.g., Unidic always converts 日本 to ニッポン, and maybe you want overrides such that:
 * `overrides = new Map([['日本', [{ruby: '日', rt: 'に'}, {ruby: '本', rt: 'ほん'}]]])`
 * Note that `overrides` operates on a morpheme-by-morpheme basis.
 */
async function morphemesToFurigana(morphemes: Morpheme[], overrides: Map<string, Furigana[]>): Promise<Furigana[][]> {
  const furigana: Furigana[][] = await Promise.all(morphemes.map(async m => {
    const {lemma, lemmaReading, literal, pronunciation} = m;
    if (hasKanji(literal)) {
      {
        const hit = overrides.get(literal);
        if (hit) { return hit; }
      }

      const jmdictFurigana = await jmdictFuriganaPromise;
      const {textToEntry, readingToEntry} = jmdictFurigana;

      const literalHit = search(textToEntry, literal, 'reading', morphemeToStringLiteral(m, jmdictFurigana));
      if (literalHit) { return literalHit.furigana; }
      const pronunciationHit = search(readingToEntry, pronunciation, 'text', [literal]);
      if (pronunciationHit) { return pronunciationHit.furigana; }

      // help with 一本/rendaku
      if (literal.length === 1) { return [{ruby: literal, rt: morphemeToStringLiteral(m).join('・')}]; }

      // for e.g. 住ん|で|い|ます but not 一本 (pronounced pon but lemma=hon: rendaku)
      // if you reach here, there's nothing ensuring that the furigana found will match `pronunciation`!
      const lemmaHit = search(
          textToEntry, lemma, 'reading',
          morphemeToStringLiteral({lemma, lemmaReading, literal: lemma, pronunciation: lemmaReading}, jmdictFurigana));
      if (lemmaHit) {
        const furiganaDict: Map<string, string> = new Map();
        for (const f of lemmaHit.furigana) {
          if (typeof f === 'string') { continue; }
          furiganaDict.set(f.ruby, f.rt);
        }

        const chars = literal.split('');
        let kanji = chars.filter(hasKanji);
        const annotatedChars: Furigana[] = chars.slice();

        // start from all kanji characters in a string, see if that's in furiganaDict, if not, chop last
        while (kanji.length) {
          const hit = triu(kanji).find(ks => furiganaDict.has(ks.join('')));
          if (hit) {
            const hitstr = hit.join('');
            const idx = literal.indexOf(hitstr);
            annotatedChars[idx] = {ruby: hitstr, rt: furiganaDict.get(hitstr) || hitstr};
            for (let i = idx + 1; i < idx + hitstr.length; i++) { annotatedChars[i] = ''; }
            kanji = kanji.slice(hitstr.length);
            continue;
          }
          // no hit found, kanji won't shrink to empty, break now
          break;
        }
        if (kanji.length === 0) { return annotatedChars; }
      }
      // const lemmaReadingHit = search(readingToEntry, lemmaReading, 'text', lemma);
      // if (lemmaReadingHit) { return lemmaReadingHit.furigana; }
    }
    return [hasKanji(literal) ? {ruby: literal, rt: morphemeToStringLiteral(m).join('・')} : literal];
  }));

  return furigana;
}
function triu<T>(arr: T[]): T[][] {
  const ret: T[][] = [];
  for (let i = arr.length; i > 0; --i) { ret.push(arr.slice(0, i)); }
  return ret;
}
function search(map: JmdictFurigana['readingToEntry'], first: string, sub: 'reading'|'text',
                possibleSeconds: string[]): Entry|undefined {
  const hit = map.get(first);
  if (hit) {
    // const possibleSeconds = findAlternativeChouonpu(kata2hira(second));
    const subhit = hit.find(e => {
      const dict = kata2hira(e[sub]);
      return possibleSeconds.some(second => second === dict);
    });
    if (subhit) { return subhit; }
    console.error(`found hit for ${first} but not ${possibleSeconds}`, {hit, possibleSeconds});
  }
}

function furiganaToRuby(fs: Furigana[]): string {
  return fs.map(f => typeof f === 'string' ? f : `<ruby>${f.ruby}<rt>${f.rt}</rt></ruby>`).join('');
}

export async function analyzeSentence(sentence: string, overrides?: Map<string, Furigana[]>): Promise<AnalysisResult> {
  const parsed = await mecabJdepp(sentence);

  // Promises
  const furiganaP = hasKanji(sentence) ? (morphemesToFurigana(parsed.morphemes, overrides || new Map())) : undefined;
  const particlesConjphrasesP = identifyFillInBlanks(parsed.bunsetsus);
  const dictionaryHitsP = enumerateDictionaryHits(parsed.morphemes);

  const [furigana, particlesConjphrases, dictionaryHits] =
      await Promise.all([furiganaP, particlesConjphrasesP, dictionaryHitsP]);
  return {furigana, particlesConjphrases, dictionaryHits};
}

export async function scoreHitsToWords(hits: ScoreHit[]) {
  const {db} = await jmdictPromise;
  return idsToWords(db, hits.map(o => o.wordId));
}

if (module === require.main) {
  (async () => {
    const jmdictFurigana = await jmdictFuriganaPromise;
    const {db} = await jmdictPromise;
    const tags = JSON.parse(await getField(db, 'tags'));

    {
      let lines = `- @ 今日は良い天気だ。
- @ たのしいですか。
- @ 何できた？`.split('\n');
      if (process.argv.length <= 2) {
        const getStdin = require('get-stdin');

        // no arguments, read from stdin. If stdin is empty, use default.
        const raw = (await getStdin()).trim();
        if (raw) { lines = raw.split('\n'); }
      } else {
        lines = flatmap(await Promise.all(process.argv.slice(2).map(f => pfs.readFile(f, 'utf8'))),
                        s => s.trim().replace(/\r/g, '').split('\n'));
      }

      // const lines = (await pfs.readFile('tono.txt', 'utf8')).trim().split('\n').map(s => s.split('\t')[0]);
      const MAX_LINES = 8;
      const overrides: Map<string, Furigana[]> = new Map();
      const startRegexp = /^-\s+@\s+/;
      for (const line of lines) {
        if (!startRegexp.test(line)) {
          console.log(line);
          continue;
        }
        const sentence = line.slice(line.match(startRegexp) ?.[0].length );
        const results = await analyzeSentence(sentence, overrides);
        console.log(line + (results.furigana ? ` @furigana ${results.furigana.map(furiganaToRuby).join('')}` : ''));

        {
          if (results.particlesConjphrases.particles.size) {
            console.log('  - Particles');
            for (const [_, cloze] of results.particlesConjphrases.particles) {
              console.log(`    - @fill ${cloze.left}${
                  cloze.left || cloze.right ? '[' + cloze.cloze + ']' : cloze.cloze}${cloze.right}`);
            }
          }
          if (results.particlesConjphrases.conjugatedPhrases.size) {
            console.log('  - Conjugated phrases');
            for (const [_, c] of results.particlesConjphrases.conjugatedPhrases) {
              const cloze = c.cloze;
              console.log(`    - @fill ${cloze.left}${
                  cloze.left || cloze.right ? '[' + cloze.cloze + ']'
                                            : cloze.cloze}${cloze.right} @hint ${furiganaToRuby(c.lemmas[0])}`);
            }
          }
        }
        {
          for (const fromStart of results.dictionaryHits) {
            for (const fromEnd of fromStart) {
              console.log('  - end: ' + unique(fromEnd.map(o => o.search)).join('・'));
              const words = await scoreHitsToWords(fromEnd.slice(0, MAX_LINES));
              for (const [wi, w] of words.entries()) {
                console.log('    - @dict ' + displayWordDetailed(w, tags) + ` (score: ${fromEnd[wi].score})`);
              }
              if (fromEnd.length > MAX_LINES) { console.log(`    - (… ${fromEnd.length - MAX_LINES} omitted)`); }
            }
          }
        }
      }
    }
  })();
}
