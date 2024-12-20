"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const tape_1 = __importDefault(require("tape"));
const annotate = __importStar(require("../annotate"));
const p = (x) => console.dir(x, { depth: null });
tape_1.default('chatta', async (t) => {
    // in this sentence, Jdepp makes ことちゃった a bunsetsu
    const sentence = 'それは昨日のことちゃった';
    const x = (await annotate.handleSentence(sentence))[0];
    if (typeof x === 'string' || !x.clozes) {
        throw new Error('assert');
    }
    const conj = x.clozes?.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    t.ok(deconj.length);
    t.ok(deconj.some(v => v.some(o => o.result.includes('ちゃった'))));
    t.end();
});
tape_1.default('denwa suru', async (t) => {
    // in this sentence, Jdepp makes 電話 し ます a bunsetsu
    const sentence = '彼に電話します';
    const res = (await annotate.handleSentence(sentence))[0];
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes?.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    t.ok(deconj.length > 0);
    t.ok(deconj.some(v => v.some(o => o.result.includes('します'))));
    t.end();
});
tape_1.default('...da', async (t) => {
    const sentence = '買ったんだ';
    const res = (await annotate.handleSentence(sentence))[0];
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    t.ok(deconj.some(v => v.some(o => o.result.includes('だ'))));
    t.end();
});
/*

ブラウンは急いで出かける --- で is NOT a particle
*/
tape_1.default('another suru verb', async (t) => {
    const sentence = 'お待ちしておりました';
    const res = (await annotate.handleSentence(sentence))[0];
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    // p(deconj)
    t.ok(deconj.some(v => v.some(o => o.result.includes('しておりました'))));
    t.end();
});
tape_1.default('adj+te', async (t) => {
    const sentence = 'ブラウンは急いで出かける';
    const res = (await annotate.handleSentence(sentence))[0];
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    // p(deconj)
    t.ok(deconj.some(v => v.some(o => o.result.includes('急いで'))));
    t.end();
});
tape_1.default('o+verb+suru needs suru', async (t) => {
    const sentence = 'その依頼お引き受けしましょう';
    const res = (await annotate.handleSentence(sentence))[0];
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    // p(deconj)
    t.ok(deconj.some(v => v.some(o => o.result.includes('しましょう'))));
    const hit = conj.find(o => o.deconj.some(d => d.result.includes('しましょう')));
    t.ok(hit);
    if (!hit) {
        throw new Error('assert');
    }
    const f = res.furigana?.slice(hit.startIdx, hit.endIdx);
    const fstring = f.flat().map(f => typeof f === 'string' ? f : f.ruby).join('');
    t.ok(fstring === 'しましょう');
    t.end();
});
