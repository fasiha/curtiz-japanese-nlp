import {dedupe, flatten} from 'curtiz-utils';

import {analyzeSentence, getTags, scoreHitsToWords} from './annotate';

if (module === require.main) {
  const raw = `やる事明確
少しでも良くするこの生活
勝ち抜くTry Out
Rap Game 頂く王冠`;
  const sentences = raw.trim().split('\n');
  (async function main() {
    const overrides = new Map();
    const analysis = await Promise.all(sentences.map(s => analyzeSentence(s, overrides)));
    const words = dedupe(
        flatten(await Promise.all(analysis.map(o => scoreHitsToWords(flatten(flatten(o.dictionaryHits)))))), o => o.id);
    const tags = getTags();
    console.log(JSON.stringify({analysis, words, tags}, null, 1));
  })();
}
