import {dedupe, flatten} from 'curtiz-utils';

import {analyzeSentence, scoreHitsToWords} from './annotate';

(
    async function main() {
      const sentences = `やる事明確
少しでも良くするこの生活
勝ち抜くTry Out
Rap Game 頂く王冠`.trim().split('\n');
      const overrides = new Map();
      const analysis = await Promise.all(sentences.map(s => analyzeSentence(s, overrides)));
      const words =
          dedupe(flatten(await Promise.all(analysis.map(o => scoreHitsToWords(flatten(flatten(o.dictionaryHits)))))),
                 o => o.id);

      console.log(JSON.stringify({analysis, words}, null, 1));
    })();