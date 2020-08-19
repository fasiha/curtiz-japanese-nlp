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
import {ScoreHits} from './interfaces';

const v1ReqSentence = t.type({sentence: t.string});
const v1ReqSentences = t.type({sentences: t.array(t.string)});
interface v1ResSentence {
  furigana: Furigana[][];
  hits: ScoreHits[];
}
const tagsPromise = jmdictPromise.then(({db}) => db)
                        .then(db => getField(db, 'tags'))
                        .then(raw => JSON.parse(raw) as Record<string, string>);
const overrides: Map<string, Furigana[]> = new Map();

const app = express();
app.use(require('cors')({origin: true, credentials: true}));
app.use(require('body-parser').json());
app.post('/api/v1/sentence', async (req, res) => {
  const body = v1ReqSentence.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload');
    return;
  }
  const {sentence} = body.right;
  res.json(await handleSentence(sentence));
});

app.post('/api/v1/sentences', async (req, res) => {
  const body = v1ReqSentences.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload');
    return;
  }
  const {sentences} = body.right;
  const resBody: v1ResSentence[] = [];
  for (const sentence of sentences) { resBody.push(await handleSentence(sentence)); }
  res.json(resBody);
});

async function handleSentence(sentence: string): Promise<v1ResSentence> {
  if (!hasKanji(sentence) && !hasKana(sentence)) {
    const resBody: v1ResSentence = {furigana: [[sentence]], hits: []};
    return resBody;
  }

  const parsed = await mecabJdepp(sentence);
  const furigana = await morphemesToFurigana(sentence, parsed.morphemes, overrides);
  const tags = await tagsPromise;
  const dictHits = await enumerateDictionaryHits(parsed.morphemes, false, 10);
  for (let i = 0; i < dictHits.length; i++) {
    for (let j = 0; j < dictHits[i].results.length; j++) {
      const words = await scoreHitsToWords(dictHits[i].results[j].results);
      for (let k = 0; k < words.length; k++) {
        dictHits[i].results[j].results[k].summary = displayWordLight(words[k], tags);
      }
    }
  }
  const resBody: v1ResSentence = {furigana, hits: dictHits};
  return resBody;
}

const port = 8133;
app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}`));
