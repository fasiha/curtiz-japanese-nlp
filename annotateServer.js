#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const express_1 = __importDefault(require("express"));
const Either_1 = require("fp-ts/lib/Either");
const annotate_1 = require("./annotate");
const interfaces_1 = require("./interfaces");
const app = express_1.default();
app.use(require('cors')({ origin: true, credentials: true }));
app.use(require('body-parser').json());
app.post('/api/v1/sentence', async (req, res) => {
    const body = interfaces_1.v1ReqSentence.decode(req.body);
    if (!Either_1.isRight(body)) {
        res.status(400).json('bad payload' + JSON.stringify(body.left));
        return;
    }
    const { sentence, overrides = {}, nBest = 1 } = body.right;
    if (nBest < 1) {
        res.status(400).json('nBest should be positive');
        return;
    }
    try {
        res.json(await annotate_1.handleSentence(sentence, overrides, !!req.query.includeWord, !!req.query.includeClozes, nBest));
    }
    catch (e) {
        console.error('ERROR FOUND', e.stack);
        console.error(e);
        res.status(500).json(e);
    }
});
app.post('/api/v1/sentences', async (req, res) => {
    const body = interfaces_1.v1ReqSentences.decode(req.body);
    if (!Either_1.isRight(body)) {
        res.status(400).json('bad payload');
        return;
    }
    const { sentences, overrides } = body.right;
    const resBody = [];
    for (const sentence of sentences) {
        // don't handle MeCab nBest parsing here
        resBody.push((await annotate_1.handleSentence(sentence, overrides || {}, !!req.query.includeWord, !!req.query.includeClozes))[0]);
    }
    res.json(resBody);
});
app.get('/api/v1/jmdict/:wordId', async (req, res) => {
    const { wordId } = req.params;
    if (wordId) {
        try {
            res.json((await annotate_1.jmdictIdsToWords([{ wordId }]))[0]);
        }
        catch (e) {
            console.error('error:', e);
            res.status(404).json('id not found?');
        }
    }
    else {
        res.status(400).json('missing id');
    }
});
if (require.main === module) {
    const NATIVE = !process.env["NODE_MECAB"];
    const port = process.env['PORT'] || 8133;
    app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}, NATIVE mecab=${NATIVE}`));
}
