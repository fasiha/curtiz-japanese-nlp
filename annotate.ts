import {
  allSubstrings,
  dedupeLimit,
  flatten,
  generateContextClozed,
  hasHiragana,
  hasKana,
  hasKanji,
  kata2hira
} from 'curtiz-utils'
import {eastAsianWidth} from 'eastasianwidth';
import {readdirSync, readFileSync} from 'fs';
import {Entry, Furigana, JmdictFurigana, Ruby, setup as setupJmdictFurigana} from 'jmdict-furigana-node';
import {
  getField,
  getTags as getTagsDb,
  getXrefs,
  idsToWords,
  kanjiBeginning,
  readingBeginning,
  Sense,
  setup as setupJmdict,
  Tag,
  Word,
  Xref,
} from 'jmdict-simplified-node';
import {adjDeconjugate, AdjDeconjugated, Deconjugated, verbDeconjugate} from 'kamiya-codec';
import path from 'path';

import {lookup} from './chino-particles';
import {readingBeginning as readingBeginningCustom} from './customDictionary';
import {
  ConjugatedPhrase,
  ContextCloze,
  FillInTheBlanks,
  Particle,
  ScoreHit,
  ScoreHits,
  SearchMapped,
  v1ResSentence,
  v1ResSentenceNbest
} from './interfaces';
import {addJdepp, Bunsetsu} from './jdepp';
import {setupSimple as kanjidicSetup, SimpleCharacter} from './kanjidic';
import {lemmaVsLiteral} from './lemmaVsLiteral';
import {invokeMecab, maybeMorphemesToMorphemes, Morpheme, parseMecab} from './mecabUnidic';

export * from './interfaces';

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
export const jmdictPromise = setupJmdict(
    process.env['JMDICT_SIMPLIFIED_LEVELDB'] || 'jmdict-simplified',
    process.env['JMDICT_SIMPLIFIED_JSON'] ||
        readdirSync('.').sort().reverse().find(s => s.startsWith('jmdict-eng') && s.endsWith('.json')) ||
        'jmdict-eng-3.1.0.json',
    true,
    true,
);

/**
 * Without this limit on how many Leveldb hits jmdict-simplified-node will get, things slow way down. Not much loss in
 * usefulness with this set to 20.
 */
const DICTIONARY_LIMIT = 20;

/**
 * Outer index: 1 through `nBest` MeCab parsings.
 * Inner index: individual morphemes/bunsetsu
 */
interface MecabJdeppParsed {
  morphemes: Morpheme[];
  bunsetsus: Bunsetsu<Morpheme>[];
}
export async function mecabJdepp(sentence: string, nBest = 1): Promise<MecabJdeppParsed[]> {
  let rawMecab = await invokeMecab(sentence, nBest);
  let {morphemes: allSentencesMorphemes, raws: allSentencesRaws} = parseMecab(rawMecab, nBest);
  // throw away multiple sentences, we're only going to pass in one (hopefully)
  const morphemes = allSentencesMorphemes[0];
  const raws = allSentencesRaws[0];
  const bunsetsus = await Promise.all(morphemes.map((attempt, idx) => addJdepp(raws[idx], attempt)))
  return morphemes.map((attempt, idx) => ({morphemes: attempt, bunsetsus: bunsetsus[idx]}));
}

const hasFullWidth = (s: string): boolean => s.split('').some(c => eastAsianWidth(c) === 'F');
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
      const runLiteralCore = bunsetsuToLiteral(run);
      const runLiteral = simplify(generateContextClozed(bunsetsuToLiteral(morphemes.slice(0, startIdx)), runLiteralCore,
                                                        bunsetsuToLiteral(morphemes.slice(endIdx))));
      if (!full) {
        // skip particles like は and も if they're by themselves as an optimization
        if (runLiteralCore.length === 1 && hasKana(runLiteralCore[0]) && runLiteralCore === run[0].lemma) { continue; }
      }
      const scored: ScoreHit[] = [];

      function helperSearchesHitsToScored(searches: string[], subhits: Word[][],
                                          searchKey: "kana"|"kanji"): ScoreHit[] {
        return flatten(subhits.map((v, i) => v.map(w => {
          // help catch issues with automatic type widening and excess property checks
          const ret: ScoreHit = {
            wordId: w.id,
            score: scoreMorphemeWord(run, searches[i], searchKey, w),
            search: searches[i],
            tags: {},
            word: w
            // run: runLiteral,
            // runIdx: [startIdx, endIdx - 1],
          };
          return ret;
        })));
      }
      // Search reading
      {
        const readingSearches = forkingPaths(run.map(m => m.searchReading)).map(v => v.join(''));
        // Consider searching rendaku above for non-initial morphemes? It'd be nice if "猿ちえお" (saru chi e o) found
        // "猿知恵" (さるぢえ・さるじえ)

        const readingSubhits: Word[][] = await Promise.all(readingSearches.map(
            search =>
                Promise.all([readingBeginning(db, search, DICTIONARY_LIMIT), readingBeginningCustom(null, search)])
                    .then(([a, b]) => [...a, ...b])));
        scored.push(...helperSearchesHitsToScored(readingSearches, readingSubhits, 'kana'));
      }
      // Search literals if needed, this works around MeCab mis-readings like お父さん->おちちさん
      {
        const kanjiSearches =
            forkingPaths(run.map(m => m.searchKanji)).map(v => v.join('')).filter(s => hasKanji(s) || hasFullWidth(s));
        const kanjiSubhits =
            await Promise.all(kanjiSearches.map(search => kanjiBeginning(db, search, DICTIONARY_LIMIT)));
        scored.push(...helperSearchesHitsToScored(kanjiSearches, kanjiSubhits, 'kanji'));
      }

      scored.sort((a, b) => b.score - a.score);
      if (scored.length > 0) {
        results.push({endIdx, run: runLiteral, results: dedupeLimit(scored, o => o.wordId, limit)});
      }
    }

    if (results.length === 0) {
      // we didn't find ANYTHING for this morpheme? Try character by character
      const m = morphemes[startIdx];

      const scored: ScoreHit[] = [];

      for (const [searches, searchFn, key] of [[m.searchReading, readingBeginning, 'kana'],
                                               [m.searchKanji, kanjiBeginning, 'kanji'],
      ] as const) {
        for (const search of searches) {
          const all = Array.from(allSubstrings(search));
          const subhits = await Promise.all(all.map(search => searchFn(db, search, DICTIONARY_LIMIT)));
          for (const [idx, hits] of subhits.entries()) {
            const search = all[idx];
            for (const w of hits) {
              const score = scoreMorphemeWord([m], search, key, w)
              scored.push({wordId: w.id, score, search, tags: {}});
            }
          }
        }
      }

      if (scored.length > 0) {
        scored.sort((a, b) => b.score - a.score);
        const endIdx = startIdx + 1;

        const run = morphemes.slice(startIdx, endIdx);
        const runLiteralCore = bunsetsuToLiteral(run);
        const runLiteral = simplify(generateContextClozed(bunsetsuToLiteral(morphemes.slice(0, startIdx)),
                                                          runLiteralCore, bunsetsuToLiteral(morphemes.slice(endIdx))));

        results.push({endIdx, run: runLiteral, results: dedupeLimit(scored, o => o.wordId, limit)});
      }
    }
    {
      // add relateds
      for (const r of results) {
        const words = await jmdictIdsToWords(r.results);
        const xrefs = words.flatMap(w => w.sense.flatMap(s => s.related));
        const references = await Promise.all(xrefs.flatMap(x => getXrefs(db, x).then(refs => ({refs, xref: x}))));

        for (const {refs, xref} of references) {
          for (const word of refs) {
            r.results.push({wordId: word.id, score: 0, search: JSON.stringify({xref}), tags: {}, isXref: true})
          }
        }
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

const bunsetsuToLiteral = (morphemes: Morpheme[]) => morphemes.map(m => m.literal).join('');
const bunsetsuToReading = (morphemes: Morpheme[]) => morphemes.map(m => m.pronunciation).join('');
function betterMorphemePredicate(m: Morpheme): boolean {
  return !(m.partOfSpeech[0] === 'supplementary_symbol') && !(m.partOfSpeech[0] === 'particle');
}
function toLemmaFurigana(morphemes: Morpheme[], jf: JmdictFurigana): Furigana[][] {
  return morphemes.map(o => {
    const entries = jf.textToEntry.get(o.lemma) || [];
    if (o.lemma.endsWith('-他動詞') && o.partOfSpeech[0] === 'verb') {
      // sometimes ("ひいた" in "かぜひいた"), UniDic lemmas are weird like "引く-他動詞" eyeroll
      entries.push(...(jf.textToEntry.get(o.lemma.replace('-他動詞', '')) || []))
    }
    const lemmaReading = kata2hira(o.lemmaReading);
    const entry = entries.find(e => e.reading === lemmaReading);
    return entry ? entry.furigana : o.lemma === lemmaReading ? [lemmaReading] : [{ruby: o.lemma, rt: lemmaReading}];
  });
}

async function morphemesToConjPhrases(startIdx: number, goodBunsetsu: Morpheme[], fullCloze: ContextCloze,
                                      verbose = false): Promise<ConjugatedPhrase> {
  const endIdx = startIdx + goodBunsetsu.length;
  const cloze = bunsetsuToLiteral(goodBunsetsu);
  const clozeReading = bunsetsuToReading(goodBunsetsu);
  const jf = await jmdictFuriganaPromise;

  const lemmas = toLemmaFurigana(goodBunsetsu, jf);

  const ret: ConjugatedPhrase = {deconj: [], startIdx, endIdx, morphemes: goodBunsetsu, cloze: fullCloze, lemmas};

  const first = goodBunsetsu[0];
  const pos0 = first.partOfSpeech[0];
  const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1];
  const verbNotAdj = pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0Last === 'verbal_suru';
  const ichidan = first.inflectionType?.[0].includes('ichidan');
  const iAdj = pos0.endsWith('adjective_i');

  const deconjs: (AdjDeconjugated|Deconjugated)[] = [];
  for (const mergeSuffixes of [true, false]) {
    // sometimes the lemma is too helpful: "ワンダフル-wonderful", so split on dash
    let dictionaryForm = goodBunsetsu[0].lemma.split('-')[0];
    let dictionaryFormReading = goodBunsetsu[0].lemmaReading;
    if (mergeSuffixes) {
      const nonSuffixIdx = goodBunsetsu.findIndex((m, i) => i > 0 && m.partOfSpeech[0] !== 'suffix');
      if (nonSuffixIdx >= 1) {
        const addition = goodBunsetsu.slice(1, nonSuffixIdx);
        dictionaryForm += addition.map(m => m.lemma.split('-')[0]).join('');
        dictionaryFormReading += addition.map(m => m.lemmaReading).join('');
      }
    }

    // Often the literal cloze will have fewer kanji than the lemma
    if (cloze.split('').filter(hasKanji).length !== dictionaryForm.split('').filter(hasKanji).length) {
      // deconjugate won't find anything. Look at lemmas and try to kana-ify the dictionaryForm
      for (const lemma of lemmas.flat()) {
        if (typeof lemma === 'string') { continue; }
        const {rt} = lemma;
        // As above, the lemma is sometimes too detailed: "引く-他動詞"
        const ruby = lemma.ruby.split('-')[0];
        // Replace the kanji in the dictionary form if it's not in the literal cloze
        if (!cloze.includes(ruby)) { dictionaryForm = dictionaryForm.replace(ruby, rt); }
      }
    }

    if (verbose) { console.log('? ', {verbNotAdj, ichidan, iAdj, dictionaryForm, cloze}) }
    const deconj =
        verbNotAdj ? verbDeconjugate(cloze, dictionaryForm, ichidan) : adjDeconjugate(cloze, dictionaryForm, iAdj);
    if (deconj.length) {
      deconjs.push(...(deconj as Ugh<typeof deconj>));
    } else {
      // this sometimes doens't work, let's try a few hacks
      let hacksSuccess = false;

      // sometimes, the lemma has a totally different kanji: 刺される has lemma "差す-他動詞" lol.
      // in these situations, try replacing kanji from the cloze into the dictionary form.
      const clozeKanji = cloze.split('').filter(hasKanji);
      const dictKanji = dictionaryForm.split('').filter(hasKanji);
      if (clozeKanji.length === dictKanji.length) {
        // This is a very stupid way to do it but works for 刺される: replace kanji one at a time...
        for (const [idx, clozeK] of clozeKanji.entries()) {
          const dictK = dictKanji[idx];
          const newDictionaryForm = dictionaryForm.replace(dictK, clozeK);
          const deconj = verbNotAdj ? verbDeconjugate(cloze, newDictionaryForm, ichidan)
                                    : adjDeconjugate(cloze, newDictionaryForm, iAdj);
          if (deconj.length) {
            deconjs.push(...(deconj as Ugh<typeof deconj>));
            // if we find something, pray it's good and bail.
            hacksSuccess = true;
            break;
          }
        }
      }

      // we have one more trick, useful for cases where UniDic gives "抑える"'s lemma as "押さえる" facepalm: totally
      // different kanji AND different okurigana
      if (!hacksSuccess && verbNotAdj) {
        const proposedLemma = lemmaVsLiteral({
          literal: cloze,
          literalReading: clozeReading,
          lemma: dictionaryForm,
          lemmaReading: dictionaryFormReading,
          jmdictFurigana: jf
        });
        if (proposedLemma) {
          // retry with the new lemma
          const deconj = verbDeconjugate(cloze, proposedLemma, ichidan);
          if (deconj.length) {
            deconjs.push(...(deconj as Ugh<typeof deconj>));
            hacksSuccess = true;
          }
        }
      }
    }
  }
  (ret.deconj as Ugh<typeof ret['deconj']>) = uniqueKey(deconjs, x => {
    if ('auxiliaries' in x) { return x.auxiliaries.join('/') + x.conjugation + x.result.join('/') }
    return x.conjugation + x.result.join('/');
  });
  return ret;
}
type Ugh<T> = (T extends(infer X)[] ? X : never)[];
function uniqueKey<T>(v: T[], key: (x: T) => string): T[] {
  const ys = new Set();
  const ret: T[] = [];
  for (const x of v) {
    const y = key(x);
    if (ys.has(y)) { continue; }
    ys.add(y);
    ret.push(x);
  }
  return ret;
}

function* allSlices<T>(v: T[]) {
  for (let start = 0; start < v.length; start++) {
    for (let end = start + 1; end < v.length + 1; end++) { yield {start, end, slice: v.slice(start, end)}; }
  }
}

// Find clozes: particles and conjugated verb/adjective phrases
export async function identifyFillInBlanks(bunsetsus: Morpheme[][], verbose = false): Promise<FillInTheBlanks> {
  const sentence = bunsetsus.map(bunsetsuToLiteral).join('');
  const conjugatedPhrases: ConjugatedPhrase[] = [];
  const particles: Particle[] = [];
  for (const [bidx, fullBunsetsu] of bunsetsus.entries()) {
    const startIdx = bunsetsus.slice(0, bidx).map(o => o.length).reduce((p, c) => p + c, 0);
    if (!fullBunsetsu[0]) { continue; }
    for (const {start, slice: sliceBunsetsu} of allSlices(fullBunsetsu)) {
      const left =
          bunsetsus.slice(0, bidx).map(bunsetsuToLiteral).join('') + bunsetsuToLiteral(fullBunsetsu.slice(0, start));
      const first = sliceBunsetsu[0];

      if (verbose) { console.log('g', sliceBunsetsu.map(o => o.literal).join(' ')) }
      const pos0 = first.partOfSpeech[0] || '';
      const pos1 = first.partOfSpeech[1] || '';
      const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1] || '';
      /*
      If a bunsetsu has >1 morphemes, check if it's a verb or an adjective (i or na).
      If it's just one, make sure it's an adjective that's not a conclusive (catches 朝早く)
      Also check for copulas (da/desu).
      */
      if ((sliceBunsetsu.length === 1 && pos0.startsWith('adjectiv') &&
           (first.inflection?.[0] ? !first.inflection[0].endsWith('conclusive') : true)) ||
          (sliceBunsetsu.length > 0 &&
           (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject') ||
            pos0Last === 'verbal_suru' || pos0Last.startsWith('adjectival'))) ||
          ((pos0.startsWith('aux') && (pos1.startsWith('desu') || pos1.startsWith('da'))))) {
        const middle = bunsetsuToLiteral(sliceBunsetsu);
        const right = sentence.slice(left.length + middle.length);
        const cloze = generateContextClozed(left, middle, right)
        const res = await morphemesToConjPhrases(startIdx + start, sliceBunsetsu, cloze)
        if (verbose) { console.log('^ found', res.deconj); }
        if (res.deconj.length) { conjugatedPhrases.push(res); }
      }
    }

    // Handle particles: identify and look up in Chino's "All About Particles" list
    const particlePredicate = (p: Morpheme) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1;
    for (const [pidx, particle] of fullBunsetsu.entries()) {
      if (particlePredicate(particle)) {
        const startIdxParticle = startIdx + pidx;
        const endIdx = startIdxParticle + 1;
        const left =
            bunsetsus.slice(0, bidx).map(bunsetsuToLiteral).join('') + bunsetsuToLiteral(fullBunsetsu.slice(0, pidx));
        const right =
            bunsetsuToLiteral(fullBunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToLiteral).join('');
        const cloze = generateContextClozed(left, particle.literal, right);
        const chino = lookup(cloze.cloze);
        if (particle.literal !== particle.lemma) {
          const chinoLemma = lookup(particle.lemma);
          for (const [chinoNum, chinoStr] of chinoLemma) {
            if (!chino.find(([c]) => c === chinoNum)) { chino.push([chinoNum, chinoStr]); }
          }
        }
        particles.push({chino, cloze, startIdx: startIdxParticle, endIdx, morphemes: [particle]});
      }
    }
  }
  // Try to glue adjacent particles together if they are in Chino's list of particles too
  const allMorphemes = bunsetsus.flat();
  for (let i = 0; i < particles.length; i++) {
    // `4` below means we'll try to glue 3 particles together
    // `j<=...` has to be `<=` because `j` will be `slice`'s 2nd arg and is exclusive (not inclusive)
    for (let j = i + 2; (j < i + 4) && (j <= particles.length); j++) {
      const adjacent = particles.slice(i, j);

      if (!adjacent.every((curr, idx, arr) => arr[idx + 1] ? curr.endIdx === arr[idx + 1].startIdx : true)) {
        // `adjacent` isn't actually adjacent
        continue;
      }

      const combined = adjacent.map(o => o.cloze.cloze).join('');
      const hits = lookup(combined);
      if (hits.length) {
        const first = adjacent[0];
        const last = adjacent[adjacent.length - 1];
        const left = bunsetsuToLiteral(allMorphemes.slice(0, first.startIdx));
        const right = bunsetsuToLiteral(allMorphemes.slice(last.endIdx));
        const cloze = generateContextClozed(left, combined, right);

        particles.push({
          chino: hits,
          cloze,
          startIdx: first.startIdx,
          endIdx: last.endIdx,
          morphemes: adjacent.flatMap(o => o.morphemes)
        });
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

  // In these markdown-like tables, the columns folow mecabUnidic.ts, and are:
  // | literal | pronunciation | lemma reading| lemma |

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
      if (kanji.length === 0) { return annotatedChars.filter(x => x !== ''); }
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

export async function jmdictIdsToWords(searches: {wordId: string, word?: Word}[]): Promise<Word[]> {
  const {db} = await jmdictPromise;
  const missingWord = searches.filter(x => !x.word);
  const missingWordsFound = await idsToWords(db, missingWord.map(o => o.wordId));
  let i = 0;
  return searches.map(x => x.word ? x.word : missingWordsFound[i++])
}

export async function getTags() { return jmdictPromise.then(({db}) => getTagsDb(db)) }

function contextClozeToString(c: ContextCloze): string {
  return (c.left || c.right) ? `${c.left}[${c.cloze}]${c.right}` : c.cloze;
}
function contextClozeOrStringToString(c: ContextCloze|string): string {
  return typeof c === 'string' ? c : contextClozeToString(c);
}

const tagsPromise = jmdictPromise.then(({db}) => db)
                        .then(db => getField(db, 'tags'))
                        .then(raw => JSON.parse(raw) as Record<string, string>);

const kanjidicPromise = kanjidicSetup();

const wanikaniGraph: {[k: string]: string[]}&{metadata: Record<string, string>} =
    JSON.parse(readFileSync(path.join(__dirname, 'wanikani-kanji-graph.json'), 'utf8'));

export async function handleSentence(sentence: string, overrides: Record<string, Furigana[]> = {}, includeWord = true,
                                     extractParticlesConj = true, nBest = 1): Promise<v1ResSentenceNbest> {
  if (!hasKanji(sentence) && !hasKana(sentence)) {
    const resBody: v1ResSentence = sentence;
    return [resBody];
  }

  const res = await mecabJdepp(sentence, nBest);
  return Promise.all(res.map(async res => {
    const morphemes: Morpheme[] = res.morphemes;
    const bunsetsus: Bunsetsu<Morpheme>[] = res.bunsetsus;
    const furigana = await morphemesToFurigana(sentence, morphemes, overrides);
    const tags = await tagsPromise;
    const dictHits = await enumerateDictionaryHits(morphemes, true, 10);
    for (let i = 0; i < dictHits.length; i++) {
      for (let j = 0; j < dictHits[i].results.length; j++) {
        const words = await jmdictIdsToWords(dictHits[i].results[j].results);
        for (let k = 0; k < words.length; k++) {
          dictHits[i].results[j].results[k].summary = displayWordLight(words[k], tags);
          if (includeWord) {
            const word = words[k]
            dictHits[i].results[j].results[k].word = word;

            const thisTag = dictHits[i].results[j].results[k].tags;
            for (const tag of word.sense.flatMap(s =>
                                                     s.field.concat(s.dialect).concat(s.misc).concat(s.partOfSpeech))) {
              thisTag[tag] = tags[tag];
            }
          }
        }
      }
    }

    const kanjidic = await kanjidicPromise;
    const kanjidicHits =
        Object.fromEntries(sentence.split('')
                               .filter(c => c in kanjidic)
                               .map(c => [c, {
                                      ...kanjidic[c],
                                      dependencies: searchMap(treeSearch(wanikaniGraph, c),
                                                              c => (kanjidic[c] || null) as SimpleCharacter | null)
                                                        .children
                                    }]));

    let clozes: undefined|FillInTheBlanks = undefined;
    if (extractParticlesConj) { clozes = await identifyFillInBlanks(bunsetsus.map(o => o.morphemes)); }

    const jf = await jmdictFuriganaPromise;
    const resBody: v1ResSentence = {
      furigana,
      hits: dictHits,
      kanjidic: kanjidicHits,
      clozes,
      tags: includeWord ? tags : undefined,
      bunsetsus,
      lemmaFurigana: toLemmaFurigana(morphemes, jf)
    };
    return resBody;
  }))
}

type Tree = Record<string, string[]>;
type Search = {
  node: string,
  children: Search[]
};
function treeSearch(tree: Tree, node: string, seen: Set<string> = new Set()): Search {
  seen.add(node);
  const children = (tree[node] || []).filter(node => !seen.has(node));
  for (const child of children) { seen.add(child); }

  return { node, children: children.map(node => treeSearch(tree, node, seen)) }
}

function searchMap<T>(search: Search, f: (s: string) => T): SearchMapped<T> {
  return {node: search.node, nodeMapped: f(search.node), children: search.children.map(node => searchMap(node, f))};
}

if (module === require.main) {
  function renderDeconjugation(d: AdjDeconjugated|Deconjugated) {
    if ("auxiliaries" in d) { return `${d.auxiliaries.join(" + ")} + ${d.conjugation}`; }
    return d.conjugation;
  }
  (async () => {
    for (
        const line of
            ['Ｔシャツ',
             // ブラックシャドー団は集団で盗みを行う窃盗団でお金持ちの家を狙い、家にある物全て根こそぎ盗んでいきます。',
             // 'お待ちしておりました',
             // '買ったんだ',
             // 'どなたからでしたか？',
             // '動物でも人間の心が分かります',
             // 'ある日の朝早く、ジリリリンとおしりたんてい事務所の電話が鳴りました。',
             // '鳥の鳴き声が森の静かさを破った',
             // '早い',
             // '昨日はさむかった',
             // 'よかった',
    ]) {
      console.log('\n===\n');
      const xs = await handleSentence(line);
      for (const x of xs) {
        if (typeof x === 'string') { continue }
        console.log(x.furigana)
        console.log('conj')
        p(x.clozes?.conjugatedPhrases.map(o => o.morphemes.map(m => m.literal).join('|')))
        console.log('deconj')
        console.dir(x.clozes?.conjugatedPhrases.map(
                        o => (o.deconj as (AdjDeconjugated | Deconjugated)[]).map(m => renderDeconjugation(m))),
                    {depth: null})
        // console.log('particles')
        // console.dir(x.particlesConjphrases.particles.map(o => [o.startIdx, o.endIdx, o.cloze.cloze, o.chino.length]))
        // p(x.particlesConjphrases.particles.map(o => o.chino))
        const SHOW_HITS: boolean = false;
        if (SHOW_HITS) {
          const MAX_LINES = 10000;
          const {db} = await jmdictPromise;
          const tags: Record<string, string> = JSON.parse(await getField(db, 'tags'));

          for (const fromStart of x.hits) {
            for (const fromEnd of fromStart.results) {
              console.log(`  - Vocab: ${contextClozeOrStringToString(fromEnd.run)} INFO`);
              const hits = fromEnd.results.slice(0, MAX_LINES);
              const words = await jmdictIdsToWords(hits);
              for (const [wi, w] of words.entries()) {
                console.log('    - ' + hits[wi].search + ' | ' + displayWordLight(w, tags));
              }
              if (fromEnd.results.length > MAX_LINES) {
                console.log(`    - (… ${fromEnd.results.length - MAX_LINES} omitted) INFO`);
              }
            }
          }
        }
      }
    }
  })();
}
