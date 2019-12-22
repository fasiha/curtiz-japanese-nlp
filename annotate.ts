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
export async function main(text: string) {
  const {db} = await jmdictPromise;
  const parsed = await mecabJdepp(text);

  const jmdictFurigana = await jmdictFuriganaPromise;
  const morphemes: WithSearch<Morpheme>[] =
      parsed.morphemes.map(m => ({...m, search: morphemeToSearchString(m, jmdictFurigana)}));

  const superhits: Word[][][] = [];
  for (const [i, m] of morphemes.entries()) {
    const hits: Word[][] = [];
    for (let j = morphemes.length; j > i; --j) {
      const run = morphemes.slice(i, j);
      const searches = forkingPaths(run.map(m => m.search)).map(v => v.join(''));

      const subhits = flatten(await Promise.all(searches.map(search => readingBeginning(db, search))));
      if (subhits.length > 0) { hits.push(subhits); }
    }
    superhits.push(hits);
  }
  return superhits;
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
      // const lines = (await pfs.readFile('tono.txt', 'utf8')).trim().split('\n').map(s => s.split('\t')[0]);
      const res = await main('彼はこの大学の学生だ。');
      for (const fromStart of res) {
        console.log('\n# START')
        for (const fromEnd of fromStart) {
          console.log('## end')
          for (const w of fromEnd) { console.log(displayWordDetailed(w, tags)); }
        }
      }
      // console.dir(res, {depth: null});
      // const res = await main(lines[0]);
      // console.dir(res, {depth: null});
    }

    if (false) {
      const lines = (await pfs.readFile('tono.txt', 'utf8')).trim().split('\n').map(s => s.split('\t')[0]).join('\n');
      const parsed = flatten(await parse(lines));
      const chu = parsed.filter(o => o.pronunciation.includes(CHOUONPU));
      const sols = chu.map(m => morphemeToSearchString(m, jmdictFurigana));
      console.log(`${chu.length} morphemes with chouonpu`);
      console.log(chu.map(({literal, pronunciation, lemmaReading, lemma},
                           i) => [literal, sols[i].join('・'), pronunciation, lemmaReading, lemma].join(' | '))
                      .join('\n'));
    }
  })();
}

const CHOUONPU = 'ー'; // https://en.wikipedia.org/wiki/Ch%C5%8Donpu
function morphemeToSearchString(m: Morpheme, jmdictFurigana?: JmdictFurigana): string[] {
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