import {filterRight, flatten, hasHiragana, hasKanji, kata2hira} from 'curtiz-utils'
import {promises as pfs} from 'fs';
import {Furigana, furiganaToString, JmdictFurigana, setup as setupJmdictFurigana} from 'jmdict-furigana-node';
import {
  getField,
  readingAnywhere,
  readingBeginning,
  setup as setupJmdict,
  Simplified,
  Word
} from 'jmdict-simplified-node';

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
type WithSearch<T> = T&{ search: string[]; };
type ScoreHit = {
  word: Word,
  score: number,
  searches: string[],
};
export async function enumerateDictionaryHits(parsed: MecabJdeppParsed) {
  const {db} = await jmdictPromise;

  const jmdictFurigana = await jmdictFuriganaPromise;
  const morphemes: WithSearch<Morpheme>[] = parsed.morphemes.map(
      m => ({...m, search: unique(morphemeToSearchLemma(m).concat(morphemeToStringLiteral(m, jmdictFurigana)))}));

  const superhits: ScoreHit[][][] = [];
  for (const [i, m] of morphemes.entries()) {
    const hits: ScoreHit[][] = [];
    for (let j = morphemes.length; j > i; --j) {
      const run = morphemes.slice(i, j);
      const searches = forkingPaths(run.map(m => m.search)).map(v => v.join(''));

      const subhits = flatten(await Promise.all(searches.map(search => readingBeginning(db, search))));
      const scored: ScoreHit[] = subhits.map(word => ({word, score: scoreMorphemeWord(run, searches, word), searches}));
      // I want to see length matches first
      // then kanji matches
      scored.sort((a, b) => b.score - a.score);
      if (scored.length > 0) { hits.push(scored); }
    }
    superhits.push(hits);
  }
  return superhits;
}
function scoreMorphemeWord(run: Morpheme[], searches: string[], word: Word): number {
  const len = searches[0].length;
  // if the shortest kana is shorter than the search, let the cost be 0. If shortest kana is longer than search, let the
  // overrun cost be negative
  const overrunPenalty = Math.min(
      0, len - Math.min(
                   ...word.kana.filter(k => searches.some(search => k.text.includes(search))).map(k => k.text.length)));

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

const circledNumbers = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳".split('');
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

interface ContextCloze {
  left: string;
  cloze: string;
  right: string;
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
interface ConjugatedPhrase {
  cloze: ContextCloze;
  lemmas: Furigana[][];
}
async function identifyFillInBlanks(bunsetsus: Morpheme[][]) {
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
        // if we found a bunsetsu to study, don't search for particles *inside* it!
        continue;
      }
    }
    // only add particles if they're NOT inside conjugated phrases
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
  return conjugatable ? [kata2hira(m.lemmaReading)] : [];
  // literal's pronunciation will handle the rest
}

const CHOUONPU = 'ー'; // https://en.wikipedia.org/wiki/Ch%C5%8Donpu
function morphemeToStringLiteral(m: Morpheme, jmdictFurigana?: JmdictFurigana): string[] {
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

  // No choice, オー and トー need to be mapped to both options

  const pronunciation = m.pronunciation.split('');
  let ret: string[][] = [[]];
  for (const [i, p] of pronunciation.entries()) {
    if (p === CHOUONPU) {
      if (pronunciation[i - 1] === 'ト' || pronunciation[i - 1] === 'オ') {
        ret = [...ret.map(v => v.concat('オ')), ...ret.map(v => v.concat('ウ'))];
      } else {
        ret.forEach(v => v.push(DUMB_CHOUONPU_MAP.get(pronunciation[i - 1]) || CHOUONPU))
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

if (module === require.main) {
  (async () => {
    const jmdictFurigana = await jmdictFuriganaPromise;
    const {db} = await jmdictPromise;
    const tags = JSON.parse(await getField(db, 'tags'));

    {
      const lines = (await pfs.readFile('tono.txt', 'utf8')).trim().split('\n').map(s => s.split('\t')[0]);
      const MAX_LINES = 25;
      for (const line of lines.slice(0, 3)) {
        console.log('- ' + line);
        const parsed = await mecabJdepp(line);

        {
          const res = await identifyFillInBlanks(parsed.bunsetsus);
          if (res.particles.size) {
            console.log('  - Particles');
            for (const [_, cloze] of res.particles) {
              console.log(`    - @fill ${cloze.left}${
                  cloze.left || cloze.right ? '[' + cloze.cloze + ']' : cloze.cloze}${cloze.right}`);
            }
          }
          if (res.conjugatedPhrases.size) {
            console.log('  - Conjugated phrases');
            for (const [_, c] of res.conjugatedPhrases) {
              const cloze = c.cloze;
              console.log(`    - @fill ${cloze.left}${
                  cloze.left || cloze.right ? '[' + cloze.cloze + ']'
                                            : cloze.cloze}${cloze.right} @hint ${furiganaToString(c.lemmas[0])}`);
            }
          }
        }
        {
          const res = await enumerateDictionaryHits(parsed);
          for (const fromStart of res) {
            for (const fromEnd of fromStart) {
              console.log('  - end: ' + ((fromEnd[0] && fromEnd[0].searches.join('・')) || ''));
              for (const w of fromEnd.slice(0, MAX_LINES)) {
                console.log('    - @dict ' + displayWordDetailed(w.word, tags) + ` (score: ${w.score})`);
              }
              if (fromEnd.length > MAX_LINES) { console.log(`    - (… ${fromEnd.length - MAX_LINES} omitted)`); }
            }
          }
        }
      }
    }

    if (false) {
      const lines = (await pfs.readFile('tono.txt', 'utf8')).trim().split('\n').map(s => s.split('\t')[0]).join('\n');
      const parsed = flatten(await parse(lines));
      const chu = parsed.filter(o => o.pronunciation.includes(CHOUONPU));
      const sols = chu.map(m => morphemeToStringLiteral(m, jmdictFurigana));
      console.log(`${chu.length} morphemes with chouonpu`);
      console.log(chu.map(({literal, pronunciation, lemmaReading, lemma},
                           i) => [literal, sols[i].join('・'), pronunciation, lemmaReading, lemma].join(' | '))
                      .join('\n'));
    }
  })();
}
