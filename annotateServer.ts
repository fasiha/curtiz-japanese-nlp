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
  const {sentence, overrides} = body.right;
  // const overrides = body.right
  res.json(await handleSentence(sentence, overrides || {}, !!req.query.includeWord, !!req.query.includeClozes));
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
    resBody.push(await handleSentence(sentence, overrides || {}, !!req.query.includeWord, !!req.query.includeClozes));
  }
  res.json(resBody);
});

app.get('/jmdict/:wordId', async (req, res) => {
  const {wordId} = req.params;
  if (wordId) {
    res.json((await jmdictIdsToWords([{wordId}]))[0]);
  } else {
    res.status(400).json('missing id');
  }
})

if (require.main === module) {
  const NATIVE = !process.env["NODE_MECAB"];
  const port = process.env['PORT'] || 8133;
  app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}, NATIVE mecab=${NATIVE}`));
}