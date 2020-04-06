import {dedupe, flatten} from 'curtiz-utils';

import {analyzeSentence, displayWordDetailed, getTags, scoreHitsToWords} from './annotate';
import {Furigana} from './interfaces';

if (module === require.main) {
  function collapse(v: Furigana[]): Furigana[] {
    var ret: Furigana[] = [];
    for (const elt of v) {
      const last = ret.length - 1;
      if (typeof elt === 'string' && typeof ret[last] === 'string') {
        ret[last] = ret[last] + elt;
      } else {
        ret.push(elt);
      }
    }
    return ret;
  }
  function mapToObj<U>(map: Map<string, U>): ({[key: string]: U}) {
    const ret: {[key: string]: U} = {};
    for (const [k, v] of map.entries()) { ret[k] = v; }
    return ret;
  }

  const raw = `やる
やる事明確
少しでも良くするこの生活
勝ち抜くTry Out
Rap Game 頂く王冠`;
  const sentences = raw.trim().split('\n');
  (async function main() {
    const overrides = new Map();
    const analysis = await Promise.all(sentences.map(s => analyzeSentence(s, overrides)));
    const tags = await getTags();
    if (false) {
      const words =
          dedupe(flatten(await Promise.all(analysis.map(o => scoreHitsToWords(flatten(flatten(o.dictionaryHits)))))),
                 o => o.id);
      console.log(JSON.stringify({analysis, words, tags}, null, 1));
    }
    for (const [idx, sent] of analysis.entries()) {
      console.log(JSON.stringify({furigana: sent.furigana ? collapse(flatten(sent.furigana)) : sentences[idx]}));
      console.log(JSON.stringify(mapToObj(sent.particlesConjphrases.particles)));
      console.log(JSON.stringify(mapToObj(sent.particlesConjphrases.conjugatedPhrases)));
      for (const starts of sent.dictionaryHits) {
        for (const ends of starts) {
          const hits = ends.slice(0, 5);
          const words = await scoreHitsToWords(hits);
          console.log(
              hits.map((o, i) => JSON.stringify(o) + `, // ${displayWordDetailed(words[i], tags)}`).join('\n  '))
        }
      }
      console.log('===')
    }
  })();
}
