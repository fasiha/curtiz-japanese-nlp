import {hasKana, hasKanji} from 'curtiz-utils';
import express from 'express';
import {isRight} from 'fp-ts/lib/Either';
import * as t from 'io-ts';

import {
  displayWordLight,
  enumerateDictionaryHits,
  Furigana,
  getField,
  jmdictPromise,
  mecabJdepp,
  morphemesToFurigana,
  scoreHitsToWords
} from './annotate';
import {ScoreHit} from './interfaces';

const v1ReqDict = t.type({sentence: t.string});
interface v1ResDict {
  furigana: Furigana[][];
  hits: (ScoreHit&{summary?: string})[][][];
}
const tagsPromise = jmdictPromise.then(({db}) => db)
                        .then(db => getField(db, 'tags'))
                        .then(raw => JSON.parse(raw) as Record<string, string>);
const overrides: Map<string, Furigana[]> = new Map();

const app = express();
app.use(require('cors')({origin: true, credentials: true}));
app.use(require('body-parser').json());
app.post('/api/v1/dict', async (req, res) => {
  const body = v1ReqDict.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload');
    return;
  }
  const {sentence} = body.right;

  if (!hasKanji(sentence) && !hasKana(sentence)) {
    const resBody: v1ResDict = {furigana: [[sentence]], hits: []};
    res.json(resBody);
    return
  }

  const parsed = await mecabJdepp(sentence);
  const furigana = await morphemesToFurigana(sentence, parsed.morphemes, overrides);
  const dictHits = await enumerateDictionaryHits(parsed.morphemes, false);
  const tags = await tagsPromise;
  for (let i = 0; i < dictHits.length; i++) {
    for (let j = 0; j < dictHits[i].length; j++) {
      const hits = dictHits[i][j].slice(0, 10);
      const words = await scoreHitsToWords(hits);
      dictHits[i][j] = hits.map((h, hi) => ({...h, summary: displayWordLight(words[hi], tags)}));
    }
  }
  const resBody: v1ResDict = {furigana, hits: dictHits};
  res.json(resBody);
});

const port = 8133;
app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}`));
