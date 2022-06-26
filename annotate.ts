import {createHash} from 'crypto';
import {dedupeLimit, filterRight, flatmap, flatten, hasHiragana, hasKana, hasKanji, kata2hira} from 'curtiz-utils'
import {promises as pfs} from 'fs';
import {
  Entry,
  Furigana,
  furiganaToString,
  JmdictFurigana,
  Ruby,
  setup as setupJmdictFurigana
} from 'jmdict-furigana-node';
import {
  getField,
  getTags as getTagsDb,
  idsToWords,
  kanjiBeginning,
  readingBeginning,
  Sense,
  setup as setupJmdict,
  Tag,
  Word,
  Xref,
} from 'jmdict-simplified-node';
import mkdirp from 'mkdirp';

import {
  AnalysisResult,
  ConjugatedPhrase,
  ContextCloze,
  FillInTheBlanks,
  Particle,
  ScoreHit,
  ScoreHits
} from './interfaces';
import {addJdepp} from './jdepp';
import {
  goodMorphemePredicate,
  invokeMecab,
  maybeMorphemesToMorphemes,
  Morpheme,
  parse,
  parseMecab
} from './mecabUnidic';

export {
  Entry,
  Furigana,
  furiganaToString,
  JmdictFurigana,
  Ruby,
  setup as setupJmdictFurigana
} from 'jmdict-furigana-node';
export {getField} from 'jmdict-simplified-node';

export const jmdictFuriganaPromise = setupJmdictFurigana(process.env['JMDICT_FURIGANA']);
export const jmdictPromise = setupJmdict(process.env['JMDICT_SIMPLIFIED_LEVELDB'] || 'jmdict-simplified',
                                         process.env['JMDICT_SIMPLIFIED_JSON'] || 'jmdict-eng-3.1.0.json', true, true);

/**
 * Without this limit on how many Leveldb hits jmdict-simplified-node will get, things slow way down. Not much loss in
 * usefulness with this set to 20.
 */
const DICTIONARY_LIMIT = 20;

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
export async function enumerateDictionaryHits(plainMorphemes: Morpheme[], full = true,
                                              limit = -1): Promise<ScoreHits[]> {
  const {db} = await jmdictPromise;
  const simplify = (c: ContextCloze) => (c.left || c.right) ? c : c.cloze;

  const jmdictFurigana = await jmdictFuriganaPromise;
  const morphemes: WithSearchKanji<WithSearchReading<Morpheme>>[] = plainMorphemes.map(
      m => ({
        ...m,
        // if "symbol" POS, don't needlessly double the number of things to search for later in forkingPaths
        searchKanji: unique(m.partOfSpeech[0].startsWith('symbol') ? [m.literal] : [m.literal, m.lemma]),
        searchReading: unique(morphemeToSearchLemma(m).concat(morphemeToStringLiteral(m, jmdictFurigana)))
      }));
  const superhits: ScoreHits[] = [];
  for (let startIdx = 0; startIdx < morphemes.length; startIdx++) {
    const results: ScoreHits['results'] = [];

    if (!full) {
      const pos = morphemes[startIdx].partOfSpeech;
      if (pos[0].startsWith('supplementary') || pos[0].startsWith('auxiliary')) {
        // skip these
        superhits.push({startIdx, results});
        continue;
      }
    }

    for (let endIdx = Math.min(morphemes.length, startIdx + 5); endIdx > startIdx; --endIdx) {
      const run = morphemes.slice(startIdx, endIdx);
      const runLiteralCore = bunsetsuToString(run);
      const runLiteral = simplify(generateContextClozed(bunsetsuToString(morphemes.slice(0, startIdx)), runLiteralCore,
                                                        bunsetsuToString(morphemes.slice(endIdx))));
      if (!full) {
        // skip particles like は and も if they're by themselves as an optimization
        if (runLiteralCore.length === 1 && hasKana(runLiteralCore[0]) && runLiteralCore === run[0].lemma) { continue; }
      }
      let scored: ScoreHit[] = [];

      function helperSearchesHitsToScored(searches: string[], subhits: Word[][],
                                          searchKey: "kana"|"kanji"): ScoreHit[] {
        return flatten(subhits.map((v, i) => v.map(w => {
          // help catch issues with automatic type widening and excess property checks
          const ret: ScoreHit = {
            wordId: w.id,
            score: scoreMorphemeWord(run, searches[i], searchKey, w),
            search: searches[i],
            // run: runLiteral,
            // runIdx: [startIdx, endIdx - 1],
          };
          return ret;
        })));
      }
      // Search reading
      {
        const readingSearches = forkingPaths(run.map(m => m.searchReading)).map(v => v.join(''));
        const readingSubhits =
            await Promise.all(readingSearches.map(search => readingBeginning(db, search, DICTIONARY_LIMIT)));
        scored = helperSearchesHitsToScored(readingSearches, readingSubhits, 'kana');
      }
      // Search literals if needed, this works around MeCab mis-readings like お父さん->おちちさん
      {
        const kanjiSearches = forkingPaths(run.map(m => m.searchKanji)).map(v => v.join('')).filter(hasKanji);
        const kanjiSubhits =
            await Promise.all(kanjiSearches.map(search => kanjiBeginning(db, search, DICTIONARY_LIMIT)));
        scored.push(...helperSearchesHitsToScored(kanjiSearches, kanjiSubhits, 'kanji'));
      }

      scored.sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        results.push({endIdx, run: runLiteral, results: dedupeLimit(scored, o => o.wordId, limit)});
      }
    }
    superhits.push({startIdx, results});
  }
  return superhits;
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
const prefixNumber = (n: number) => circledNumbers[n] || `(${n + 1})`;
export function displayWord(w: Word) {
  return w.kanji.map(k => k.text).join('・') + '「' + w.kana.map(k => k.text).join('・') + '」：' +
         w.sense.map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/')).join('; ');
}

function printXrefs(v: Xref[]) { return v.map(x => x.join(',')).join(';'); }
export function displayWordLight(w: Word, tags: Record<string, string>) {
  const kanji = w.kanji.map(k => k.text).join('・');
  const kana = w.kana.map(k => k.text).join('・');

  type TagKey = {[K in keyof Sense]: Sense[K] extends Tag[] ? K : never}[keyof Sense];
  const tagFields: Partial<Record<TagKey, string>> = {dialect: '🗣', field: '🀄️', misc: '✋'};
  const s =
      w.sense
          .map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/') +
                             (sense.related.length ? ` (👉 ${printXrefs(sense.related)})` : '') +
                             (sense.antonym.length ? ` (👈 ${printXrefs(sense.antonym)})` : '') +
                             Object.entries(tagFields)
                                 .map(([k, v]) => sense[k as TagKey].length
                                                      ? ` (${v} ${sense[k as TagKey].map(k => tags[k]).join('; ')})`
                                                      : '')
                                 .join(''))
          .join(' ');
  // console.error(related)
  return `${kanji}「${kana}」| ${s}`;
}
export function displayWordDetailed(w: Word, tags: {[k: string]: string}) {
  return w.kanji.concat(w.kana).map(k => k.text).join('・') + '：' +
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
    if (contextLength > left.length && contextLength > right.length) {
      console.error({sentence, left, cloze, right, leftContext, rightContext, contextLength});
      throw new Error('Ran out of context to build unique cloze');
    }
    leftContext = left.slice(-contextLength);
    rightContext = right.slice(0, contextLength);
  }
  return {left: leftContext, cloze, right: rightContext};
}
const bunsetsuToString = (morphemes: Morpheme[]) => morphemes.map(m => m.literal).join('');
function betterMorphemePredicate(m: Morpheme): boolean {
  return !(m.partOfSpeech[0] === 'supplementary_symbol') && !(m.partOfSpeech[0] === 'particle');
}

export async function identifyFillInBlanks(bunsetsus: Morpheme[][], verbose = false): Promise<FillInTheBlanks> {
  // Find clozes: particles and conjugated verb/adjective phrases
  const conjugatedPhrases: Map<string, ConjugatedPhrase> = new Map();
  const particles: Map<string, Particle> = new Map();
  for (const [bidx, bunsetsu] of bunsetsus.entries()) {
    const startMorphemeIdx = bunsetsus.slice(0, -1).map(o => o.length).reduce((p, c) => p + c, 0);
    const first = bunsetsu[0];
    if (!first) { continue; }
    const pos0 = first.partOfSpeech[0];
    const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1];
    const ignoreRight = filterRight(bunsetsu, m => !betterMorphemePredicate(m));
    const goodBunsetsu = ignoreRight.length === 0 ? bunsetsu : bunsetsu.slice(0, -ignoreRight.length);
    if (verbose) {
      const pr = (m: Morpheme) => `${m.literal} pos ${m.partOfSpeech.join('/')} | ${
          (m.inflectionType || []).join('/')} _ ${(m.inflection || []).join('/')}`;
      console.log('-- ' + goodBunsetsu.length +
                  bunsetsu.map((o, i) => (i >= goodBunsetsu.length ? `X(${o.literal})` : pr(o))).join('\n   '));
    }
    /*
    If a bunsetsu has >1 morphemes, check if it's a verb or an adjective (i or na).
    If it's just one, make sure it's an adjective that's not a conclusive
    */
    if ((goodBunsetsu.length === 1 && pos0.startsWith('adjectiv') &&
         (first.inflection?.[0] ? !first.inflection[0].endsWith('conclusive') : true)) ||
        (goodBunsetsu.length > 1 && (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject') ||
                                     pos0Last === 'verbal_suru'))) {
      if (verbose) { console.log('^^ included'); }
      const cloze = bunsetsuToString(goodBunsetsu);
      const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
      const right = bunsetsuToString(ignoreRight) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
      const startIdx = startMorphemeIdx;
      const endIdx = startMorphemeIdx + bunsetsu.length;
      const key = `${startIdx}-${endIdx}`
      const jf = await jmdictFuriganaPromise;
      conjugatedPhrases.set(key, {
        startIdx,
        endIdx,
        morphemes: goodBunsetsu,
        cloze: generateContextClozed(left, cloze, right),
        lemmas: goodBunsetsu.map(o => {
          const entries = jf.textToEntry.get(o.lemma) || [];
          const lemmaReading = kata2hira(o.lemmaReading);
          const entry = entries.find(e => e.reading === lemmaReading);
          return entry                      ? entry.furigana
                 : o.lemma === lemmaReading ? [lemmaReading]
                                            : [{ruby: o.lemma, rt: lemmaReading}];
        })
      });
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
        particles.set(cloze.left + cloze.cloze + cloze.right, {cloze, morphemes: [particle]});
      }
    }
  }
  return {particles, conjugatedPhrases};
}

function morphemeToSearchLemma(m: Morpheme): string[] {
  const pos0 = m.partOfSpeech[0];
  const conjugatable = (m.inflection?.[0]) || (m.inflectionType?.[0]) || pos0.startsWith('verb') ||
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
  if (!hasKanji(m.literal)) {
    if (m.literal === m.lemma) { return [m.literal]; }
    // sometimes, e.g., `テンション、ひくっ`, literal=ひくっ but lemma=ひく and we want to look up the lemma
    return [m.literal, m.lemma];
  }
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

export async function morphemesToFurigana(line: string, morphemes: Morpheme[],
                                          overrides: Partial<Record<string, Furigana[]>>): Promise<Furigana[][]> {
  return morphemesToFuriganaCore(morphemes, overrides).then(o => checkFurigana(line, o))
}

/**
 * Try very hard to convert morphemes to furigana. `overrides` is a map of morpheme literal to the furigana you want.
 * This is useful because, e.g., Unidic always converts 日本 to ニッポン, and maybe you want overrides such that:
 * `overrides = new Map([['日本', [{ruby: '日', rt: 'に'}, {ruby: '本', rt: 'ほん'}]]])`
 * Note that `overrides` operates on a morpheme-by-morpheme basis.
 */
export async function morphemesToFuriganaCore(morphemes: Morpheme[],
                                              overrides: Partial<Record<string, Furigana[]>>): Promise<Furigana[][]> {
  const furigana: Furigana[][] = await Promise.all(morphemes.map(async m => {
    const {lemma, lemmaReading, literal, pronunciation} = m;
    if (!hasKanji(literal)) { return [literal]; }
    {
      const hit = overrides[literal];
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

    // We couldn't rely on JMDictFurigana to help us out. The best we can do now is to use MeCab's parsing.
    // For example: literal="帰っ" and rt="かえっ". Also 鍛え直し vs きたえなおし.
    // In general, literal can mix kanji and kana, rt will have only kana.

    {
      const rt = morphemeToStringLiteral(m)[0];
      if (rt === literal) { return [literal]; }
      const ret = simpleConvertMecabReading(literal, rt);
      console.log({ret})
      return ret;
    }
  }));

  return furigana;
}

/*
(if kana is padded on either side, it's unambiguous, so kanji bookends are important)

Consider the following literal/reading pair, where uppercase represents KANJI and lowercase kana:

AxBzC = axbbzccc : this is unambiguous

But:

AxBzC =  axbxbzccc : ambiguous: which x should we cut at?
AxBzC ?= a x bxb zccc or
AxBzC ?= axb x b zccc

I.e., ambiguity when kana run in base (kanji) text appears also in the true reading of an adjancent kanji run.

Is this ambiguous:
AxBzC = axbbzxccc --- NO.
AxBzC = axxbbzccc --- YES

SIMPLE resolution: split eagerly at the first possible case.
Better resolution: use Kanjidic?
*/
function simpleConvertMecabReading(literal: string, reading: string) {
  const ret: Furigana[] = [];
  const prepost = prePostMatches(literal, reading);
  if (prepost.pre) { ret.push(prepost.pre); }

  literal = prepost.middleA;
  reading = prepost.middleB;
  const splits = splitKanaKanjiRuns(literal);
  for (const {s, isKanji} of splits) {
    if (isKanji) { continue; }

    const litIdx = literal.indexOf(s);
    const readIdx = reading.indexOf(s);
    if (litIdx < 0 || readIdx < 0) { // bad error, return
      return [{ruby: literal, rt: reading}];
    }
    ret.push({ruby: literal.slice(0, litIdx), rt: reading.slice(0, readIdx)})
    ret.push(s);
    literal = literal.slice(litIdx + s.length);
    reading = reading.slice(readIdx + s.length);
  }
  if (splits[splits.length - 1].isKanji) { // last kanji split would have been skipped above
    ret.push({ruby: literal, rt: reading});
  }
  if (prepost.post) { ret.push(prepost.post); }
  return ret;
}
function splitKanaKanjiRuns(s: string) {
  let current: {s: string, isKanji: boolean} = {s: s[0], isKanji: hasKanji(s[0])};
  const ret: (typeof current)[] = [];
  for (const [i, c] of s.slice(1).split('').entries()) {
    const isKanji = hasKanji(c);
    if (isKanji === current.isKanji) {
      current.s = current.s + c;
    } else {
      ret.push(current);
      current = {s: c, isKanji};
    }
  }
  return ret.concat(current);
}
function prePostMatches(a: string, b: string) {
  let pre = '';
  let post = '';
  if (a === b) { return {pre, middleA: a, middleB: b, post}; }
  for (let i = 0; i < a.length; i++) {
    const c = a[i];
    if (c !== b[i]) { break; }
    pre += c;
  }
  for (let i = 0; i < a.length; i++) {
    const c = a[a.length - 1 - i];
    const c2 = b[b.length - 1 - i];
    if (c !== c2) { break; }
    post = c + post;
  }
  const middleA = a.slice(pre.length, a.length - post.length);
  const middleB = b.slice(pre.length, b.length - post.length);
  return {pre, middleA, middleB, post};
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
  const rubiesToHtml = (v: Ruby[]) =>
      v.length ? `<ruby>${v.map(o => o.ruby).join('')}<rt>${v.map(o => o.rt).join('')}</rt></ruby>` : '';
  // collapse adjacent <ruby> tags into one so macOS selection on resulting HTML works: undo JMDict-Furigana <sad>
  const ret = fs.reduce(({stringSoFar, rubiesSoFar}, curr) =>
                            typeof curr === 'object'
                                ? {stringSoFar, rubiesSoFar: rubiesSoFar.concat(curr)}
                                : {stringSoFar: stringSoFar + rubiesToHtml(rubiesSoFar) + curr, rubiesSoFar: []},
                        {stringSoFar: '', rubiesSoFar: [] as Ruby[]});
  return ret.stringSoFar + rubiesToHtml(ret.rubiesSoFar);
}

// make sure furigana's rubys are verbatim the sentence
function checkFurigana(sentence: string, furigana: Furigana[][]): Furigana[][] {
  const rubys = flatten(furigana).map(toruby);
  if (rubys.join('').length >= sentence.length) { return furigana; }
  // whitespace or some other character was stripped. add it back!
  let start = 0;
  let ret: Furigana[][] = [];
  for (const fs of furigana) {
    const chunk = fs.map(toruby).join('');
    const hit = sentence.indexOf(chunk, start);
    if (hit < 0) { throw new Error('cannot find: ' + chunk); }
    ret.push(hit > start ? [sentence.slice(start, hit), ...fs] : fs);
    // prepending the holes like this will keep the same number of morphemes in `furigana`
    start = hit + chunk.length;
  }
  return ret;
}
function toruby(f: Furigana) { return typeof f === 'string' ? f : f.ruby; }

export async function analyzeSentence(sentence: string,
                                      overrides: Partial<Record<string, Furigana[]>> = {}): Promise<AnalysisResult> {
  const parsed = await mecabJdepp(sentence);

  // Promises
  const furiganaP = hasKanji(sentence) ? morphemesToFurigana(sentence, parsed.morphemes, overrides) : undefined;
  const particlesConjphrasesP = identifyFillInBlanks(parsed.bunsetsus);
  const dictionaryHitsP = enumerateDictionaryHits(parsed.morphemes);

  let [furigana, particlesConjphrases, dictionaryHits] =
      await Promise.all([furiganaP, particlesConjphrasesP, dictionaryHitsP]);
  return {furigana, particlesConjphrases, dictionaryHits};
}

export async function scoreHitsToWords(hits: ScoreHit[]) {
  const {db} = await jmdictPromise;
  return idsToWords(db, hits.map(o => o.wordId));
}

export async function getTags() { return jmdictPromise.then(({db}) => getTagsDb(db)) }

export function contextClozeToString(c: ContextCloze): string {
  return (c.left || c.right) ? `${c.left}[${c.cloze}]${c.right}` : c.cloze;
}
export function contextClozeOrStringToString(c: ContextCloze|string): string {
  return typeof c === 'string' ? c : contextClozeToString(c);
}

export async function linesToCurtizMarkdown(lines: string[]) {
  const ret: string[] = [];

  const {db} = await jmdictPromise;
  const tags: Record<string, string> = JSON.parse(await getField(db, 'tags'));

  const MAX_LINES = 8;
  const overrides: Record<string, Furigana[]> = {};
  const startRegexp = /^-\s+@\s+/;
  for (const line of lines) {
    if (!startRegexp.test(line)) {
      ret.push(line);
      continue;
    }
    const sentence = line.slice(line.match(startRegexp)?.[0].length);
    const results = await analyzeSentence(sentence, overrides);
    ret.push(results.furigana ? '- @ ' + results.furigana.map(furiganaToRuby).join('') : line);

    {
      if (results.particlesConjphrases.particles.size) {
        ret.push('  - Particles');
        for (const [_, {cloze}] of results.particlesConjphrases.particles) {
          ret.push(
              `    - ${cloze.left}${cloze.left || cloze.right ? '[' + cloze.cloze + ']' : cloze.cloze}${cloze.right}`);
        }
      }
      if (results.particlesConjphrases.conjugatedPhrases.size) {
        ret.push('  - Conjugated phrases');
        for (const [_, c] of results.particlesConjphrases.conjugatedPhrases) {
          const cloze = c.cloze;
          ret.push(`    - ${contextClozeToString(cloze)} | ${c.lemmas.map(furiganaToRuby).join(' + ')}`);
        }
      }
    }
    {
      ret.push('  - Vocab');
      for (const fromStart of results.dictionaryHits) {
        for (const fromEnd of fromStart.results) {
          ret.push(`  - Vocab: ${contextClozeOrStringToString(fromEnd.run)} INFO`);
          const hits = fromEnd.results.slice(0, MAX_LINES);
          const words = await scoreHitsToWords(hits);
          for (const [wi, w] of words.entries()) {
            ret.push('    - ' + hits[wi].search + ' | ' + displayWordLight(w, tags));
          }
          if (fromEnd.results.length > MAX_LINES) {
            ret.push(`    - (… ${fromEnd.results.length - MAX_LINES} omitted) INFO`);
          }
        }
      }
    }
  }
  return ret;
}

// RFC 4648 §5: base64url
function base64_to_base64url(base64: string) {
  return base64.replace(/\//g, '_').replace(/\+/g, '-').replace(/=+$/g, '');
}
async function fileExists(file: string) { return pfs.access(file).then(() => true).catch(() => false); }

export async function linesToFurigana(lines: string[], buildDictionary = false) {
  const {db} = await jmdictPromise;
  const tags: Record<string, string> = JSON.parse(await getField(db, 'tags'));

  const ret: string[] = [];
  const overrides: Record<string, Furigana[]> = {};

  const parentDir = process.cwd() + '/dict-hits-per-line';
  await mkdirp(parentDir);

  // this will get written to disk
  const lightweight: (string|{line: string, hash: string, furigana: Furigana[][]})[] = [];
  const totalHash = createHash('md5');

  for (const line of lines) {
    totalHash.update(line); // we'll use this to save some lightweight data about each line in this list of `lines`

    if (!hasKanji(line) && !hasKana(line)) {
      ret.push(line);
      lightweight.push(line);
      continue;
    }
    const parsed = await mecabJdepp(line);
    const furigana = await morphemesToFurigana(line, parsed.morphemes, overrides);
    const lineHash = base64_to_base64url(createHash('md5').update(line).digest('base64'));
    ret.push(`<line id="hash-${lineHash}">` + furigana.map(furiganaToRuby).join('') + '</line>');
    lightweight.push({line, hash: lineHash, furigana});

    if (buildDictionary) {
      const sidecarFile = `${parentDir}/line-${lineHash}.json`;
      if (!(await fileExists(sidecarFile))) {
        const dictHits = await enumerateDictionaryHits(parsed.morphemes, false, 10);
        for (let i = 0; i < dictHits.length; i++) {
          for (let j = 0; j < dictHits[i].results.length; j++) {
            const words = await scoreHitsToWords(dictHits[i].results[j].results);
            for (let k = 0; k < words.length; k++) {
              dictHits[i].results[j].results[k].summary = displayWordLight(words[k], tags);
            }
          }
        }
        await pfs.writeFile(sidecarFile,
                            JSON.stringify({line, furigana, bunsetsus: parsed.bunsetsus, dictHits}, null, 1));
        // we should put this block in a promise and await all such promises before returning, to get more throughput
        // (we'd interleave computation between LevelDB/disk i/o)
      }
    }
  }
  {
    const total = base64_to_base64url(totalHash.digest('base64'));
    await pfs.writeFile(`${parentDir}/lightweight-${total}.json`, JSON.stringify(lightweight, null, 1));
  }
  return ret;
}

if (module === require.main) {
  const USAGE = `USAGE:

annotate MODE file1 file2

MODE must be one of:
- "furigana": add furigana to kanji (default)
- "furigana-dict": same as "furigana" but also emit morpheme/dictionary information
- "markdown": output detailed breakdowns of text in files

Input streams are also understood:

annotate MODE < inputfile

cat inputfile | annotate MODE
`;
  enum Mode {
    markdown = 'markdown',
    furigana = 'furigana',
    furiganaDict = 'furigana-dict',
  }

  (async () => {
    {
      await analyzeSentence('ある日の朝早く、ジリリリンとおしりたんてい事務所の電話が鳴りました。');
      console.log('\n===\n');
      await analyzeSentence('鳥の鳴き声が森の静かさを破った');
      console.log('\n===\n');
      await analyzeSentence('早い');
      console.log('\n===\n');
      await analyzeSentence('昨日は寒かった');
      if (Math.random() > -1) { return };
    }

    let lines = `- @ 今日は良い天気だ。

- @ たのしいですか。

- @ 何できた？`.split('\n');
    const [, , requestedMode, ...files] = process.argv;
    if (!Object.values(Mode).includes(requestedMode as any)) {
      console.error(USAGE);
      process.exit(1);
    }
    const mode = requestedMode as Mode;

    if (files.length === 0) {
      const getStdin = require('get-stdin');

      // no arguments, read from stdin. If stdin is empty, use default.
      const raw = (await getStdin()).trim();
      if (raw) { lines = raw.split('\n'); }
    } else {
      lines = flatmap(await Promise.all(files.map(f => pfs.readFile(f, 'utf8'))),
                      s => s.trim().replace(/\r/g, '').split('\n'));
    }

    if (mode === Mode.furigana) {
      console.log((await linesToFurigana(lines, false)).join('\n'));
    } else if (mode === Mode.furiganaDict) {
      console.log((await linesToFurigana(lines, true)).join('\n'));
    } else if (mode === Mode.markdown) {
      console.log((await linesToCurtizMarkdown(lines)).join('\n'));
    } else {
      const _: never = mode;
    }
  })();
}
