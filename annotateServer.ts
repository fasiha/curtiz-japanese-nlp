require('dotenv').config();

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
import {invokeMecab, maybeMorphemesToMorphemes, parseMecab} from './mecabUnidic';

const TFurigana = t.array(t.union([t.string, t.type({ruby: t.string, rt: t.string})]));
const PartialOverrides = t.partial({overrides: t.record(t.string, TFurigana)});
const v1ReqSentence = t.intersection([t.type({sentence: t.string}), PartialOverrides]);
const v1ReqSentences = t.intersection([t.type({sentences: t.array(t.string)}), PartialOverrides]);
type v1ResSentence = string|v1ResSentenceAnalyzed;
interface v1ResSentenceAnalyzed {
  furigana: Furigana[][];
  hits: ScoreHits[];
}
const tagsPromise = jmdictPromise.then(({db}) => db)
                        .then(db => getField(db, 'tags'))
                        .then(raw => JSON.parse(raw) as Record<string, string>);

const app = express();
app.use(require('cors')({origin: true, credentials: true}));
app.use(require('body-parser').json());
app.post('/api/v1/sentence', async (req, res) => {
  const body = v1ReqSentence.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload');
    return;
  }
  const {sentence, overrides} = body.right;
  // const overrides = body.right
  res.json(await handleSentence(sentence, overrides || {}));
});

app.post('/api/v1/sentences', async (req, res) => {
  const body = v1ReqSentences.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload');
    return;
  }
  const {sentences, overrides} = body.right;
  const resBody: v1ResSentence[] = [];
  for (const sentence of sentences) { resBody.push(await handleSentence(sentence, overrides || {})); }
  res.json(resBody);
});

async function handleSentence(sentence: string, overrides: Record<string, Furigana[]>): Promise<v1ResSentence> {
  if (!hasKanji(sentence) && !hasKana(sentence)) {
    const resBody: v1ResSentence = sentence;
    return resBody;
  }

  let morphemes = maybeMorphemesToMorphemes(parseMecab(sentence, await invokeMecab(sentence))[0].filter(o => !!o));
  const furigana = await morphemesToFurigana(sentence, morphemes, overrides);
  const tags = await tagsPromise;
  const dictHits = await enumerateDictionaryHits(morphemes, false, 10);
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

const NATIVE = !process.env["NODE_MECAB"];
const port = process.env['PORT'] || 8133;
app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}, NATIVE mecab=${NATIVE}`));
