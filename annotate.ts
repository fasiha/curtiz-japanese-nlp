import {flatten, hasHiragana, hasKanji, kata2hira} from 'curtiz-utils'
import {promises as pfs} from 'fs';
import {JmdictFurigana, setup as setupJmdictFurigana} from 'jmdict-furigana-node';
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

export async function mecabJdepp(sentence: string): Promise<{morphemes: Morpheme[]; bunsetsus: Morpheme[][];}> {
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
export async function main(text: string) {
  const {db} = await jmdictPromise;
  const parsed = await mecabJdepp(text);

  const jmdictFurigana = await jmdictFuriganaPromise;
  const morphemes: WithSearch<Morpheme>[] = parsed.morphemes.map(
      m => ({...m, search: morphemeToSearchLemma(m).concat(morphemeToStringLiteral(m, jmdictFurigana))}));

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

if (module === require.main) {
  (async () => {
    const jmdictFurigana = await jmdictFuriganaPromise;
    const {db} = await jmdictPromise;
    const tags = JSON.parse(await getField(db, 'tags'));

    {
      const lines = (await pfs.readFile('tono.txt', 'utf8')).trim().split('\n').map(s => s.split('\t')[0]);
      const MAX_LINES = 25;
      for (const line of lines.slice(0, 2)) {
        console.log('\n\n# ' + line);
        const res = await main(line);
        for (const fromStart of res) {
          console.log('\n## START')
          for (const fromEnd of fromStart) {
            console.log('### end: ' + ((fromEnd[0] && fromEnd[0].searches.join('・')) || ''));
            for (const w of fromEnd.slice(0, MAX_LINES)) {
              console.log(displayWordDetailed(w.word, tags) + ` (score: ${w.score})`);
            }
            if (fromEnd.length > MAX_LINES) { console.log(`(… ${fromEnd.length - MAX_LINES} omitted)`); }
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