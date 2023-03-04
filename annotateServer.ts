require('dotenv').config();

import express from 'express';
import {isRight} from 'fp-ts/lib/Either';

import {jmdictIdsToWords, handleSentence} from './annotate';
import {v1ReqSentence, v1ReqSentences, v1ResSentence} from './interfaces';

const app = express();
app.use(require('cors')({origin: true, credentials: true}));
app.use(require('body-parser').json());
app.post('/api/v1/sentence', async (req, res) => {
  const body = v1ReqSentence.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload' + JSON.stringify(body.left));
    return;
  }
  const {sentence, overrides = {}, nBest = 1} = body.right;
  if (nBest < 1) {
    res.status(400).json('nBest should be positive');
    return;
  }
  res.json(await handleSentence(sentence, overrides, !!req.query.includeWord, !!req.query.includeClozes, nBest));
});

app.post('/api/v1/sentences', async (req, res) => {
  const body = v1ReqSentences.decode(req.body);
  if (!isRight(body)) {
    res.status(400).json('bad payload');
    return;
  }
  const {sentences, overrides} = body.right;
  const resBody: v1ResSentence[] = [];
  for (const sentence of sentences) {
    // don't handle MeCab nBest parsing here
    resBody.push(
        (await handleSentence(sentence, overrides || {}, !!req.query.includeWord, !!req.query.includeClozes))[0]);
  }
  res.json(resBody);
});

app.get('/api/v1/jmdict/:wordId', async (req, res) => {
  const {wordId} = req.params;
  if (wordId) {
    try {
      res.json((await jmdictIdsToWords([{wordId}]))[0]);
    } catch (e) {
      console.error('error:', e);
      res.status(404).json('id not found?');
    }
  } else {
    res.status(400).json('missing id');
  }
})

if (require.main === module) {
  const NATIVE = !process.env["NODE_MECAB"];
  const port = process.env['PORT'] || 8133;
  app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}, NATIVE mecab=${NATIVE}`));
}