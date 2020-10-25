import assert from 'assert';
import * as kamiya from 'kamiya-codec';

import {invokeMecab, maybeMorphemesToMorphemes, Morpheme, parseMecab} from './mecabUnidic';

export interface GrammarNote {
  idxs: number[];
  source: string;
  id: string;
}

export function decodeKamiya1_12_vconj_masu_mashou(ms: Morpheme[]) {
  const ret: GrammarNote[] = [];
  for (const [i, m] of ms.entries()) {
    if (m.partOfSpeech[0].startsWith('verb') &&
        kamiya.conjugate(m.lemma, kamiya.Conjugation.Conjunctive, m.partOfSpeech[0].includes('ichidan')) &&
        ms[i + 1]?.lemma === 'ます') {
      const infl = ms[i + 1]?.inflection?.[0];
      // ます and ました correspond to 'conclusive' and 'continuative' respectively. This is in contrast to ましょう
      // which is 'volitional_tentative', and which belongs to rule 1.2.
      if (infl === 'volitional_tentative') {
        ret.push({idxs: [i, i + 1], source: 'Kamiya_2001_HJV', id: '1.2'});
      } else {
        // likely `infl` is 'conclusive' or `continuative'
        ret.push({idxs: [i, i + 1], source: 'Kamiya_2001_HJV', id: '1.1'});
      }
    }
  }
  return ret;
}

export function decodeKamiya7_25_vte_oku(ms: Morpheme[]) {
  const ret: GrammarNote[] = [];
  for (const [i, m] of ms.entries()) {
    if (
        m.partOfSpeech[0].startsWith('verb')                                                // verb
        && ms[i + 1]?.literal === 'て' && ms[i + 1]?.partOfSpeech[0].startsWith('particle') // te
        && ms[i + 2]?.lemma === '置く' && ms[i + 2]?.partOfSpeech[0].startsWith('verb')     // oku
    ) {
      ret.push({idxs: [i, i + 1, i + 2], source: 'Kamiya_2001_HJV', id: '7.25'})
    }
  }
  return ret;
}
export function decodeKamiya7_26_vte_shimau(ms: Morpheme[]) {
  const ret: GrammarNote[] = [];
  for (const [i, m] of ms.entries()) {
    if (
        m.partOfSpeech[0].startsWith('verb')                                                     // verb
        && ms[i + 1]?.literal === 'て' && ms[i + 1]?.partOfSpeech[0].startsWith('particle')      // te
        && ms[i + 2]?.lemmaReading === 'シマウ' && ms[i + 2]?.partOfSpeech[0].startsWith('verb') // shimau
    ) {
      ret.push({idxs: [i, i + 1, i + 2], source: 'Kamiya_2001_HJV', id: '7.26'})
    }
  }
  return ret;
}

if (require.main === module) {
  async function parse(s: string) {
    return maybeMorphemesToMorphemes(parseMecab(s, await invokeMecab(s))[0].filter(o => !!o))
  }
  (async function main() {
    const tests = [
      {sentence: 'お父さんに話してしまいました', expected: [{id: '7.26'}, {id: '1.1'}]},
      {sentence: 'お箸を買っておきましょう', expected: [{id: '1.2'}, {id: '7.25'}]},
    ];
    const functions = [decodeKamiya1_12_vconj_masu_mashou, decodeKamiya7_25_vte_oku, decodeKamiya7_26_vte_shimau];
    for (const {sentence, expected} of tests) {
      const morphemes = await parse(sentence);
      const actuals = functions.map(f => f(morphemes)).filter(v => v.length > 0);
      console.log(actuals, expected)
      assert(actuals.every(actual => actual.every(act => expected.find(exp => exp.id === act.id))), `${sentence}`);
    }
  })();
}