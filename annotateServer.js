#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
app.post('/api/v1/sentence', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
    res.json(yield annotate_1.handleSentence(sentence, overrides, !!req.query.includeWord, !!req.query.includeClozes, nBest));
}));
app.post('/api/v1/sentences', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const body = interfaces_1.v1ReqSentences.decode(req.body);
    if (!Either_1.isRight(body)) {
        res.status(400).json('bad payload');
        return;
    }
    const { sentences, overrides } = body.right;
    const resBody = [];
    for (const sentence of sentences) {
        // don't handle MeCab nBest parsing here
        resBody.push((yield annotate_1.handleSentence(sentence, overrides || {}, !!req.query.includeWord, !!req.query.includeClozes))[0]);
    }
    res.json(resBody);
}));
app.get('/api/v1/jmdict/:wordId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { wordId } = req.params;
    if (wordId) {
        try {
            res.json((yield annotate_1.jmdictIdsToWords([{ wordId }]))[0]);
        }
        catch (e) {
            console.error('error:', e);
            res.status(404).json('id not found?');
        }
    }
    else {
        res.status(400).json('missing id');
    }
}));
if (require.main === module) {
    const NATIVE = !process.env["NODE_MECAB"];
    const port = process.env['PORT'] || 8133;
    app.listen(port, () => console.log(`Annotation app listening at http://127.0.0.1:${port}, NATIVE mecab=${NATIVE}`));
}
