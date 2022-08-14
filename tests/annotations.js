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
tape_1.default('chatta', (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    // in this sentence, Jdepp makes ことちゃった a bunsetsu
    const sentence = 'それは昨日のことちゃった';
    const x = yield annotate.handleSentence(sentence);
    if (typeof x === 'string' || !x.clozes) {
        throw new Error('assert');
    }
    const conj = (_a = x.clozes) === null || _a === void 0 ? void 0 : _a.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    t.ok(deconj.length);
    t.ok(deconj.some(v => v.some(o => o.result.includes('ちゃった'))));
    t.end();
}));
tape_1.default('denwa suru', (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    // in this sentence, Jdepp makes 電話 し ます a bunsetsu
    const sentence = '彼に電話します';
    const res = yield annotate.handleSentence(sentence);
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = (_b = res.clozes) === null || _b === void 0 ? void 0 : _b.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    t.ok(deconj.length > 0);
    t.ok(deconj.some(v => v.some(o => o.result.includes('します'))));
    t.end();
}));
tape_1.default('...da', (t) => __awaiter(void 0, void 0, void 0, function* () {
    const sentence = '買ったんだ';
    const res = yield annotate.handleSentence(sentence);
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    t.ok(deconj.some(v => v.some(o => o.result.includes('だ'))));
    t.end();
}));
/*

ブラウンは急いで出かける --- で is NOT a particle
*/
tape_1.default('another suru verb', (t) => __awaiter(void 0, void 0, void 0, function* () {
    const sentence = 'お待ちしておりました';
    const res = yield annotate.handleSentence(sentence);
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    // p(deconj)
    t.ok(deconj.some(v => v.some(o => o.result.includes('しておりました'))));
    t.end();
}));
tape_1.default('adj+te', (t) => __awaiter(void 0, void 0, void 0, function* () {
    const sentence = 'ブラウンは急いで出かける';
    const res = yield annotate.handleSentence(sentence);
    if (typeof res === 'string' || !res.clozes) {
        throw new Error('assert');
    }
    const conj = res.clozes.conjugatedPhrases;
    const deconj = conj.map(o => o.deconj);
    // p(deconj)
    t.ok(deconj.some(v => v.some(o => o.result.includes('急いで'))));
    t.end();
}));
tape_1.default('o+verb+suru needs suru', (t) => __awaiter(void 0, void 0, void 0, function* () {
    var _c;
    const sentence = 'その依頼お引き受けしましょう';
    const res = yield annotate.handleSentence(sentence);
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
    const f = (_c = res.furigana) === null || _c === void 0 ? void 0 : _c.slice(hit.startIdx, hit.endIdx);
    const fstring = f.flat().map(f => typeof f === 'string' ? f : f.ruby).join('');
    t.ok(fstring === 'しましょう');
    t.end();
}));
