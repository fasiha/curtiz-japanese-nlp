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
const crypto_1 = require("crypto");
const curtiz_utils_1 = require("curtiz-utils");
const fs_1 = require("fs");
const jmdict_furigana_node_1 = require("jmdict-furigana-node");
const jmdict_simplified_node_1 = require("jmdict-simplified-node");
const mkdirp_1 = __importDefault(require("mkdirp"));
const jdepp_1 = require("./jdepp");
const mecabUnidic_1 = require("./mecabUnidic");
var jmdict_furigana_node_2 = require("jmdict-furigana-node");
exports.furiganaToString = jmdict_furigana_node_2.furiganaToString;
exports.setupJmdictFurigana = jmdict_furigana_node_2.setup;
var jmdict_simplified_node_2 = require("jmdict-simplified-node");
exports.getField = jmdict_simplified_node_2.getField;
exports.jmdictFuriganaPromise = jmdict_furigana_node_1.setup();
exports.jmdictPromise = jmdict_simplified_node_1.setup('jmdict-simplified', process.env['JMDICT_SIMPLIFIED_JSON'] || 'jmdict-eng-3.1.0.json', true, true);
function mecabJdepp(sentence) {
    return __awaiter(this, void 0, void 0, function* () {
        let rawMecab = yield mecabUnidic_1.invokeMecab(sentence);
        let morphemes = mecabUnidic_1.maybeMorphemesToMorphemes(mecabUnidic_1.parseMecab(sentence, rawMecab)[0].filter(o => !!o));
        let bunsetsus = yield jdepp_1.addJdepp(rawMecab, morphemes);
        return { morphemes, bunsetsus };
    });
}
exports.mecabJdepp = mecabJdepp;
const p = (x) => console.dir(x, { depth: null });
/**
 * Given MeCab morphemes, return a triply-nested array of JMDict hits.
 *
 * The outer-most layer enumerates the *starting* morpheme, the middle layer the ending morpheme, and the final
 * inner-most layer the list of dictionary hits for the sequence of morphemes between the start and end.
 *
 * Roughly, in code (except we might not find anything for all start-to-end sequences):
 * ```js
 * for (let startIdx = 0; startIdx < morphemes.length; startIdx++) {
 *  for (let endIdx = morphemes.length; endIdx > startIdx; endIdx--) {
 *    result.push(JMDict.search(morpehemes.slice(startIdx, endIdx)));
 *  }
 * }
 * ```
 */
function enumerateDictionaryHits(plainMorphemes, full = true, limit = -1) {
    return __awaiter(this, void 0, void 0, function* () {
        const { db } = yield exports.jmdictPromise;
        const simplify = (c) => (c.left || c.right) ? c : c.cloze;
        const jmdictFurigana = yield exports.jmdictFuriganaPromise;
        const morphemes = plainMorphemes.map(m => (Object.assign(Object.assign({}, m), { 
            // if "symbol" POS, don't needlessly double the number of things to search for later in forkingPaths
            searchKanji: unique(m.partOfSpeech[0].startsWith('symbol') ? [m.literal] : [m.literal, m.lemma]), searchReading: unique(morphemeToSearchLemma(m).concat(morphemeToStringLiteral(m, jmdictFurigana))) })));
        const superhits = [];
        for (let startIdx = 0; startIdx < morphemes.length; startIdx++) {
            const results = [];
            if (!full) {
                const pos = morphemes[startIdx].partOfSpeech;
                if (pos[0].startsWith('supplementary') || pos[0].startsWith('auxiliary')) {
                    // skip these
                    superhits.push({ startIdx, results });
                    continue;
                }
            }
            for (let endIdx = Math.min(morphemes.length, startIdx + 5); endIdx > startIdx; --endIdx) {
                const run = morphemes.slice(startIdx, endIdx);
                const runLiteralCore = bunsetsuToString(run);
                const runLiteral = simplify(generateContextClozed(bunsetsuToString(morphemes.slice(0, startIdx)), runLiteralCore, bunsetsuToString(morphemes.slice(endIdx))));
                if (!full) {
                    // skip particles like は and も if they're by themselves as an optimization
                    if (runLiteralCore.length === 1 && curtiz_utils_1.hasKana(runLiteralCore[0]) && runLiteralCore === run[0].lemma) {
                        continue;
                    }
                }
                let scored = [];
                function helperSearchesHitsToScored(searches, subhits, searchKey) {
                    return curtiz_utils_1.flatten(subhits.map((v, i) => v.map(w => {
                        // help catch issues with automatic type widening and excess property checks
                        const ret = {
                            wordId: w.id,
                            score: scoreMorphemeWord(run, searches[i], searchKey, w),
                            search: searches[i],
                        };
                        return ret;
                    })));
                }
                // Search reading
                {
                    const readingSearches = forkingPaths(run.map(m => m.searchReading)).map(v => v.join(''));
                    const readingSubhits = yield Promise.all(readingSearches.map(search => jmdict_simplified_node_1.readingBeginning(db, search)));
                    scored = helperSearchesHitsToScored(readingSearches, readingSubhits, 'kana');
                }
                // Search literals if needed, this works around MeCab mis-readings like お父さん->おちちさん
                {
                    const kanjiSearches = forkingPaths(run.map(m => m.searchKanji)).map(v => v.join('')).filter(curtiz_utils_1.hasKanji);
                    const kanjiSubhits = yield Promise.all(kanjiSearches.map(search => jmdict_simplified_node_1.kanjiBeginning(db, search)));
                    scored.push(...helperSearchesHitsToScored(kanjiSearches, kanjiSubhits, 'kanji'));
                }
                scored.sort((a, b) => b.score - a.score);
                if (scored.length > 0) {
                    results.push({ endIdx, run: runLiteral, results: curtiz_utils_1.dedupeLimit(scored, o => o.wordId, limit) });
                }
            }
            superhits.push({ startIdx, results });
        }
        return superhits;
    });
}
exports.enumerateDictionaryHits = enumerateDictionaryHits;
function scoreMorphemeWord(run, searched, searchKey, word) {
    const len = searched.length;
    // if the shortest kana is shorter than the search, let the cost be 0. If shortest kana is longer than search, let the
    // overrun cost be negative. Shortest because we're being optimistic
    const overrunPenalty = Math.min(0, len - Math.min(...word[searchKey].filter(k => k.text.includes(searched)).map(k => k.text.length)));
    // literal may contain kanji that lemma doesn't, e.g., 大阪's literal in UniDic is katakana
    const wordKanjis = new Set(curtiz_utils_1.flatten(word.kanji.map(k => k.text.split('').filter(curtiz_utils_1.hasKanji))));
    const lemmaKanjis = new Set(curtiz_utils_1.flatten(run.map(m => m.lemma.split('').filter(curtiz_utils_1.hasKanji))));
    const literalKanjis = new Set(curtiz_utils_1.flatten(run.map(m => m.literal.split('').filter(curtiz_utils_1.hasKanji))));
    const lemmaKanjiBonus = intersectionSize(lemmaKanjis, wordKanjis);
    const literalKanjiBonus = intersectionSize(literalKanjis, wordKanjis);
    // make sure one-morpheme particles rise to the top of the pile of 10k hits...
    const particleBonus = +(run.length === 1 && run[0].partOfSpeech.some(pos => pos.includes('particle')) &&
        word.sense.some(sense => sense.partOfSpeech.includes('prt')));
    return overrunPenalty * 10 + literalKanjiBonus * 2 + lemmaKanjiBonus * 1 + 5 * particleBonus;
}
function intersection(small, big) {
    if (small.size > big.size * 1.1) {
        return intersection(big, small);
    }
    const ret = new Set();
    for (const x of small) {
        if (big.has(x)) {
            ret.add(x);
        }
    }
    return ret;
}
function intersectionSize(small, big) {
    if (small.size > big.size * 1.1) {
        return intersectionSize(big, small);
    }
    let ret = 0;
    for (const x of small) {
        ret += +big.has(x);
    }
    return ret;
}
function unique(v) { return [...new Set(v)]; }
const circledNumbers = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿".split('');
const prefixNumber = (n) => circledNumbers[n] || `(${n + 1})`;
function displayWord(w) {
    return w.kanji.map(k => k.text).join('・') + '「' + w.kana.map(k => k.text).join('・') + '」：' +
        w.sense.map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/')).join('; ');
}
exports.displayWord = displayWord;
function printXrefs(v) { return v.map(x => x.join(',')).join(';'); }
function displayWordLight(w, tags) {
    const kanji = w.kanji.map(k => k.text).join('・');
    const kana = w.kana.map(k => k.text).join('・');
    const tagFields = { dialect: '🗣', field: '🀄️', misc: '✋' };
    const s = w.sense
        .map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/') +
        (sense.related.length ? ` (👉 ${printXrefs(sense.related)})` : '') +
        (sense.antonym.length ? ` (👈 ${printXrefs(sense.antonym)})` : '') +
        Object.entries(tagFields)
            .map(([k, v]) => sense[k].length
            ? ` (${v} ${sense[k].map(k => tags[k]).join('; ')})`
            : '')
            .join(''))
        .join(' ');
    // console.error(related)
    return `${kanji}「${kana}」| ${s}`;
}
exports.displayWordLight = displayWordLight;
function displayWordDetailed(w, tags) {
    return w.kanji.concat(w.kana).map(k => k.text).join('・') + '：' +
        w.sense
            .map((sense, n) => prefixNumber(n) + ' ' + sense.gloss.map(gloss => gloss.text).join('/') + ' {*' +
            sense.partOfSpeech.map(pos => tags[pos]).join('; ') + '*}')
            .join('; ') +
        ' #' + w.id;
}
exports.displayWordDetailed = displayWordDetailed;
/**
 * Cartesian product.
 *
 * Treats each sub-array in an array of arrays as a list of choices for that slot, and enumerates all paths.
 *
 * So [['hi', 'ola'], ['Sal']] => [['hi', 'Sal'], ['ola', 'Sal']]
 *
 */
function forkingPaths(v) {
    let ret = [[]];
    for (const u of v) {
        ret = curtiz_utils_1.flatten(u.map(x => ret.map(v => v.concat(x))));
    }
    return ret;
}
/**
 * Ensure needle is found in haystack only once
 * @param haystack big string
 * @param needle little string
 */
function appearsExactlyOnce(haystack, needle) {
    const hit = haystack.indexOf(needle);
    return hit >= 0 && haystack.indexOf(needle, hit + 1) < 0;
}
/**
 * Given three consecutive substrings (the arguments), return `{left: left2, cloze, right: right2}` where
 * `left2` and `right2` are as short as possible and `${left2}${cloze}${right2}` is unique in the full string.
 * @param left left string, possibly empty
 * @param cloze middle string
 * @param right right string, possible empty
 * @throws in the unlikely event that such a return string cannot be build (I cannot think of an example though)
 */
function generateContextClozed(left, cloze, right) {
    const sentence = left + cloze + right;
    let leftContext = '';
    let rightContext = '';
    let contextLength = 0;
    while (!appearsExactlyOnce(sentence, leftContext + cloze + rightContext)) {
        contextLength++;
        if (contextLength > left.length && contextLength > right.length) {
            console.error({ sentence, left, cloze, right, leftContext, rightContext, contextLength });
            throw new Error('Ran out of context to build unique cloze');
        }
        leftContext = left.slice(-contextLength);
        rightContext = right.slice(0, contextLength);
    }
    return { left: leftContext, cloze, right: rightContext };
}
const bunsetsuToString = (morphemes) => morphemes.map(m => m.literal).join('');
function identifyFillInBlanks(bunsetsus) {
    return __awaiter(this, void 0, void 0, function* () {
        // Find clozes: particles and conjugated verb/adjective phrases
        const conjugatedPhrases = new Map();
        const particles = new Map();
        for (const [bidx, bunsetsu] of bunsetsus.entries()) {
            const first = bunsetsu[0];
            if (!first) {
                continue;
            }
            const pos0 = first.partOfSpeech[0];
            const posLast = first.partOfSpeech[first.partOfSpeech.length - 1];
            if (bunsetsu.length > 1 &&
                (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject') || posLast === 'verbal_suru')) {
                const ignoreRight = curtiz_utils_1.filterRight(bunsetsu, m => !mecabUnidic_1.goodMorphemePredicate(m));
                const goodBunsetsu = ignoreRight.length === 0 ? bunsetsu : bunsetsu.slice(0, -ignoreRight.length);
                if (goodBunsetsu.length > 1) {
                    const cloze = bunsetsuToString(goodBunsetsu);
                    const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
                    const right = bunsetsuToString(ignoreRight) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
                    if (!conjugatedPhrases.has(cloze)) {
                        const jf = yield exports.jmdictFuriganaPromise;
                        conjugatedPhrases.set(cloze, {
                            cloze: generateContextClozed(left, cloze, right),
                            lemmas: goodBunsetsu.map(o => {
                                const entries = jf.textToEntry.get(o.lemma) || [];
                                const lemmaReading = curtiz_utils_1.kata2hira(o.lemmaReading);
                                const entry = entries.find(e => e.reading === lemmaReading);
                                return entry ? entry.furigana
                                    : o.lemma === lemmaReading ? [lemmaReading] : [{ ruby: o.lemma, rt: lemmaReading }];
                            })
                        });
                    }
                }
            }
            const particlePredicate = (p) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1 &&
                !p.partOfSpeech[1].startsWith('phrase_final');
            for (const [pidx, particle] of bunsetsu.entries()) {
                if (particlePredicate(particle)) {
                    const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(bunsetsu.slice(0, pidx));
                    const right = bunsetsuToString(bunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
                    const cloze = generateContextClozed(left, particle.literal, right);
                    particles.set(cloze.left + cloze.cloze + cloze.right, cloze);
                }
            }
        }
        return { particles, conjugatedPhrases };
    });
}
function morphemeToSearchLemma(m) {
    var _a, _b;
    const pos0 = m.partOfSpeech[0];
    const conjugatable = ((_a = m.inflection) === null || _a === void 0 ? void 0 : _a[0]) || ((_b = m.inflectionType) === null || _b === void 0 ? void 0 : _b[0]) || pos0.startsWith('verb') ||
        pos0.endsWith('_verb') || pos0.startsWith('adject');
    const potentialRendaku = m.literal === m.lemma && curtiz_utils_1.hasKanji(m.lemma) && m.lemmaReading !== m.pronunciation;
    return (conjugatable || potentialRendaku) ? [curtiz_utils_1.kata2hira(m.lemmaReading)] : [];
    // literal's pronunciation will handle the rest
}
const CHOUONPU = 'ー'; // https://en.wikipedia.org/wiki/Ch%C5%8Donpu
/**
 * Returns array of strings in hiragana, without chouonpu, representing possible pronunciations
 * Tries hard to make sure the returned array has length 1.
 */
function morphemeToStringLiteral(m, jmdictFurigana) {
    if (!curtiz_utils_1.hasKanji(m.literal)) {
        return [m.literal];
    }
    // so literal has kanji
    if (!m.pronunciation.includes(CHOUONPU)) {
        return [curtiz_utils_1.kata2hira(m.pronunciation)];
    }
    // so literal has kanji and the pronunciation has a chouonpu
    if (m.literal === m.lemma) {
        return [curtiz_utils_1.kata2hira(m.lemmaReading)];
    }
    // so literal has kanji, the pronunciation has chouonpu, and the literal and lemma disagree
    // 多             | オー           | オオイ         | 多い
    // 大阪               | オーサカ           | オオサカ           | オオサカ
    // 京都               | キョート           | キョウト           | キョウト
    // 東京               | トーキョー         | トウキョウ         | トウキョウ
    // 見よう             | ミヨー             | ミル               | 見る
    // cant just replace chouonpu with equivlent in lemma! :
    // 聞い | キー | キク | 聞く
    function replaceChouonpuWithString(pronunciation, literal) {
        return pronunciation.split('').map((p, i) => (p === CHOUONPU && curtiz_utils_1.hasHiragana(literal[i])) ? literal[i] : p).join('');
    }
    if (curtiz_utils_1.hasHiragana(m.literal)) {
        // try to see if the chouonpu in pronunication is a hiragana in literal:
        if (m.literal.length === m.pronunciation.length) {
            // same length: all kanji are one-character, so we can safely split both literal and pronunciation
            // 飛び立とう | トビタトウ | トビタトー | トビタツ | 飛び立つ
            const reconstructedPronunciation = replaceChouonpuWithString(m.pronunciation, m.literal);
            if (!reconstructedPronunciation.includes(CHOUONPU)) {
                return [curtiz_utils_1.kata2hira(reconstructedPronunciation)];
            }
        }
        // 話し合おう | ハナシアオウ | ハナシアオー | ハナシアウ | 話し合う
        if (jmdictFurigana) {
            const entries = jmdictFurigana.textToEntry.get(m.lemma);
            if (entries) {
                const lemmaReading = curtiz_utils_1.kata2hira(m.lemmaReading);
                const entry = entries.find(e => e.reading === lemmaReading);
                if (entry) {
                    const furiganaMap = new Map(entry.furigana.map(f => typeof f === 'string' ? ['', ''] : [f.ruby, f.rt]));
                    const reconstructedLiteral = m.literal.split('').map(c => furiganaMap.get(c) || c).join('');
                    if (m.pronunciation.length === reconstructedLiteral.length) {
                        const reconstructedPronunciation = replaceChouonpuWithString(m.pronunciation, reconstructedLiteral);
                        if (!reconstructedPronunciation.includes(CHOUONPU)) {
                            return [curtiz_utils_1.kata2hira(reconstructedPronunciation)];
                        }
                    }
                }
            }
        }
    }
    // No choice, オー and トー need to be mapped to both options.
    // Other chouonpu mapped via `DUMB_CHOUONPU_MAP`.
    const pronunciation = m.pronunciation.split('');
    let ret = [[]];
    for (const [i, p] of pronunciation.entries()) {
        if (p === CHOUONPU) {
            if (pronunciation[i - 1] === 'ト' || pronunciation[i - 1] === 'オ') {
                ret = [...ret.map(v => v.concat('オ')), ...ret.map(v => v.concat('ウ'))];
            }
            else {
                ret.forEach(v => v.push(DUMB_CHOUONPU_MAP.get(curtiz_utils_1.kata2hira(pronunciation[i - 1])) || CHOUONPU));
            }
            continue;
        }
        ret.forEach(v => v.push(p));
    }
    return ret.map(v => curtiz_utils_1.kata2hira(v.join('')));
}
const DUMB_CHOUONPU_MAP = (function makeChouonpuMap() {
    const as = `ぁあかがさざただなはばぱまゃやらゎわ`;
    const is = `ぃいきぎしじちぢにひびぴみり`;
    const us = `ぅうくぐすずっつづぬふぶぷむゅゆるゔ`;
    const es = `ぇえけげせぜてでねへべぺめれ`;
    const os = `ぉおこごそぞとどのほぼぽもょよろを`;
    const m = new Map();
    const doer = (as, target) => as.split('').forEach(a => m.set(a, target));
    doer(as, 'あ');
    doer(is, 'い');
    doer(us, 'う');
    doer(es, 'い');
    doer(os, 'う');
    return m;
})();
function morphemesToFurigana(line, morphemes, overrides) {
    return __awaiter(this, void 0, void 0, function* () {
        return morphemesToFuriganaCore(morphemes, overrides).then(o => checkFurigana(line, o));
    });
}
exports.morphemesToFurigana = morphemesToFurigana;
/**
 * Try very hard to convert morphemes to furigana. `overrides` is a map of morpheme literal to the furigana you want.
 * This is useful because, e.g., Unidic always converts 日本 to ニッポン, and maybe you want overrides such that:
 * `overrides = new Map([['日本', [{ruby: '日', rt: 'に'}, {ruby: '本', rt: 'ほん'}]]])`
 * Note that `overrides` operates on a morpheme-by-morpheme basis.
 */
function morphemesToFuriganaCore(morphemes, overrides) {
    return __awaiter(this, void 0, void 0, function* () {
        const furigana = yield Promise.all(morphemes.map((m) => __awaiter(this, void 0, void 0, function* () {
            const { lemma, lemmaReading, literal, pronunciation } = m;
            if (!curtiz_utils_1.hasKanji(literal)) {
                return [literal];
            }
            {
                const hit = overrides[literal];
                if (hit) {
                    return hit;
                }
            }
            const jmdictFurigana = yield exports.jmdictFuriganaPromise;
            const { textToEntry, readingToEntry } = jmdictFurigana;
            const literalHit = search(textToEntry, literal, 'reading', morphemeToStringLiteral(m, jmdictFurigana));
            if (literalHit) {
                return literalHit.furigana;
            }
            const pronunciationHit = search(readingToEntry, pronunciation, 'text', [literal]);
            if (pronunciationHit) {
                return pronunciationHit.furigana;
            }
            // help with 一本/rendaku
            if (literal.length === 1) {
                return [{ ruby: literal, rt: morphemeToStringLiteral(m).join('・') }];
            }
            // for e.g. 住ん|で|い|ます but not 一本 (pronounced pon but lemma=hon: rendaku)
            // if you reach here, there's nothing ensuring that the furigana found will match `pronunciation`!
            const lemmaHit = search(textToEntry, lemma, 'reading', morphemeToStringLiteral({ lemma, lemmaReading, literal: lemma, pronunciation: lemmaReading }, jmdictFurigana));
            if (lemmaHit) {
                const furiganaDict = new Map();
                for (const f of lemmaHit.furigana) {
                    if (typeof f === 'string') {
                        continue;
                    }
                    furiganaDict.set(f.ruby, f.rt);
                }
                const chars = literal.split('');
                let kanji = chars.filter(curtiz_utils_1.hasKanji);
                const annotatedChars = chars.slice();
                // start from all kanji characters in a string, see if that's in furiganaDict, if not, chop last
                while (kanji.length) {
                    const hit = triu(kanji).find(ks => furiganaDict.has(ks.join('')));
                    if (hit) {
                        const hitstr = hit.join('');
                        const idx = literal.indexOf(hitstr);
                        annotatedChars[idx] = { ruby: hitstr, rt: furiganaDict.get(hitstr) || hitstr };
                        for (let i = idx + 1; i < idx + hitstr.length; i++) {
                            annotatedChars[i] = '';
                        }
                        kanji = kanji.slice(hitstr.length);
                        continue;
                    }
                    // no hit found, kanji won't shrink to empty, break now
                    break;
                }
                if (kanji.length === 0) {
                    return annotatedChars;
                }
            }
            // const lemmaReadingHit = search(readingToEntry, lemmaReading, 'text', lemma);
            // if (lemmaReadingHit) { return lemmaReadingHit.furigana; }
            // We couldn't rely on JMDictFurigana to help us out. The best we can do now is to use MeCab's parsing.
            // For example: literal="帰っ" and rt="かえっ".
            {
                const rt = morphemeToStringLiteral(m)[0];
                if (rt === literal) {
                    return [literal];
                }
                // find matching text at the start and end of `literal` and `rt`, and pull them off as strings.
                const prePost = prePostMatches(literal, rt);
                const ret = [prePost.pre, { ruby: prePost.middleA, rt: prePost.middleB }, prePost.post].filter(s => !!s);
                return ret;
            }
        })));
        return furigana;
    });
}
exports.morphemesToFuriganaCore = morphemesToFuriganaCore;
function prePostMatches(a, b) {
    let pre = '';
    let post = '';
    if (a === b) {
        return { pre, middleA: a, middleB: b, post };
    }
    for (let i = 0; i < a.length; i++) {
        const c = a[i];
        if (c !== b[i]) {
            break;
        }
        pre += c;
    }
    for (let i = 0; i < a.length; i++) {
        const c = a[a.length - 1 - i];
        const c2 = b[b.length - 1 - i];
        if (c !== c2) {
            break;
        }
        post = c + post;
    }
    const middleA = a.slice(pre.length, a.length - post.length);
    const middleB = b.slice(pre.length, b.length - post.length);
    return { pre, middleA, middleB, post };
}
function triu(arr) {
    const ret = [];
    for (let i = arr.length; i > 0; --i) {
        ret.push(arr.slice(0, i));
    }
    return ret;
}
function search(map, first, sub, possibleSeconds) {
    const hit = map.get(first);
    if (hit) {
        // const possibleSeconds = findAlternativeChouonpu(kata2hira(second));
        const subhit = hit.find(e => {
            const dict = curtiz_utils_1.kata2hira(e[sub]);
            return possibleSeconds.some(second => second === dict);
        });
        if (subhit) {
            return subhit;
        }
        console.error(`found hit for ${first} but not ${possibleSeconds}`, { hit, possibleSeconds });
    }
}
function furiganaToRuby(fs) {
    const rubiesToHtml = (v) => v.length ? `<ruby>${v.map(o => o.ruby).join('')}<rt>${v.map(o => o.rt).join('')}</rt></ruby>` : '';
    // collapse adjacent <ruby> tags into one so macOS selection on resulting HTML works: undo JMDict-Furigana <sad>
    const ret = fs.reduce(({ stringSoFar, rubiesSoFar }, curr) => typeof curr === 'object'
        ? { stringSoFar, rubiesSoFar: rubiesSoFar.concat(curr) }
        : { stringSoFar: stringSoFar + rubiesToHtml(rubiesSoFar) + curr, rubiesSoFar: [] }, { stringSoFar: '', rubiesSoFar: [] });
    return ret.stringSoFar + rubiesToHtml(ret.rubiesSoFar);
}
// make sure furigana's rubys are verbatim the sentence
function checkFurigana(sentence, furigana) {
    const rubys = curtiz_utils_1.flatten(furigana).map(toruby);
    if (rubys.join('').length >= sentence.length) {
        return furigana;
    }
    // whitespace or some other character was stripped. add it back!
    let start = 0;
    let ret = [];
    for (const fs of furigana) {
        const chunk = fs.map(toruby).join('');
        const hit = sentence.indexOf(chunk, start);
        if (hit < 0) {
            throw new Error('cannot find: ' + chunk);
        }
        ret.push(hit > start ? [sentence.slice(start, hit), ...fs] : fs);
        // prepending the holes like this will keep the same number of morphemes in `furigana`
        start = hit + chunk.length;
    }
    return ret;
}
function toruby(f) { return typeof f === 'string' ? f : f.ruby; }
function analyzeSentence(sentence, overrides = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const parsed = yield mecabJdepp(sentence);
        // Promises
        const furiganaP = curtiz_utils_1.hasKanji(sentence) ? morphemesToFurigana(sentence, parsed.morphemes, overrides) : undefined;
        const particlesConjphrasesP = identifyFillInBlanks(parsed.bunsetsus);
        const dictionaryHitsP = enumerateDictionaryHits(parsed.morphemes);
        let [furigana, particlesConjphrases, dictionaryHits] = yield Promise.all([furiganaP, particlesConjphrasesP, dictionaryHitsP]);
        return { furigana, particlesConjphrases, dictionaryHits };
    });
}
exports.analyzeSentence = analyzeSentence;
function scoreHitsToWords(hits) {
    return __awaiter(this, void 0, void 0, function* () {
        const { db } = yield exports.jmdictPromise;
        return jmdict_simplified_node_1.idsToWords(db, hits.map(o => o.wordId));
    });
}
exports.scoreHitsToWords = scoreHitsToWords;
function getTags() {
    return __awaiter(this, void 0, void 0, function* () { return exports.jmdictPromise.then(({ db }) => jmdict_simplified_node_1.getTags(db)); });
}
exports.getTags = getTags;
function contextClozeToString(c) {
    return (c.left || c.right) ? `${c.left}[${c.cloze}]${c.right}` : c.cloze;
}
exports.contextClozeToString = contextClozeToString;
function contextClozeOrStringToString(c) {
    return typeof c === 'string' ? c : contextClozeToString(c);
}
exports.contextClozeOrStringToString = contextClozeOrStringToString;
function linesToCurtizMarkdown(lines) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const ret = [];
        const { db } = yield exports.jmdictPromise;
        const tags = JSON.parse(yield jmdict_simplified_node_1.getField(db, 'tags'));
        const MAX_LINES = 8;
        const overrides = {};
        const startRegexp = /^-\s+@\s+/;
        for (const line of lines) {
            if (!startRegexp.test(line)) {
                ret.push(line);
                continue;
            }
            const sentence = line.slice((_a = line.match(startRegexp)) === null || _a === void 0 ? void 0 : _a[0].length);
            const results = yield analyzeSentence(sentence, overrides);
            ret.push(results.furigana ? '- @ ' + results.furigana.map(furiganaToRuby).join('') : line);
            {
                if (results.particlesConjphrases.particles.size) {
                    ret.push('  - Particles');
                    for (const [_, cloze] of results.particlesConjphrases.particles) {
                        ret.push(`    - ${cloze.left}${cloze.left || cloze.right ? '[' + cloze.cloze + ']' : cloze.cloze}${cloze.right}`);
                    }
                }
                if (results.particlesConjphrases.conjugatedPhrases.size) {
                    ret.push('  - Conjugated phrases');
                    for (const [_, c] of results.particlesConjphrases.conjugatedPhrases) {
                        const cloze = c.cloze;
                        ret.push(`    - ${contextClozeToString(cloze)} | ${c.lemmas.map(furiganaToRuby).join(' + ')}`);
                    }
                }
            }
            {
                ret.push('  - Vocab');
                for (const fromStart of results.dictionaryHits) {
                    for (const fromEnd of fromStart.results) {
                        ret.push(`  - Vocab: ${contextClozeOrStringToString(fromEnd.run)} INFO`);
                        const hits = fromEnd.results.slice(0, MAX_LINES);
                        const words = yield scoreHitsToWords(hits);
                        for (const [wi, w] of words.entries()) {
                            ret.push('    - ' + hits[wi].search + ' | ' + displayWordLight(w, tags));
                        }
                        if (fromEnd.results.length > MAX_LINES) {
                            ret.push(`    - (… ${fromEnd.results.length - MAX_LINES} omitted) INFO`);
                        }
                    }
                }
            }
        }
        return ret;
    });
}
exports.linesToCurtizMarkdown = linesToCurtizMarkdown;
// RFC 4648 §5: base64url
function base64_to_base64url(base64) {
    return base64.replace(/\//g, '_').replace(/\+/g, '-').replace(/=+$/g, '');
}
function fileExists(file) {
    return __awaiter(this, void 0, void 0, function* () { return fs_1.promises.access(file).then(() => true).catch(() => false); });
}
function linesToFurigana(lines, buildDictionary = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const { db } = yield exports.jmdictPromise;
        const tags = JSON.parse(yield jmdict_simplified_node_1.getField(db, 'tags'));
        const ret = [];
        const overrides = {};
        const parentDir = process.cwd() + '/dict-hits-per-line';
        yield mkdirp_1.default(parentDir);
        // this will get written to disk
        const lightweight = [];
        const totalHash = crypto_1.createHash('md5');
        for (const line of lines) {
            totalHash.update(line); // we'll use this to save some lightweight data about each line in this list of `lines`
            if (!curtiz_utils_1.hasKanji(line) && !curtiz_utils_1.hasKana(line)) {
                ret.push(line);
                lightweight.push(line);
                continue;
            }
            const parsed = yield mecabJdepp(line);
            const furigana = yield morphemesToFurigana(line, parsed.morphemes, overrides);
            const lineHash = base64_to_base64url(crypto_1.createHash('md5').update(line).digest('base64'));
            ret.push(`<line id="hash-${lineHash}">` + furigana.map(furiganaToRuby).join('') + '</line>');
            lightweight.push({ line, hash: lineHash, furigana });
            if (buildDictionary) {
                const sidecarFile = `${parentDir}/line-${lineHash}.json`;
                if (!(yield fileExists(sidecarFile))) {
                    const dictHits = yield enumerateDictionaryHits(parsed.morphemes, false, 10);
                    for (let i = 0; i < dictHits.length; i++) {
                        for (let j = 0; j < dictHits[i].results.length; j++) {
                            const words = yield scoreHitsToWords(dictHits[i].results[j].results);
                            for (let k = 0; k < words.length; k++) {
                                dictHits[i].results[j].results[k].summary = displayWordLight(words[k], tags);
                            }
                        }
                    }
                    yield fs_1.promises.writeFile(sidecarFile, JSON.stringify({ line, furigana, bunsetsus: parsed.bunsetsus, dictHits }, null, 1));
                    // we should put this block in a promise and await all such promises before returning, to get more throughput
                    // (we'd interleave computation between LevelDB/disk i/o)
                }
            }
        }
        {
            const total = base64_to_base64url(totalHash.digest('base64'));
            yield fs_1.promises.writeFile(`${parentDir}/lightweight-${total}.json`, JSON.stringify(lightweight, null, 1));
        }
        return ret;
    });
}
exports.linesToFurigana = linesToFurigana;
if (module === require.main) {
    const USAGE = `USAGE:

annotate MODE file1 file2

MODE must be one of:
- "furigana": add furigana to kanji (default)
- "furigana-dict": same as "furigana" but also emit morpheme/dictionary information
- "markdown": output detailed breakdowns of text in files

Input streams are also understood:

annotate MODE < inputfile

cat inputfile | annotate MODE
`;
    let Mode;
    (function (Mode) {
        Mode["markdown"] = "markdown";
        Mode["furigana"] = "furigana";
        Mode["furiganaDict"] = "furigana-dict";
    })(Mode || (Mode = {}));
    (() => __awaiter(void 0, void 0, void 0, function* () {
        let lines = `- @ 今日は良い天気だ。

- @ たのしいですか。

- @ 何できた？`.split('\n');
        const [, , requestedMode, ...files] = process.argv;
        if (!Object.values(Mode).includes(requestedMode)) {
            console.error(USAGE);
            process.exit(1);
        }
        const mode = requestedMode;
        if (files.length === 0) {
            const getStdin = require('get-stdin');
            // no arguments, read from stdin. If stdin is empty, use default.
            const raw = (yield getStdin()).trim();
            if (raw) {
                lines = raw.split('\n');
            }
        }
        else {
            lines = curtiz_utils_1.flatmap(yield Promise.all(files.map(f => fs_1.promises.readFile(f, 'utf8'))), s => s.trim().replace(/\r/g, '').split('\n'));
        }
        if (mode === Mode.furigana) {
            console.log((yield linesToFurigana(lines, false)).join('\n'));
        }
        else if (mode === Mode.furiganaDict) {
            console.log((yield linesToFurigana(lines, true)).join('\n'));
        }
        else if (mode === Mode.markdown) {
            console.log((yield linesToCurtizMarkdown(lines)).join('\n'));
        }
        else {
            const _ = mode;
        }
    }))();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJhbm5vdGF0ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUFBLG1DQUFrQztBQUNsQywrQ0FBa0g7QUFDbEgsMkJBQW1DO0FBQ25DLCtEQU84QjtBQUM5QixtRUFXZ0M7QUFDaEMsb0RBQTRCO0FBRzVCLG1DQUFpQztBQUNqQywrQ0FPdUI7QUFFdkIsNkRBTzhCO0FBSjVCLGtEQUFBLGdCQUFnQixDQUFBO0FBR2hCLHFEQUFBLEtBQUssQ0FBdUI7QUFFOUIsaUVBQWdEO0FBQXhDLDRDQUFBLFFBQVEsQ0FBQTtBQUVILFFBQUEscUJBQXFCLEdBQUcsNEJBQW1CLEVBQUUsQ0FBQTtBQUM3QyxRQUFBLGFBQWEsR0FDdEIsOEJBQVcsQ0FBQyxtQkFBbUIsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLHdCQUF3QixDQUFDLElBQUksdUJBQXVCLEVBQUUsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO0FBTW5ILFNBQXNCLFVBQVUsQ0FBQyxRQUFnQjs7UUFDL0MsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxnQ0FLQztBQUVELE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBTSxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxF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LElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUN0SCxDQUFDO0FBSEQsa0NBR0M7QUFFRCxTQUFTLFVBQVUsQ0FBQyxDQUFTLElBQUksT0FBTyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDNUUsU0FBZ0IsZ0JBQWdCLENBQUMsQ0FBTyxFQUFFLElBQTRCO0lBQ3BFLE1BQU0sS0FBSyxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUNqRCxNQUFNLElBQUksR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFHL0MsTUFBTSxTQUFTLEdBQW9DLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUMsQ0FBQztJQUM1RixNQUFNLENBQUMsR0FDSCxDQUFDLENBQUMsS0FBSztTQUNGLEdBQUcsQ0FBQyxDQUFDLEtBQUssRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsR0FBRyxHQUFHLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQztRQUN0RSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxRQUFRLFVBQVUsQ0FBQyxL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Y2VzQ29udGVudCI6WyJpbXBvcnQge2NyZWF0ZUhhc2h9IGZyb20gJ2NyeXB0byc7XG5pbXBvcnQge2RlZHVwZUxpbWl0LCBmaWx0ZXJSaWdodCwgZmxhdG1hcCwgZmxhdHRlbiwgaGFzSGlyYWdhbmEsIGhhc0thbmEsIGhhc0thbmppLCBrYXRhMmhpcmF9IGZyb20gJ2N1cnRpei11dGlscydcbmltcG9ydCB7cHJvbWlzZXMgYXMgcGZzfSBmcm9tICdmcyc7XG5pbXBvcnQge1xuICBFbnRyeSxcbiAgRnVyaWdhbmEsXG4gIGZ1cmlnYW5hVG9TdHJpbmcsXG4gIEptZGljdEZ1cmlnYW5hLFxuICBSdWJ5LFxuICBzZXR1cCBhcyBzZXR1cEptZGljdEZ1cmlnYW5hXG59IGZyb20gJ2ptZGljdC1mdXJpZ2FuYS1ub2RlJztcbmltcG9ydCB7XG4gIGdldEZpZWxkLFxuICBnZXRUYWdzIGFzIGdldFRhZ3NEYixcbiAgaWRzVG9Xb3JkcyxcbiAga2FuamlCZWdpbm5pbmcsXG4gIHJlYWRpbmdCZWdpbm5pbmcsXG4gIFNlbnNlLFxuICBzZXR1cCBhcyBzZXR1cEptZGljdCxcbiAgVGFnLFxuICBXb3JkLFxuICBYcmVmLFxufSBmcm9tICdqbWRpY3Qtc2ltcGxpZmllZC1ub2RlJztcbmltcG9ydCBta2RpcnAgZnJvbSAnbWtkaXJwJztcblxuaW1wb3J0IHtBbmFseXNpc1Jlc3VsdCwgQ29uanVnYXRlZFBocmFzZSwgQ29udGV4dENsb3plLCBGaWxsSW5UaGVCbGFua3MsIFNjb3JlSGl0LCBTY29yZUhpdHN9IGZyb20gJy4vaW50ZXJmYWNlcyc7XG5pbXBvcnQge2FkZEpkZXBwfSBmcm9tICcuL2pkZXBwJztcbmltcG9ydCB7XG4gIGdvb2RNb3JwaGVtZVByZWRpY2F0ZSxcbiAgaW52b2tlTWVjYWIsXG4gIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMsXG4gIE1vcnBoZW1lLFxuICBwYXJzZSxcbiAgcGFyc2VNZWNhYlxufSBmcm9tICcuL21lY2FiVW5pZGljJztcblxuZXhwb3J0IHtcbiAgRW50cnksXG4gIEZ1cmlnYW5hLFxuICBmdXJpZ2FuYVRvU3RyaW5nLFxuICBKbWRpY3RGdXJpZ2FuYSxcbiAgUnVieSxcbiAgc2V0dXAgYXMgc2V0dXBKbWRpY3RGdXJpZ2FuYVxufSBmcm9tICdqbWRpY3QtZnVyaWdhbmEtbm9kZSc7XG5leHBvcnQge2dldEZpZWxkfSBmcm9tICdqbWRpY3Qtc2ltcGxpZmllZC1ub2RlJztcblxuZXhwb3J0IGNvbnN0IGptZGljdEZ1cmlnYW5hUHJvbWlzZSA9IHNldHVwSm1kaWN0RnVyaWdhbmEoKVxuZXhwb3J0IGNvbnN0IGptZGljdFByb21pc2UgPVxuICAgIHNldHVwSm1kaWN0KCdqbWRpY3Qtc2ltcGxpZmllZCcsIHByb2Nlc3MuZW52WydKTURJQ1RfU0lNUExJRklFRF9KU09OJ10gfHwgJ2ptZGljdC1lbmctMy4xLjAuanNvbicsIHRydWUsIHRydWUpO1xuXG5pbnRlcmZhY2UgTWVjYWJKZGVwcFBhcnNlZCB7XG4gIG1vcnBoZW1lczogTW9ycGhlbWVbXTtcbiAgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWVjYWJKZGVwcChzZW50ZW5jZTogc3RyaW5nKTogUHJvbWlzZTxNZWNhYkpkZXBwUGFyc2VkPiB7XG4gIGxldCByYXdNZWNhYiA9IGF3YWl0IGludm9rZU1lY2FiKHNlbnRlbmNlKTtcbiAgbGV0IG1vcnBoZW1lcyA9IG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMocGFyc2VNZWNhYihzZW50ZW5jZSwgcmF3TWVjYWIpWzBdLmZpbHRlcihvID0+ICEhbykpO1xuICBsZXQgYnVuc2V0c3VzID0gYXdhaXQgYWRkSmRlcHAocmF3TWVjYWIsIG1vcnBoZW1lcyk7XG4gIHJldHVybiB7bW9ycGhlbWVzLCBidW5zZXRzdXN9O1xufVxuXG5jb25zdCBwID0gKHg6IGFueSkgPT4gY29uc29sZS5kaXIoeCwge2RlcHRoOiBudWxsfSk7XG50eXBlIFdpdGhTZWFyY2hSZWFkaW5nPFQ+ID0gVCZ7IHNlYXJjaFJlYWRpbmc6IHN0cmluZ1tdOyB9O1xudHlwZSBXaXRoU2VhcmNoS2Fuamk8VD4gPSBUJnsgc2VhcmNoS2Fuamk6IHN0cmluZ1tdOyB9O1xuLyoqXG4gKiBHaXZlbiBNZUNhYiBtb3JwaGVtZXMsIHJldHVybiBhIHRyaXBseS1uZXN0ZWQgYXJyYXkgb2YgSk1EaWN0IGhpdHMuXG4gKlxuICogVGhlIG91dGVyLW1vc3QgbGF5ZXIgZW51bWVyYXRlcyB0aGUgKnN0YXJ0aW5nKiBtb3JwaGVtZSwgdGhlIG1pZGRsZSBsYXllciB0aGUgZW5kaW5nIG1vcnBoZW1lLCBhbmQgdGhlIGZpbmFsXG4gKiBpbm5lci1tb3N0IGxheWVyIHRoZSBsaXN0IG9mIGRpY3Rpb25hcnkgaGl0cyBmb3IgdGhlIHNlcXVlbmNlIG9mIG1vcnBoZW1lcyBiZXR3ZWVuIHRoZSBzdGFydCBhbmQgZW5kLlxuICpcbiAqIFJvdWdobHksIGluIGNvZGUgKGV4Y2VwdCB3ZSBtaWdodCBub3QgZmluZCBhbnl0aGluZyBmb3IgYWxsIHN0YXJ0LXRvLWVuZCBzZXF1ZW5jZXMpOlxuICogYGBganNcbiAqIGZvciAobGV0IHN0YXJ0SWR4ID0gMDsgc3RhcnRJZHggPCBtb3JwaGVtZXMubGVuZ3RoOyBzdGFydElkeCsrKSB7XG4gKiAgZm9yIChsZXQgZW5kSWR4ID0gbW9ycGhlbWVzLmxlbmd0aDsgZW5kSWR4ID4gc3RhcnRJZHg7IGVuZElkeC0tKSB7XG4gKiAgICByZXN1bHQucHVzaChKTURpY3Quc2VhcmNoKG1vcnBlaGVtZXMuc2xpY2Uoc3RhcnRJZHgsIGVuZElkeCkpKTtcbiAqICB9XG4gKiB9XG4gKiBgYGBcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVudW1lcmF0ZURpY3Rpb25hcnlIaXRzKHBsYWluTW9ycGhlbWVzOiBNb3JwaGVtZVtdLCBmdWxsID0gdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaW1pdCA9IC0xKTogUHJvbWlzZTxTY29yZUhpdHNbXT4ge1xuICBjb25zdCB7ZGJ9ID0gYXdhaXQgam1kaWN0UHJvbWlzZTtcbiAgY29uc3Qgc2ltcGxpZnkgPSAoYzogQ29udGV4dENsb3plKSA9PiAoYy5sZWZ0IHx8IGMucmlnaHQpID8gYyA6IGMuY2xvemU7XG5cbiAgY29uc3Qgam1kaWN0RnVyaWdhbmEgPSBhd2FpdCBqbWRpY3RGdXJpZ2FuYVByb21pc2U7XG4gIGNvbnN0IG1vcnBoZW1lczogV2l0aFNlYXJjaEthbmppPFdpdGhTZWFyY2hSZWFkaW5nPE1vcnBoZW1lPj5bXSA9IHBsYWluTW9ycGhlbWVzLm1hcChcbiAgICAgIG0gPT4gKHtcbiAgICAgICAgLi4ubSxcbiAgICAgICAgLy8gaWYgXCJzeW1ib2xcIiBQT1MsIGRvbid0IG5lZWRsZXNzbHkgZG91YmxlIHRoZSBudW1iZXIgb2YgdGhpbmdzIHRvIHNlYXJjaCBmb3IgbGF0ZXIgaW4gZm9ya2luZ1BhdGhzXG4gICAgICAgIHNlYXJjaEthbmppOiB1bmlxdWUobS5wYXJ0T2ZTcGVlY2hbMF0uc3RhcnRzV2l0aCgnc3ltYm9sJykgPyBbbS5saXRlcmFsXSA6IFttLmxpdGVyYWwsIG0ubGVtbWFdKSxcbiAgICAgICAgc2VhcmNoUmVhZGluZzogdW5pcXVlKG1vcnBoZW1lVG9TZWFyY2hMZW1tYShtKS5jb25jYXQobW9ycGhlbWVUb1N0cmluZ0xpdGVyYWwobSwgam1kaWN0RnVyaWdhbmEpKSlcbiAgICAgIH0pKTtcbiAgY29uc3Qgc3VwZXJoaXRzOiBTY29yZUhpdHNbXSA9IFtdO1xuICBmb3IgKGxldCBzdGFydElkeCA9IDA7IHN0YXJ0SWR4IDwgbW9ycGhlbWVzLmxlbmd0aDsgc3RhcnRJZHgrKykge1xuICAgIGNvbnN0IHJlc3VsdHM6IFNjb3JlSGl0c1sncmVzdWx0cyddID0gW107XG5cbiAgICBpZiAoIWZ1bGwpIHtcbiAgICAgIGNvbnN0IHBvcyA9IG1vcnBoZW1lc1tzdGFydElkeF0ucGFydE9mU3BlZWNoO1xuICAgICAgaWYgKHBvc1swXS5zdGFydHNXaXRoKCdzdXBwbGVtZW50YXJ5JykgfHwgcG9zWzBdLnN0YXJ0c1dpdGgoJ2F1eGlsaWFyeScpKSB7XG4gICAgICAgIC8vIHNraXAgdGhlc2VcbiAgICAgICAgc3VwZXJoaXRzLnB1c2goe3N0YXJ0SWR4LCByZXN1bHRzfSk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAobGV0IGVuZElkeCA9IE1hdGgubWluKG1vcnBoZW1lcy5sZW5ndGgsIHN0YXJ0SWR4ICsgNSk7IGVuZElkeCA+IHN0YXJ0SWR4OyAtLWVuZElkeCkge1xuICAgICAgY29uc3QgcnVuID0gbW9ycGhlbWVzLnNsaWNlKHN0YXJ0SWR4LCBlbmRJZHgpO1xuICAgICAgY29uc3QgcnVuTGl0ZXJhbENvcmUgPSBidW5zZXRzdVRvU3RyaW5nKHJ1bik7XG4gICAgICBjb25zdCBydW5MaXRlcmFsID0gc2ltcGxpZnkoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGJ1bnNldHN1VG9TdHJpbmcobW9ycGhlbWVzLnNsaWNlKDAsIHN0YXJ0SWR4KSksIHJ1bkxpdGVyYWxDb3JlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBidW5zZXRzdVRvU3RyaW5nKG1vcnBoZW1lcy5zbGljZShlbmRJZHgpKSkpO1xuICAgICAgaWYgKCFmdWxsKSB7XG4gICAgICAgIC8vIHNraXAgcGFydGljbGVzIGxpa2Ug44GvIGFuZCDjgoIgaWYgdGhleSdyZSBieSB0aGVtc2VsdmVzIGFzIGFuIG9wdGltaXphdGlvblxuICAgICAgICBpZiAocnVuTGl0ZXJhbENvcmUubGVuZ3RoID09PSAxICYmIGhhc0thbmEocnVuTGl0ZXJhbENvcmVbMF0pICYmIHJ1bkxpdGVyYWxDb3JlID09PSBydW5bMF0ubGVtbWEpIHsgY29udGludWU7IH1cbiAgICAgIH1cbiAgICAgIGxldCBzY29yZWQ6IFNjb3JlSGl0W10gPSBbXTtcblxuICAgICAgZnVuY3Rpb24gaGVscGVyU2VhcmNoZXNIaXRzVG9TY29yZWQoc2VhcmNoZXM6IHN0cmluZ1tdLCBzdWJoaXRzOiBXb3JkW11bXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlYXJjaEtleTogXCJrYW5hXCJ8XCJrYW5qaVwiKTogU2NvcmVIaXRbXSB7XG4gICAgICAgIHJldHVybiBmbGF0dGVuKHN1YmhpdHMubWFwKCh2LCBpKSA9PiB2Lm1hcCh3ID0+IHtcbiAgICAgICAgICAvLyBoZWxwIGNhdGNoIGlzc3VlcyB3aXRoIGF1dG9tYXRpYyB0eXBlIHdpZGVuaW5nIGFuZCBleGNlc3MgcHJvcGVydHkgY2hlY2tzXG4gICAgICAgICAgY29uc3QgcmV0OiBTY29yZUhpdCA9IHtcbiAgICAgICAgICAgIHdvcmRJZDogdy5pZCxcbiAgICAgICAgICAgIHNjb3JlOiBzY29yZU1vcnBoZW1lV29yZChydW4sIHNlYXJjaGVzW2ldLCBzZWFyY2hLZXksIHcpLFxuICAgICAgICAgICAgc2VhcmNoOiBzZWFyY2hlc1tpXSxcbiAgICAgICAgICAgIC8vIHJ1bjogcnVuTGl0ZXJhbCxcbiAgICAgICAgICAgIC8vIHJ1bklkeDogW3N0YXJ0SWR4LCBlbmRJZHggLSAxXSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgIH0pKSk7XG4gICAgICB9XG4gICAgICAvLyBTZWFyY2ggcmVhZGluZ1xuICAgICAge1xuICAgICAgICBjb25zdCByZWFkaW5nU2VhcmNoZXMgPSBmb3JraW5nUGF0aHMocnVuLm1hcChtID0+IG0uc2VhcmNoUmVhZGluZykpLm1hcCh2ID0+IHYuam9pbignJykpO1xuICAgICAgICBjb25zdCByZWFkaW5nU3ViaGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKHJlYWRpbmdTZWFyY2hlcy5tYXAoc2VhcmNoID0+IHJlYWRpbmdCZWdpbm5pbmcoZGIsIHNlYXJjaCkpKTtcbiAgICAgICAgc2NvcmVkID0gaGVscGVyU2VhcmNoZXNIaXRzVG9TY29yZWQocmVhZGluZ1NlYXJjaGVzLCByZWFkaW5nU3ViaGl0cywgJ2thbmEnKTtcbiAgICAgIH1cbiAgICAgIC8vIFNlYXJjaCBsaXRlcmFscyBpZiBuZWVkZWQsIHRoaXMgd29ya3MgYXJvdW5kIE1lQ2FiIG1pcy1yZWFkaW5ncyBsaWtlIOOBiueItuOBleOCky0+44GK44Gh44Gh44GV44KTXG4gICAgICB7XG4gICAgICAgIGNvbnN0IGthbmppU2VhcmNoZXMgPSBmb3JraW5nUGF0aHMocnVuLm1hcChtID0+IG0uc2VhcmNoS2FuamkpKS5tYXAodiA9PiB2LmpvaW4oJycpKS5maWx0ZXIoaGFzS2FuamkpO1xuICAgICAgICBjb25zdCBrYW5qaVN1YmhpdHMgPSBhd2FpdCBQcm9taXNlLmFsbChrYW5qaVNlYXJjaGVzLm1hcChzZWFyY2ggPT4ga2FuamlCZWdpbm5pbmcoZGIsIHNlYXJjaCkpKTtcbiAgICAgICAgc2NvcmVkLnB1c2goLi4uaGVscGVyU2VhcmNoZXNIaXRzVG9TY29yZWQoa2FuamlTZWFyY2hlcywga2FuamlTdWJoaXRzLCAna2FuamknKSk7XG4gICAgICB9XG5cbiAgICAgIHNjb3JlZC5zb3J0KChhLCBiKSA9PiBiLnNjb3JlIC0gYS5zY29yZSk7XG4gICAgICBpZiAoc2NvcmVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmVzdWx0cy5wdXNoKHtlbmRJZHgsIHJ1bjogcnVuTGl0ZXJhbCwgcmVzdWx0czogZGVkdXBlTGltaXQoc2NvcmVkLCBvID0+IG8ud29yZElkLCBsaW1pdCl9KTtcbiAgICAgIH1cbiAgICB9XG4gICAgc3VwZXJoaXRzLnB1c2goe3N0YXJ0SWR4LCByZXN1bHRzfSk7XG4gIH1cbiAgcmV0dXJuIHN1cGVyaGl0cztcbn1cbmZ1bmN0aW9uIHNjb3JlTW9ycGhlbWVXb3JkKHJ1bjogTW9ycGhlbWVbXSwgc2VhcmNoZWQ6IHN0cmluZywgc2VhcmNoS2V5OiAna2FuYSd8J2thbmppJywgd29yZDogV29yZCk6IG51bWJlciB7XG4gIGNvbnN0IGxlbiA9IHNlYXJjaGVkLmxlbmd0aDtcblxuICAvLyBpZiB0aGUgc2hvcnRlc3Qga2FuYSBpcyBzaG9ydGVyIHRoYW4gdGhlIHNlYXJjaCwgbGV0IHRoZSBjb3N0IGJlIDAuIElmIHNob3J0ZXN0IGthbmEgaXMgbG9uZ2VyIHRoYW4gc2VhcmNoLCBsZXQgdGhlXG4gIC8vIG92ZXJydW4gY29zdCBiZSBuZWdhdGl2ZS4gU2hvcnRlc3QgYmVjYXVzZSB3ZSdyZSBiZWluZyBvcHRpbWlzdGljXG4gIGNvbnN0IG92ZXJydW5QZW5hbHR5ID1cbiAgICAgIE1hdGgubWluKDAsIGxlbiAtIE1hdGgubWluKC4uLndvcmRbc2VhcmNoS2V5XS5maWx0ZXIoayA9PiBrLnRleHQuaW5jbHVkZXMoc2VhcmNoZWQpKS5tYXAoayA9PiBrLnRleHQubGVuZ3RoKSkpO1xuXG4gIC8vIGxpdGVyYWwgbWF5IGNvbnRhaW4ga2FuamkgdGhhdCBsZW1tYSBkb2Vzbid0LCBlLmcuLCDlpKfpmKoncyBsaXRlcmFsIGluIFVuaURpYyBpcyBrYXRha2FuYVxuICBjb25zdCB3b3JkS2FuamlzID0gbmV3IFNldChmbGF0dGVuKHdvcmQua2FuamkubWFwKGsgPT4gay50ZXh0LnNwbGl0KCcnKS5maWx0ZXIoaGFzS2FuamkpKSkpO1xuICBjb25zdCBsZW1tYUthbmppcyA9IG5ldyBTZXQoZmxhdHRlbihydW4ubWFwKG0gPT4gbS5sZW1tYS5zcGxpdCgnJykuZmlsdGVyKGhhc0thbmppKSkpKTtcbiAgY29uc3QgbGl0ZXJhbEthbmppcyA9IG5ldyBTZXQoZmxhdHRlbihydW4ubWFwKG0gPT4gbS5saXRlcmFsLnNwbGl0KCcnKS5maWx0ZXIoaGFzS2FuamkpKSkpO1xuICBjb25zdCBsZW1tYUthbmppQm9udXMgPSBpbnRlcnNlY3Rpb25TaXplKGxlbW1hS2FuamlzLCB3b3JkS2FuamlzKTtcbiAgY29uc3QgbGl0ZXJhbEthbmppQm9udXMgPSBpbnRlcnNlY3Rpb25TaXplKGxpdGVyYWxLYW5qaXMsIHdvcmRLYW5qaXMpO1xuXG4gIC8vIG1ha2Ugc3VyZSBvbmUtbW9ycGhlbWUgcGFydGljbGVzIHJpc2UgdG8gdGhlIHRvcCBvZiB0aGUgcGlsZSBvZiAxMGsgaGl0cy4uLlxuICBjb25zdCBwYXJ0aWNsZUJvbnVzID0gKyhydW4ubGVuZ3RoID09PSAxICYmIHJ1blswXS5wYXJ0T2ZTcGVlY2guc29tZShwb3MgPT4gcG9zLmluY2x1ZGVzKCdwYXJ0aWNsZScpKSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICB3b3JkLnNlbnNlLnNvbWUoc2Vuc2UgPT4gc2Vuc2UucGFydE9mU3BlZWNoLmluY2x1ZGVzKCdwcnQnKSkpO1xuXG4gIHJldHVybiBvdmVycnVuUGVuYWx0eSAqIDEwICsgbGl0ZXJhbEthbmppQm9udXMgKiAyICsgbGVtbWFLYW5qaUJvbnVzICogMSArIDUgKiBwYXJ0aWNsZUJvbnVzO1xufVxuZnVuY3Rpb24gaW50ZXJzZWN0aW9uPFQ+KHNtYWxsOiBTZXQ8VD4sIGJpZzogU2V0PFQ+KTogU2V0PFQ+IHtcbiAgaWYgKHNtYWxsLnNpemUgPiBiaWcuc2l6ZSAqIDEuMSkgeyByZXR1cm4gaW50ZXJzZWN0aW9uKGJpZywgc21hbGwpOyB9XG4gIGNvbnN0IHJldDogU2V0PFQ+ID0gbmV3IFNldCgpO1xuICBmb3IgKGNvbnN0IHggb2Ygc21hbGwpIHtcbiAgICBpZiAoYmlnLmhhcyh4KSkgeyByZXQuYWRkKHgpIH1cbiAgfVxuICByZXR1cm4gcmV0O1xufVxuZnVuY3Rpb24gaW50ZXJzZWN0aW9uU2l6ZTxUPihzbWFsbDogU2V0PFQ+LCBiaWc6IFNldDxUPik6IG51bWJlciB7XG4gIGlmIChzbWFsbC5zaXplID4gYmlnLnNpemUgKiAxLjEpIHsgcmV0dXJuIGludGVyc2VjdGlvblNpemUoYmlnLCBzbWFsbCk7IH1cbiAgbGV0IHJldCA9IDA7XG4gIGZvciAoY29uc3QgeCBvZiBzbWFsbCkgeyByZXQgKz0gK2JpZy5oYXMoeCk7IH1cbiAgcmV0dXJuIHJldDtcbn1cbmZ1bmN0aW9uIHVuaXF1ZTxUPih2OiBUW10pOiBUW10geyByZXR1cm4gWy4uLm5ldyBTZXQodildOyB9XG5cbmNvbnN0IGNpcmNsZWROdW1iZXJzID0gXCLikaDikaHikaLikaPikaTikaXikabikafikajikanikarikavikazika3ika7ika/ikbDikbHikbLikbPjiZHjiZLjiZPjiZTjiZXjiZbjiZfjiZjjiZnjiZrjiZvjiZzjiZ3jiZ7jiZ/jirHjirLjirPjirTjirXjirbjirfjirjjirnjirrjirvjirzjir3jir7jir9cIi5zcGxpdCgnJyk7XG5jb25zdCBwcmVmaXhOdW1iZXIgPSAobjogbnVtYmVyKSA9PiBjaXJjbGVkTnVtYmVyc1tuXSB8fCBgKCR7biArIDF9KWA7XG5leHBvcnQgZnVuY3Rpb24gZGlzcGxheVdvcmQodzogV29yZCkge1xuICByZXR1cm4gdy5rYW5qaS5tYXAoayA9PiBrLnRleHQpLmpvaW4oJ+ODuycpICsgJ+OAjCcgKyB3LmthbmEubWFwKGsgPT4gay50ZXh0KS5qb2luKCfjg7snKSArICfjgI3vvJonICtcbiAgICAgICAgIHcuc2Vuc2UubWFwKChzZW5zZSwgbikgPT4gcHJlZml4TnVtYmVyKG4pICsgJyAnICsgc2Vuc2UuZ2xvc3MubWFwKGdsb3NzID0+IGdsb3NzLnRleHQpLmpvaW4oJy8nKSkuam9pbignOyAnKTtcbn1cblxuZnVuY3Rpb24gcHJpbnRYcmVmcyh2OiBYcmVmW10pIHsgcmV0dXJuIHYubWFwKHggPT4geC5qb2luKCcsJykpLmpvaW4oJzsnKTsgfVxuZXhwb3J0IGZ1bmN0aW9uIGRpc3BsYXlXb3JkTGlnaHQodzogV29yZCwgdGFnczogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuICBjb25zdCBrYW5qaSA9IHcua2FuamkubWFwKGsgPT4gay50ZXh0KS5qb2luKCfjg7snKTtcbiAgY29uc3Qga2FuYSA9IHcua2FuYS5tYXAoayA9PiBrLnRleHQpLmpvaW4oJ+ODuycpO1xuXG4gIHR5cGUgVGFnS2V5ID0ge1tLIGluIGtleW9mIFNlbnNlXTogU2Vuc2VbS10gZXh0ZW5kcyBUYWdbXSA/IEsgOiBuZXZlcn1ba2V5b2YgU2Vuc2VdO1xuICBjb25zdCB0YWdGaWVsZHM6IFBhcnRpYWw8UmVjb3JkPFRhZ0tleSwgc3RyaW5nPj4gPSB7ZGlhbGVjdDogJ/Cfl6MnLCBmaWVsZDogJ/CfgITvuI8nLCBtaXNjOiAn4pyLJ307XG4gIGNvbnN0IHMgPVxuICAgICAgdy5zZW5zZVxuICAgICAgICAgIC5tYXAoKHNlbnNlLCBuKSA9PiBwcmVmaXhOdW1iZXIobikgKyAnICcgKyBzZW5zZS5nbG9zcy5tYXAoZ2xvc3MgPT4gZ2xvc3MudGV4dCkuam9pbignLycpICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHNlbnNlLnJlbGF0ZWQubGVuZ3RoID8gYCAo8J+RiSAke3ByaW50WHJlZnMoc2Vuc2UucmVsYXRlZCl9KWAgOiAnJykgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoc2Vuc2UuYW50b255bS5sZW5ndGggPyBgICjwn5GIICR7cHJpbnRYcmVmcyhzZW5zZS5hbnRvbnltKX0pYCA6ICcnKSArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIE9iamVjdC5lbnRyaWVzKHRhZ0ZpZWxkcylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAoKFtrLCB2XSkgPT4gc2Vuc2VbayBhcyBUYWdLZXldLmxlbmd0aFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBgICgke3Z9ICR7c2Vuc2VbayBhcyBUYWdLZXldLm1hcChrID0+IHRhZ3Nba10pLmpvaW4oJzsgJyl9KWBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbignJykpXG4gICAgICAgICAgLmpvaW4oJyAnKTtcbiAgLy8gY29uc29sZS5lcnJvcihyZWxhdGVkKVxuICByZXR1cm4gYCR7a2Fuaml944CMJHtrYW5hfeOAjXwgJHtzfWA7XG59XG5leHBvcnQgZnVuY3Rpb24gZGlzcGxheVdvcmREZXRhaWxlZCh3OiBXb3JkLCB0YWdzOiB7W2s6IHN0cmluZ106IHN0cmluZ30pIHtcbiAgcmV0dXJuIHcua2FuamkuY29uY2F0KHcua2FuYSkubWFwKGsgPT4gay50ZXh0KS5qb2luKCfjg7snKSArICfvvJonICtcbiAgICAgICAgIHcuc2Vuc2VcbiAgICAgICAgICAgICAubWFwKChzZW5zZSwgbikgPT4gcHJlZml4TnVtYmVyKG4pICsgJyAnICsgc2Vuc2UuZ2xvc3MubWFwKGdsb3NzID0+IGdsb3NzLnRleHQpLmpvaW4oJy8nKSArICcgeyonICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc2Vuc2UucGFydE9mU3BlZWNoLm1hcChwb3MgPT4gdGFnc1twb3NdKS5qb2luKCc7ICcpICsgJyp9JylcbiAgICAgICAgICAgICAuam9pbignOyAnKSArXG4gICAgICAgICAnICMnICsgdy5pZDtcbn1cblxuLyoqXG4gKiBDYXJ0ZXNpYW4gcHJvZHVjdC5cbiAqXG4gKiBUcmVhdHMgZWFjaCBzdWItYXJyYXkgaW4gYW4gYXJyYXkgb2YgYXJyYXlzIGFzIGEgbGlzdCBvZiBjaG9pY2VzIGZvciB0aGF0IHNsb3QsIGFuZCBlbnVtZXJhdGVzIGFsbCBwYXRocy5cbiAqXG4gKiBTbyBbWydoaScsICdvbGEnXSwgWydTYWwnXV0gPT4gW1snaGknLCAnU2FsJ10sIFsnb2xhJywgJ1NhbCddXVxuICpcbiAqL1xuZnVuY3Rpb24gZm9ya2luZ1BhdGhzPFQ+KHY6IFRbXVtdKTogVFtdW10ge1xuICBsZXQgcmV0OiBUW11bXSA9IFtbXV07XG4gIGZvciAoY29uc3QgdSBvZiB2KSB7IHJldCA9IGZsYXR0ZW4odS5tYXAoeCA9PiByZXQubWFwKHYgPT4gdi5jb25jYXQoeCkpKSk7IH1cbiAgcmV0dXJuIHJldDtcbn1cblxuLyoqXG4gKiBFbnN1cmUgbmVlZGxlIGlzIGZvdW5kIGluIGhheXN0YWNrIG9ubHkgb25jZVxuICogQHBhcmFtIGhheXN0YWNrIGJpZyBzdHJpbmdcbiAqIEBwYXJhbSBuZWVkbGUgbGl0dGxlIHN0cmluZ1xuICovXG5mdW5jdGlvbiBhcHBlYXJzRXhhY3RseU9uY2UoaGF5c3RhY2s6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgY29uc3QgaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpO1xuICByZXR1cm4gaGl0ID49IDAgJiYgaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGhpdCArIDEpIDwgMDtcbn1cblxuLyoqXG4gKiBHaXZlbiB0aHJlZSBjb25zZWN1dGl2ZSBzdWJzdHJpbmdzICh0aGUgYXJndW1lbnRzKSwgcmV0dXJuIGB7bGVmdDogbGVmdDIsIGNsb3plLCByaWdodDogcmlnaHQyfWAgd2hlcmVcbiAqIGBsZWZ0MmAgYW5kIGByaWdodDJgIGFyZSBhcyBzaG9ydCBhcyBwb3NzaWJsZSBhbmQgYCR7bGVmdDJ9JHtjbG96ZX0ke3JpZ2h0Mn1gIGlzIHVuaXF1ZSBpbiB0aGUgZnVsbCBzdHJpbmcuXG4gKiBAcGFyYW0gbGVmdCBsZWZ0IHN0cmluZywgcG9zc2libHkgZW1wdHlcbiAqIEBwYXJhbSBjbG96ZSBtaWRkbGUgc3RyaW5nXG4gKiBAcGFyYW0gcmlnaHQgcmlnaHQgc3RyaW5nLCBwb3NzaWJsZSBlbXB0eVxuICogQHRocm93cyBpbiB0aGUgdW5saWtlbHkgZXZlbnQgdGhhdCBzdWNoIGEgcmV0dXJuIHN0cmluZyBjYW5ub3QgYmUgYnVpbGQgKEkgY2Fubm90IHRoaW5rIG9mIGFuIGV4YW1wbGUgdGhvdWdoKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdDogc3RyaW5nLCBjbG96ZTogc3RyaW5nLCByaWdodDogc3RyaW5nKTogQ29udGV4dENsb3plIHtcbiAgY29uc3Qgc2VudGVuY2UgPSBsZWZ0ICsgY2xvemUgKyByaWdodDtcbiAgbGV0IGxlZnRDb250ZXh0ID0gJyc7XG4gIGxldCByaWdodENvbnRleHQgPSAnJztcbiAgbGV0IGNvbnRleHRMZW5ndGggPSAwO1xuICB3aGlsZSAoIWFwcGVhcnNFeGFjdGx5T25jZShzZW50ZW5jZSwgbGVmdENvbnRleHQgKyBjbG96ZSArIHJpZ2h0Q29udGV4dCkpIHtcbiAgICBjb250ZXh0TGVuZ3RoKys7XG4gICAgaWYgKGNvbnRleHRMZW5ndGggPiBsZWZ0Lmxlbmd0aCAmJiBjb250ZXh0TGVuZ3RoID4gcmlnaHQubGVuZ3RoKSB7XG4gICAgICBjb25zb2xlLmVycm9yKHtzZW50ZW5jZSwgbGVmdCwgY2xvemUsIHJpZ2h0LCBsZWZ0Q29udGV4dCwgcmlnaHRDb250ZXh0LCBjb250ZXh0TGVuZ3RofSk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JhbiBvdXQgb2YgY29udGV4dCB0byBidWlsZCB1bmlxdWUgY2xvemUnKTtcbiAgICB9XG4gICAgbGVmdENvbnRleHQgPSBsZWZ0LnNsaWNlKC1jb250ZXh0TGVuZ3RoKTtcbiAgICByaWdodENvbnRleHQgPSByaWdodC5zbGljZSgwLCBjb250ZXh0TGVuZ3RoKTtcbiAgfVxuICByZXR1cm4ge2xlZnQ6IGxlZnRDb250ZXh0LCBjbG96ZSwgcmlnaHQ6IHJpZ2h0Q29udGV4dH07XG59XG5jb25zdCBidW5zZXRzdVRvU3RyaW5nID0gKG1vcnBoZW1lczogTW9ycGhlbWVbXSkgPT4gbW9ycGhlbWVzLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG5hc3luYyBmdW5jdGlvbiBpZGVudGlmeUZpbGxJbkJsYW5rcyhidW5zZXRzdXM6IE1vcnBoZW1lW11bXSk6IFByb21pc2U8RmlsbEluVGhlQmxhbmtzPiB7XG4gIC8vIEZpbmQgY2xvemVzOiBwYXJ0aWNsZXMgYW5kIGNvbmp1Z2F0ZWQgdmVyYi9hZGplY3RpdmUgcGhyYXNlc1xuICBjb25zdCBjb25qdWdhdGVkUGhyYXNlczogTWFwPHN0cmluZywgQ29uanVnYXRlZFBocmFzZT4gPSBuZXcgTWFwKCk7XG4gIGNvbnN0IHBhcnRpY2xlczogTWFwPHN0cmluZywgQ29udGV4dENsb3plPiA9IG5ldyBNYXAoKTtcbiAgZm9yIChjb25zdCBbYmlkeCwgYnVuc2V0c3VdIG9mIGJ1bnNldHN1cy5lbnRyaWVzKCkpIHtcbiAgICBjb25zdCBmaXJzdCA9IGJ1bnNldHN1WzBdO1xuICAgIGlmICghZmlyc3QpIHsgY29udGludWU7IH1cbiAgICBjb25zdCBwb3MwID0gZmlyc3QucGFydE9mU3BlZWNoWzBdO1xuICAgIGNvbnN0IHBvc0xhc3QgPSBmaXJzdC5wYXJ0T2ZTcGVlY2hbZmlyc3QucGFydE9mU3BlZWNoLmxlbmd0aCAtIDFdO1xuICAgIGlmIChidW5zZXRzdS5sZW5ndGggPiAxICYmXG4gICAgICAgIChwb3MwLnN0YXJ0c1dpdGgoJ3ZlcmInKSB8fCBwb3MwLmVuZHNXaXRoKCdfdmVyYicpIHx8IHBvczAuc3RhcnRzV2l0aCgnYWRqZWN0JykgfHwgcG9zTGFzdCA9PT0gJ3ZlcmJhbF9zdXJ1JykpIHtcbiAgICAgIGNvbnN0IGlnbm9yZVJpZ2h0ID0gZmlsdGVyUmlnaHQoYnVuc2V0c3UsIG0gPT4gIWdvb2RNb3JwaGVtZVByZWRpY2F0ZShtKSk7XG4gICAgICBjb25zdCBnb29kQnVuc2V0c3UgPSBpZ25vcmVSaWdodC5sZW5ndGggPT09IDAgPyBidW5zZXRzdSA6IGJ1bnNldHN1LnNsaWNlKDAsIC1pZ25vcmVSaWdodC5sZW5ndGgpO1xuICAgICAgaWYgKGdvb2RCdW5zZXRzdS5sZW5ndGggPiAxKSB7XG4gICAgICAgIGNvbnN0IGNsb3plID0gYnVuc2V0c3VUb1N0cmluZyhnb29kQnVuc2V0c3UpO1xuICAgICAgICBjb25zdCBsZWZ0ID0gYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgY29uc3QgcmlnaHQgPSBidW5zZXRzdVRvU3RyaW5nKGlnbm9yZVJpZ2h0KSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBpZiAoIWNvbmp1Z2F0ZWRQaHJhc2VzLmhhcyhjbG96ZSkpIHtcbiAgICAgICAgICBjb25zdCBqZiA9IGF3YWl0IGptZGljdEZ1cmlnYW5hUHJvbWlzZTtcbiAgICAgICAgICBjb25qdWdhdGVkUGhyYXNlcy5zZXQoY2xvemUsIHtcbiAgICAgICAgICAgIGNsb3plOiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgY2xvemUsIHJpZ2h0KSxcbiAgICAgICAgICAgIGxlbW1hczogZ29vZEJ1bnNldHN1Lm1hcChvID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZW50cmllcyA9IGpmLnRleHRUb0VudHJ5LmdldChvLmxlbW1hKSB8fCBbXTtcbiAgICAgICAgICAgICAgY29uc3QgbGVtbWFSZWFkaW5nID0ga2F0YTJoaXJhKG8ubGVtbWFSZWFkaW5nKTtcbiAgICAgICAgICAgICAgY29uc3QgZW50cnkgPSBlbnRyaWVzLmZpbmQoZSA9PiBlLnJlYWRpbmcgPT09IGxlbW1hUmVhZGluZyk7XG4gICAgICAgICAgICAgIHJldHVybiBlbnRyeSA/IGVudHJ5LmZ1cmlnYW5hXG4gICAgICAgICAgICAgICAgICAgICAgICAgICA6IG8ubGVtbWEgPT09IGxlbW1hUmVhZGluZyA/IFtsZW1tYVJlYWRpbmddIDogW3tydWJ5OiBvLmxlbW1hLCBydDogbGVtbWFSZWFkaW5nfV07XG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHBhcnRpY2xlUHJlZGljYXRlID0gKHA6IE1vcnBoZW1lKSA9PiBwLnBhcnRPZlNwZWVjaFswXS5zdGFydHNXaXRoKCdwYXJ0aWNsZScpICYmIHAucGFydE9mU3BlZWNoLmxlbmd0aCA+IDEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXAucGFydE9mU3BlZWNoWzFdLnN0YXJ0c1dpdGgoJ3BocmFzZV9maW5hbCcpO1xuICAgIGZvciAoY29uc3QgW3BpZHgsIHBhcnRpY2xlXSBvZiBidW5zZXRzdS5lbnRyaWVzKCkpIHtcbiAgICAgIGlmIChwYXJ0aWNsZVByZWRpY2F0ZShwYXJ0aWNsZSkpIHtcbiAgICAgICAgY29uc3QgbGVmdCA9XG4gICAgICAgICAgICBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpICsgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZSgwLCBwaWR4KSk7XG4gICAgICAgIGNvbnN0IHJpZ2h0ID1cbiAgICAgICAgICAgIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UocGlkeCArIDEpKSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBjb25zdCBjbG96ZSA9IGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBwYXJ0aWNsZS5saXRlcmFsLCByaWdodCk7XG4gICAgICAgIHBhcnRpY2xlcy5zZXQoY2xvemUubGVmdCArIGNsb3plLmNsb3plICsgY2xvemUucmlnaHQsIGNsb3plKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIHtwYXJ0aWNsZXMsIGNvbmp1Z2F0ZWRQaHJhc2VzfTtcbn1cblxuZnVuY3Rpb24gbW9ycGhlbWVUb1NlYXJjaExlbW1hKG06IE1vcnBoZW1lKTogc3RyaW5nW10ge1xuICBjb25zdCBwb3MwID0gbS5wYXJ0T2ZTcGVlY2hbMF07XG4gIGNvbnN0IGNvbmp1Z2F0YWJsZSA9IChtLmluZmxlY3Rpb24/LlswXSkgfHwgKG0uaW5mbGVjdGlvblR5cGU/LlswXSkgfHwgcG9zMC5zdGFydHNXaXRoKCd2ZXJiJykgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgcG9zMC5lbmRzV2l0aCgnX3ZlcmInKSB8fCBwb3MwLnN0YXJ0c1dpdGgoJ2FkamVjdCcpO1xuICBjb25zdCBwb3RlbnRpYWxSZW5kYWt1ID0gbS5saXRlcmFsID09PSBtLmxlbW1hICYmIGhhc0thbmppKG0ubGVtbWEpICYmIG0ubGVtbWFSZWFkaW5nICE9PSBtLnByb251bmNpYXRpb247XG4gIHJldHVybiAoY29uanVnYXRhYmxlIHx8IHBvdGVudGlhbFJlbmRha3UpID8gW2thdGEyaGlyYShtLmxlbW1hUmVhZGluZyldIDogW107XG4gIC8vIGxpdGVyYWwncyBwcm9udW5jaWF0aW9uIHdpbGwgaGFuZGxlIHRoZSByZXN0XG59XG5cbmNvbnN0IENIT1VPTlBVID0gJ+ODvCc7IC8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NoJUM1JThEb25wdVxuLyoqXG4gKiBSZXR1cm5zIGFycmF5IG9mIHN0cmluZ3MgaW4gaGlyYWdhbmEsIHdpdGhvdXQgY2hvdW9ucHUsIHJlcHJlc2VudGluZyBwb3NzaWJsZSBwcm9udW5jaWF0aW9uc1xuICogVHJpZXMgaGFyZCB0byBtYWtlIHN1cmUgdGhlIHJldHVybmVkIGFycmF5IGhhcyBsZW5ndGggMS5cbiAqL1xuZnVuY3Rpb24gbW9ycGhlbWVUb1N0cmluZ0xpdGVyYWwobTogUGljazxNb3JwaGVtZSwgJ2xpdGVyYWwnfCdsZW1tYSd8J3Byb251bmNpYXRpb24nfCdsZW1tYVJlYWRpbmcnPixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGptZGljdEZ1cmlnYW5hPzogSm1kaWN0RnVyaWdhbmEpOiBzdHJpbmdbXSB7XG4gIGlmICghaGFzS2FuamkobS5saXRlcmFsKSkgeyByZXR1cm4gW20ubGl0ZXJhbF07IH1cbiAgLy8gc28gbGl0ZXJhbCBoYXMga2FuamlcbiAgaWYgKCFtLnByb251bmNpYXRpb24uaW5jbHVkZXMoQ0hPVU9OUFUpKSB7IHJldHVybiBba2F0YTJoaXJhKG0ucHJvbnVuY2lhdGlvbildOyB9XG4gIC8vIHNvIGxpdGVyYWwgaGFzIGthbmppIGFuZCB0aGUgcHJvbnVuY2lhdGlvbiBoYXMgYSBjaG91b25wdVxuICBpZiAobS5saXRlcmFsID09PSBtLmxlbW1hKSB7IHJldHVybiBba2F0YTJoaXJhKG0ubGVtbWFSZWFkaW5nKV07IH1cbiAgLy8gc28gbGl0ZXJhbCBoYXMga2FuamksIHRoZSBwcm9udW5jaWF0aW9uIGhhcyBjaG91b25wdSwgYW5kIHRoZSBsaXRlcmFsIGFuZCBsZW1tYSBkaXNhZ3JlZVxuXG4gIC8vIOWkmiAgICAgICAgICAgICB8IOOCquODvCAgICAgICAgICAgfCDjgqrjgqrjgqQgICAgICAgICB8IOWkmuOBhFxuICAvLyDlpKfpmKogICAgICAgICAgICAgICB8IOOCquODvOOCteOCqyAgICAgICAgICAgfCDjgqrjgqrjgrXjgqsgICAgICAgICAgIHwg44Kq44Kq44K144KrXG4gIC8vIOS6rOmDvSAgICAgICAgICAgICAgIHwg44Kt44On44O844OIICAgICAgICAgICB8IOOCreODp+OCpuODiCAgICAgICAgICAgfCDjgq3jg6fjgqbjg4hcbiAgLy8g5p2x5LqsICAgICAgICAgICAgICAgfCDjg4jjg7zjgq3jg6fjg7wgICAgICAgICB8IOODiOOCpuOCreODp+OCpiAgICAgICAgIHwg44OI44Km44Kt44On44KmXG4gIC8vIOimi+OCiOOBhiAgICAgICAgICAgICB8IOODn+ODqOODvCAgICAgICAgICAgICB8IOODn+ODqyAgICAgICAgICAgICAgIHwg6KaL44KLXG5cbiAgLy8gY2FudCBqdXN0IHJlcGxhY2UgY2hvdW9ucHUgd2l0aCBlcXVpdmxlbnQgaW4gbGVtbWEhIDpcbiAgLy8g6IGe44GEIHwg44Kt44O8IHwg44Kt44KvIHwg6IGe44GPXG5cbiAgZnVuY3Rpb24gcmVwbGFjZUNob3VvbnB1V2l0aFN0cmluZyhwcm9udW5jaWF0aW9uOiBzdHJpbmcsIGxpdGVyYWw6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHByb251bmNpYXRpb24uc3BsaXQoJycpLm1hcCgocCwgaSkgPT4gKHAgPT09IENIT1VPTlBVICYmIGhhc0hpcmFnYW5hKGxpdGVyYWxbaV0pKSA/IGxpdGVyYWxbaV0gOiBwKS5qb2luKCcnKVxuICB9XG5cbiAgaWYgKGhhc0hpcmFnYW5hKG0ubGl0ZXJhbCkpIHtcbiAgICAvLyB0cnkgdG8gc2VlIGlmIHRoZSBjaG91b25wdSBpbiBwcm9udW5pY2F0aW9uIGlzIGEgaGlyYWdhbmEgaW4gbGl0ZXJhbDpcblxuICAgIGlmIChtLmxpdGVyYWwubGVuZ3RoID09PSBtLnByb251bmNpYXRpb24ubGVuZ3RoKSB7XG4gICAgICAvLyBzYW1lIGxlbmd0aDogYWxsIGthbmppIGFyZSBvbmUtY2hhcmFjdGVyLCBzbyB3ZSBjYW4gc2FmZWx5IHNwbGl0IGJvdGggbGl0ZXJhbCBhbmQgcHJvbnVuY2lhdGlvblxuICAgICAgLy8g6aOb44Gz56uL44Go44GGIHwg44OI44OT44K/44OI44KmIHwg44OI44OT44K/44OI44O8IHwg44OI44OT44K/44OEIHwg6aOb44Gz56uL44GkXG4gICAgICBjb25zdCByZWNvbnN0cnVjdGVkUHJvbnVuY2lhdGlvbiA9IHJlcGxhY2VDaG91b25wdVdpdGhTdHJpbmcobS5wcm9udW5jaWF0aW9uLCBtLmxpdGVyYWwpO1xuICAgICAgaWYgKCFyZWNvbnN0cnVjdGVkUHJvbnVuY2lhdGlvbi5pbmNsdWRlcyhDSE9VT05QVSkpIHsgcmV0dXJuIFtrYXRhMmhpcmEocmVjb25zdHJ1Y3RlZFByb251bmNpYXRpb24pXSB9XG4gICAgfVxuXG4gICAgLy8g6Kmx44GX5ZCI44GK44GGIHwg44OP44OK44K344Ki44Kq44KmIHwg44OP44OK44K344Ki44Kq44O8IHwg44OP44OK44K344Ki44KmIHwg6Kmx44GX5ZCI44GGXG5cbiAgICBpZiAoam1kaWN0RnVyaWdhbmEpIHtcbiAgICAgIGNvbnN0IGVudHJpZXMgPSBqbWRpY3RGdXJpZ2FuYS50ZXh0VG9FbnRyeS5nZXQobS5sZW1tYSk7XG4gICAgICBpZiAoZW50cmllcykge1xuICAgICAgICBjb25zdCBsZW1tYVJlYWRpbmcgPSBrYXRhMmhpcmEobS5sZW1tYVJlYWRpbmcpO1xuICAgICAgICBjb25zdCBlbnRyeSA9IGVudHJpZXMuZmluZChlID0+IGUucmVhZGluZyA9PT0gbGVtbWFSZWFkaW5nKTtcbiAgICAgICAgaWYgKGVudHJ5KSB7XG4gICAgICAgICAgY29uc3QgZnVyaWdhbmFNYXAgPSBuZXcgTWFwKGVudHJ5LmZ1cmlnYW5hLm1hcChmID0+IHR5cGVvZiBmID09PSAnc3RyaW5nJyA/IFsnJywgJyddIDogW2YucnVieSwgZi5ydF0pKTtcbiAgICAgICAgICBjb25zdCByZWNvbnN0cnVjdGVkTGl0ZXJhbCA9IG0ubGl0ZXJhbC5zcGxpdCgnJykubWFwKGMgPT4gZnVyaWdhbmFNYXAuZ2V0KGMpIHx8IGMpLmpvaW4oJycpO1xuICAgICAgICAgIGlmIChtLnByb251bmNpYXRpb24ubGVuZ3RoID09PSByZWNvbnN0cnVjdGVkTGl0ZXJhbC5sZW5ndGgpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlY29uc3RydWN0ZWRQcm9udW5jaWF0aW9uID0gcmVwbGFjZUNob3VvbnB1V2l0aFN0cmluZyhtLnByb251bmNpYXRpb24sIHJlY29uc3RydWN0ZWRMaXRlcmFsKTtcbiAgICAgICAgICAgIGlmICghcmVjb25zdHJ1Y3RlZFByb251bmNpYXRpb24uaW5jbHVkZXMoQ0hPVU9OUFUpKSB7IHJldHVybiBba2F0YTJoaXJhKHJlY29uc3RydWN0ZWRQcm9udW5jaWF0aW9uKV0gfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE5vIGNob2ljZSwg44Kq44O8IGFuZCDjg4jjg7wgbmVlZCB0byBiZSBtYXBwZWQgdG8gYm90aCBvcHRpb25zLlxuICAvLyBPdGhlciBjaG91b25wdSBtYXBwZWQgdmlhIGBEVU1CX0NIT1VPTlBVX01BUGAuXG5cbiAgY29uc3QgcHJvbnVuY2lhdGlvbiA9IG0ucHJvbnVuY2lhdGlvbi5zcGxpdCgnJyk7XG4gIGxldCByZXQ6IHN0cmluZ1tdW10gPSBbW11dO1xuICBmb3IgKGNvbnN0IFtpLCBwXSBvZiBwcm9udW5jaWF0aW9uLmVudHJpZXMoKSkge1xuICAgIGlmIChwID09PSBDSE9VT05QVSkge1xuICAgICAgaWYgKHByb251bmNpYXRpb25baSAtIDFdID09PSAn44OIJyB8fCBwcm9udW5jaWF0aW9uW2kgLSAxXSA9PT0gJ+OCqicpIHtcbiAgICAgICAgcmV0ID0gWy4uLnJldC5tYXAodiA9PiB2LmNvbmNhdCgn44KqJykpLCAuLi5yZXQubWFwKHYgPT4gdi5jb25jYXQoJ+OCpicpKV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXQuZm9yRWFjaCh2ID0+IHYucHVzaChEVU1CX0NIT1VPTlBVX01BUC5nZXQoa2F0YTJoaXJhKHByb251bmNpYXRpb25baSAtIDFdKSkgfHwgQ0hPVU9OUFUpKVxuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHJldC5mb3JFYWNoKHYgPT4gdi5wdXNoKHApKTtcbiAgfVxuICByZXR1cm4gcmV0Lm1hcCh2ID0+IGthdGEyaGlyYSh2LmpvaW4oJycpKSk7XG59XG5cbmNvbnN0IERVTUJfQ0hPVU9OUFVfTUFQID0gKGZ1bmN0aW9uIG1ha2VDaG91b25wdU1hcCgpIHtcbiAgY29uc3QgYXMgPSBg44GB44GC44GL44GM44GV44GW44Gf44Gg44Gq44Gv44Gw44Gx44G+44KD44KE44KJ44KO44KPYDtcbiAgY29uc3QgaXMgPSBg44GD44GE44GN44GO44GX44GY44Gh44Gi44Gr44Gy44Gz44G044G/44KKYDtcbiAgY29uc3QgdXMgPSBg44GF44GG44GP44GQ44GZ44Ga44Gj44Gk44Gl44Gs44G144G244G344KA44KF44KG44KL44KUYFxuICBjb25zdCBlcyA9IGDjgYfjgYjjgZHjgZLjgZvjgZzjgabjgafjga3jgbjjgbnjgbrjgoHjgoxgO1xuICBjb25zdCBvcyA9IGDjgYnjgYrjgZPjgZTjgZ3jgZ7jgajjganjga7jgbvjgbzjgb3jgoLjgofjgojjgo3jgpJgO1xuICBjb25zdCBtOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICBjb25zdCBkb2VyID0gKGFzOiBzdHJpbmcsIHRhcmdldDogc3RyaW5nKSA9PiBhcy5zcGxpdCgnJykuZm9yRWFjaChhID0+IG0uc2V0KGEsIHRhcmdldCkpO1xuICBkb2VyKGFzLCAn44GCJyk7XG4gIGRvZXIoaXMsICfjgYQnKTtcbiAgZG9lcih1cywgJ+OBhicpO1xuICBkb2VyKGVzLCAn44GEJyk7XG4gIGRvZXIob3MsICfjgYYnKTtcbiAgcmV0dXJuIG07XG59KSgpO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW9ycGhlbWVzVG9GdXJpZ2FuYShsaW5lOiBzdHJpbmcsIG1vcnBoZW1lczogTW9ycGhlbWVbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG92ZXJyaWRlczogUGFydGlhbDxSZWNvcmQ8c3RyaW5nLCBGdXJpZ2FuYVtdPj4pOiBQcm9taXNlPEZ1cmlnYW5hW11bXT4ge1xuICByZXR1cm4gbW9ycGhlbWVzVG9GdXJpZ2FuYUNvcmUobW9ycGhlbWVzLCBvdmVycmlkZXMpLnRoZW4obyA9PiBjaGVja0Z1cmlnYW5hKGxpbmUsIG8pKVxufVxuXG4vKipcbiAqIFRyeSB2ZXJ5IGhhcmQgdG8gY29udmVydCBtb3JwaGVtZXMgdG8gZnVyaWdhbmEuIGBvdmVycmlkZXNgIGlzIGEgbWFwIG9mIG1vcnBoZW1lIGxpdGVyYWwgdG8gdGhlIGZ1cmlnYW5hIHlvdSB3YW50LlxuICogVGhpcyBpcyB1c2VmdWwgYmVjYXVzZSwgZS5nLiwgVW5pZGljIGFsd2F5cyBjb252ZXJ0cyDml6XmnKwgdG8g44OL44OD44Od44OzLCBhbmQgbWF5YmUgeW91IHdhbnQgb3ZlcnJpZGVzIHN1Y2ggdGhhdDpcbiAqIGBvdmVycmlkZXMgPSBuZXcgTWFwKFtbJ+aXpeacrCcsIFt7cnVieTogJ+aXpScsIHJ0OiAn44GrJ30sIHtydWJ5OiAn5pysJywgcnQ6ICfjgbvjgpMnfV1dXSlgXG4gKiBOb3RlIHRoYXQgYG92ZXJyaWRlc2Agb3BlcmF0ZXMgb24gYSBtb3JwaGVtZS1ieS1tb3JwaGVtZSBiYXNpcy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vcnBoZW1lc1RvRnVyaWdhbmFDb3JlKG1vcnBoZW1lczogTW9ycGhlbWVbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdmVycmlkZXM6IFBhcnRpYWw8UmVjb3JkPHN0cmluZywgRnVyaWdhbmFbXT4+KTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICBpZiAoIWhhc0thbmppKGxpdGVyYWwpKSB7IHJldHVybiBbbGl0ZXJhbF07IH1cbiAgICB7XG4gICAgICBjb25zdCBoaXQgPSBvdmVycmlkZXNbbGl0ZXJhbF07XG4gICAgICBpZiAoaGl0KSB7IHJldHVybiBoaXQ7IH1cbiAgICB9XG5cbiAgICBjb25zdCBqbWRpY3RGdXJpZ2FuYSA9IGF3YWl0IGptZGljdEZ1cmlnYW5hUHJvbWlzZTtcbiAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGptZGljdEZ1cmlnYW5hO1xuXG4gICAgY29uc3QgbGl0ZXJhbEhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGl0ZXJhbCwgJ3JlYWRpbmcnLCBtb3JwaGVtZVRvU3RyaW5nTGl0ZXJhbChtLCBqbWRpY3RGdXJpZ2FuYSkpO1xuICAgIGlmIChsaXRlcmFsSGl0KSB7IHJldHVybiBsaXRlcmFsSGl0LmZ1cmlnYW5hOyB9XG4gICAgY29uc3QgcHJvbnVuY2lhdGlvbkhpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgcHJvbnVuY2lhdGlvbiwgJ3RleHQnLCBbbGl0ZXJhbF0pO1xuICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAvLyBoZWxwIHdpdGgg5LiA5pysL3JlbmRha3VcbiAgICBpZiAobGl0ZXJhbC5sZW5ndGggPT09IDEpIHsgcmV0dXJuIFt7cnVieTogbGl0ZXJhbCwgcnQ6IG1vcnBoZW1lVG9TdHJpbmdMaXRlcmFsKG0pLmpvaW4oJ+ODuycpfV07IH1cblxuICAgIC8vIGZvciBlLmcuIOS9j+OCk3zjgad844GEfOOBvuOBmSBidXQgbm90IOS4gOacrCAocHJvbm91bmNlZCBwb24gYnV0IGxlbW1hPWhvbjogcmVuZGFrdSlcbiAgICAvLyBpZiB5b3UgcmVhY2ggaGVyZSwgdGhlcmUncyBub3RoaW5nIGVuc3VyaW5nIHRoYXQgdGhlIGZ1cmlnYW5hIGZvdW5kIHdpbGwgbWF0Y2ggYHByb251bmNpYXRpb25gIVxuICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKFxuICAgICAgICB0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJyxcbiAgICAgICAgbW9ycGhlbWVUb1N0cmluZ0xpdGVyYWwoe2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWw6IGxlbW1hLCBwcm9udW5jaWF0aW9uOiBsZW1tYVJlYWRpbmd9LCBqbWRpY3RGdXJpZ2FuYSkpO1xuICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgY29uc3QgZnVyaWdhbmFEaWN0OiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICAgICAgZm9yIChjb25zdCBmIG9mIGxlbW1hSGl0LmZ1cmlnYW5hKSB7XG4gICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgZnVyaWdhbmFEaWN0LnNldChmLnJ1YnksIGYucnQpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgbGV0IGthbmppID0gY2hhcnMuZmlsdGVyKGhhc0thbmppKTtcbiAgICAgIGNvbnN0IGFubm90YXRlZENoYXJzOiBGdXJpZ2FuYVtdID0gY2hhcnMuc2xpY2UoKTtcblxuICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICB3aGlsZSAoa2FuamkubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IGhpdCA9IHRyaXUoa2FuamkpLmZpbmQoa3MgPT4gZnVyaWdhbmFEaWN0Lmhhcyhrcy5qb2luKCcnKSkpO1xuICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgY29uc3QgaGl0c3RyID0gaGl0LmpvaW4oJycpO1xuICAgICAgICAgIGNvbnN0IGlkeCA9IGxpdGVyYWwuaW5kZXhPZihoaXRzdHIpO1xuICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgZm9yIChsZXQgaSA9IGlkeCArIDE7IGkgPCBpZHggKyBoaXRzdHIubGVuZ3RoOyBpKyspIHsgYW5ub3RhdGVkQ2hhcnNbaV0gPSAnJzsgfVxuICAgICAgICAgIGthbmppID0ga2Fuamkuc2xpY2UoaGl0c3RyLmxlbmd0aCk7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgLy8gbm8gaGl0IGZvdW5kLCBrYW5qaSB3b24ndCBzaHJpbmsgdG8gZW1wdHksIGJyZWFrIG5vd1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChrYW5qaS5sZW5ndGggPT09IDApIHsgcmV0dXJuIGFubm90YXRlZENoYXJzOyB9XG4gICAgfVxuICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAvLyBpZiAobGVtbWFSZWFkaW5nSGl0KSB7IHJldHVybiBsZW1tYVJlYWRpbmdIaXQuZnVyaWdhbmE7IH1cblxuICAgIC8vIFdlIGNvdWxkbid0IHJlbHkgb24gSk1EaWN0RnVyaWdhbmEgdG8gaGVscCB1cyBvdXQuIFRoZSBiZXN0IHdlIGNhbiBkbyBub3cgaXMgdG8gdXNlIE1lQ2FiJ3MgcGFyc2luZy5cbiAgICAvLyBGb3IgZXhhbXBsZTogbGl0ZXJhbD1cIuW4sOOBo1wiIGFuZCBydD1cIuOBi+OBiOOBo1wiLlxuICAgIHtcbiAgICAgIGNvbnN0IHJ0ID0gbW9ycGhlbWVUb1N0cmluZ0xpdGVyYWwobSlbMF07XG4gICAgICBpZiAocnQgPT09IGxpdGVyYWwpIHsgcmV0dXJuIFtsaXRlcmFsXTsgfVxuXG4gICAgICAvLyBmaW5kIG1hdGNoaW5nIHRleHQgYXQgdGhlIHN0YXJ0IGFuZCBlbmQgb2YgYGxpdGVyYWxgIGFuZCBgcnRgLCBhbmQgcHVsbCB0aGVtIG9mZiBhcyBzdHJpbmdzLlxuICAgICAgY29uc3QgcHJlUG9zdCA9IHByZVBvc3RNYXRjaGVzKGxpdGVyYWwsIHJ0KTtcbiAgICAgIGNvbnN0IHJldCA9IFtwcmVQb3N0LnByZSwge3J1Ynk6IHByZVBvc3QubWlkZGxlQSwgcnQ6IHByZVBvc3QubWlkZGxlQn0sIHByZVBvc3QucG9zdF0uZmlsdGVyKHMgPT4gISFzKTtcbiAgICAgIHJldHVybiByZXQ7XG4gICAgfVxuICB9KSk7XG5cbiAgcmV0dXJuIGZ1cmlnYW5hO1xufVxuZnVuY3Rpb24gcHJlUG9zdE1hdGNoZXMoYTogc3RyaW5nLCBiOiBzdHJpbmcpIHtcbiAgbGV0IHByZSA9ICcnO1xuICBsZXQgcG9zdCA9ICcnO1xuICBpZiAoYSA9PT0gYikgeyByZXR1cm4ge3ByZSwgbWlkZGxlQTogYSwgbWlkZGxlQjogYiwgcG9zdH07IH1cbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgYyA9IGFbaV07XG4gICAgaWYgKGMgIT09IGJbaV0pIHsgYnJlYWs7IH1cbiAgICBwcmUgKz0gYztcbiAgfVxuICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjID0gYVthLmxlbmd0aCAtIDEgLSBpXTtcbiAgICBjb25zdCBjMiA9IGJbYi5sZW5ndGggLSAxIC0gaV07XG4gICAgaWYgKGMgIT09IGMyKSB7IGJyZWFrOyB9XG4gICAgcG9zdCA9IGMgKyBwb3N0O1xuICB9XG4gIGNvbnN0IG1pZGRsZUEgPSBhLnNsaWNlKHByZS5sZW5ndGgsIGEubGVuZ3RoIC0gcG9zdC5sZW5ndGgpO1xuICBjb25zdCBtaWRkbGVCID0gYi5zbGljZShwcmUubGVuZ3RoLCBiLmxlbmd0aCAtIHBvc3QubGVuZ3RoKTtcbiAgcmV0dXJuIHtwcmUsIG1pZGRsZUEsIG1pZGRsZUIsIHBvc3R9O1xufVxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5mdW5jdGlvbiBzZWFyY2gobWFwOiBKbWRpY3RGdXJpZ2FuYVsncmVhZGluZ1RvRW50cnknXSwgZmlyc3Q6IHN0cmluZywgc3ViOiAncmVhZGluZyd8J3RleHQnLFxuICAgICAgICAgICAgICAgIHBvc3NpYmxlU2Vjb25kczogc3RyaW5nW10pOiBFbnRyeXx1bmRlZmluZWQge1xuICBjb25zdCBoaXQgPSBtYXAuZ2V0KGZpcnN0KTtcbiAgaWYgKGhpdCkge1xuICAgIC8vIGNvbnN0IHBvc3NpYmxlU2Vjb25kcyA9IGZpbmRBbHRlcm5hdGl2ZUNob3VvbnB1KGthdGEyaGlyYShzZWNvbmQpKTtcbiAgICBjb25zdCBzdWJoaXQgPSBoaXQuZmluZChlID0+IHtcbiAgICAgIGNvbnN0IGRpY3QgPSBrYXRhMmhpcmEoZVtzdWJdKTtcbiAgICAgIHJldHVybiBwb3NzaWJsZVNlY29uZHMuc29tZShzZWNvbmQgPT4gc2Vjb25kID09PSBkaWN0KTtcbiAgICB9KTtcbiAgICBpZiAoc3ViaGl0KSB7IHJldHVybiBzdWJoaXQ7IH1cbiAgICBjb25zb2xlLmVycm9yKGBmb3VuZCBoaXQgZm9yICR7Zmlyc3R9IGJ1dCBub3QgJHtwb3NzaWJsZVNlY29uZHN9YCwge2hpdCwgcG9zc2libGVTZWNvbmRzfSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZnVyaWdhbmFUb1J1YnkoZnM6IEZ1cmlnYW5hW10pOiBzdHJpbmcge1xuICBjb25zdCBydWJpZXNUb0h0bWwgPSAodjogUnVieVtdKSA9PlxuICAgICAgdi5sZW5ndGggPyBgPHJ1Ynk+JHt2Lm1hcChvID0+IG8ucnVieSkuam9pbignJyl9PHJ0PiR7di5tYXAobyA9PiBvLnJ0KS5qb2luKCcnKX08L3J0PjwvcnVieT5gIDogJyc7XG4gIC8vIGNvbGxhcHNlIGFkamFjZW50IDxydWJ5PiB0YWdzIGludG8gb25lIHNvIG1hY09TIHNlbGVjdGlvbiBvbiByZXN1bHRpbmcgSFRNTCB3b3JrczogdW5kbyBKTURpY3QtRnVyaWdhbmEgPHNhZD5cbiAgY29uc3QgcmV0ID0gZnMucmVkdWNlKCh7c3RyaW5nU29GYXIsIHJ1Ymllc1NvRmFyfSwgY3VycikgPT5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgY3VyciA9PT0gJ29iamVjdCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyB7c3RyaW5nU29GYXIsIHJ1Ymllc1NvRmFyOiBydWJpZXNTb0Zhci5jb25jYXQoY3Vycil9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDoge3N0cmluZ1NvRmFyOiBzdHJpbmdTb0ZhciArIHJ1Ymllc1RvSHRtbChydWJpZXNTb0ZhcikgKyBjdXJyLCBydWJpZXNTb0ZhcjogW119LFxuICAgICAgICAgICAgICAgICAgICAgICAge3N0cmluZ1NvRmFyOiAnJywgcnViaWVzU29GYXI6IFtdIGFzIFJ1YnlbXX0pO1xuICByZXR1cm4gcmV0LnN0cmluZ1NvRmFyICsgcnViaWVzVG9IdG1sKHJldC5ydWJpZXNTb0Zhcik7XG59XG5cbi8vIG1ha2Ugc3VyZSBmdXJpZ2FuYSdzIHJ1YnlzIGFyZSB2ZXJiYXRpbSB0aGUgc2VudGVuY2VcbmZ1bmN0aW9uIGNoZWNrRnVyaWdhbmEoc2VudGVuY2U6IHN0cmluZywgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSk6IEZ1cmlnYW5hW11bXSB7XG4gIGNvbnN0IHJ1YnlzID0gZmxhdHRlbihmdXJpZ2FuYSkubWFwKHRvcnVieSk7XG4gIGlmIChydWJ5cy5qb2luKCcnKS5sZW5ndGggPj0gc2VudGVuY2UubGVuZ3RoKSB7IHJldHVybiBmdXJpZ2FuYTsgfVxuICAvLyB3aGl0ZXNwYWNlIG9yIHNvbWUgb3RoZXIgY2hhcmFjdGVyIHdhcyBzdHJpcHBlZC4gYWRkIGl0IGJhY2shXG4gIGxldCBzdGFydCA9IDA7XG4gIGxldCByZXQ6IEZ1cmlnYW5hW11bXSA9IFtdO1xuICBmb3IgKGNvbnN0IGZzIG9mIGZ1cmlnYW5hKSB7XG4gICAgY29uc3QgY2h1bmsgPSBmcy5tYXAodG9ydWJ5KS5qb2luKCcnKTtcbiAgICBjb25zdCBoaXQgPSBzZW50ZW5jZS5pbmRleE9mKGNodW5rLCBzdGFydCk7XG4gICAgaWYgKGhpdCA8IDApIHsgdGhyb3cgbmV3IEVycm9yKCdjYW5ub3QgZmluZDogJyArIGNodW5rKTsgfVxuICAgIHJldC5wdXNoKGhpdCA+IHN0YXJ0ID8gW3NlbnRlbmNlLnNsaWNlKHN0YXJ0LCBoaXQpLCAuLi5mc10gOiBmcyk7XG4gICAgLy8gcHJlcGVuZGluZyB0aGUgaG9sZXMgbGlrZSB0aGlzIHdpbGwga2VlcCB0aGUgc2FtZSBudW1iZXIgb2YgbW9ycGhlbWVzIGluIGBmdXJpZ2FuYWBcbiAgICBzdGFydCA9IGhpdCArIGNodW5rLmxlbmd0aDtcbiAgfVxuICByZXR1cm4gcmV0O1xufVxuZnVuY3Rpb24gdG9ydWJ5KGY6IEZ1cmlnYW5hKSB7IHJldHVybiB0eXBlb2YgZiA9PT0gJ3N0cmluZycgPyBmIDogZi5ydWJ5OyB9XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhbmFseXplU2VudGVuY2Uoc2VudGVuY2U6IHN0cmluZyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3ZlcnJpZGVzOiBQYXJ0aWFsPFJlY29yZDxzdHJpbmcsIEZ1cmlnYW5hW10+PiA9IHt9KTogUHJvbWlzZTxBbmFseXNpc1Jlc3VsdD4ge1xuICBjb25zdCBwYXJzZWQgPSBhd2FpdCBtZWNhYkpkZXBwKHNlbnRlbmNlKTtcblxuICAvLyBQcm9taXNlc1xuICBjb25zdCBmdXJpZ2FuYVAgPSBoYXNLYW5qaShzZW50ZW5jZSkgPyBtb3JwaGVtZXNUb0Z1cmlnYW5hKHNlbnRlbmNlLCBwYXJzZWQubW9ycGhlbWVzLCBvdmVycmlkZXMpIDogdW5kZWZpbmVkO1xuICBjb25zdCBwYXJ0aWNsZXNDb25qcGhyYXNlc1AgPSBpZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKTtcbiAgY29uc3QgZGljdGlvbmFyeUhpdHNQID0gZW51bWVyYXRlRGljdGlvbmFyeUhpdHMocGFyc2VkLm1vcnBoZW1lcyk7XG5cbiAgbGV0IFtmdXJpZ2FuYSwgcGFydGljbGVzQ29uanBocmFzZXMsIGRpY3Rpb25hcnlIaXRzXSA9XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChbZnVyaWdhbmFQLCBwYXJ0aWNsZXNDb25qcGhyYXNlc1AsIGRpY3Rpb25hcnlIaXRzUF0pO1xuICByZXR1cm4ge2Z1cmlnYW5hLCBwYXJ0aWNsZXNDb25qcGhyYXNlcywgZGljdGlvbmFyeUhpdHN9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2NvcmVIaXRzVG9Xb3JkcyhoaXRzOiBTY29yZUhpdFtdKSB7XG4gIGNvbnN0IHtkYn0gPSBhd2FpdCBqbWRpY3RQcm9taXNlO1xuICByZXR1cm4gaWRzVG9Xb3JkcyhkYiwgaGl0cy5tYXAobyA9PiBvLndvcmRJZCkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0VGFncygpIHsgcmV0dXJuIGptZGljdFByb21pc2UudGhlbigoe2RifSkgPT4gZ2V0VGFnc0RiKGRiKSkgfVxuXG5leHBvcnQgZnVuY3Rpb24gY29udGV4dENsb3plVG9TdHJpbmcoYzogQ29udGV4dENsb3plKTogc3RyaW5nIHtcbiAgcmV0dXJuIChjLmxlZnQgfHwgYy5yaWdodCkgPyBgJHtjLmxlZnR9WyR7Yy5jbG96ZX1dJHtjLnJpZ2h0fWAgOiBjLmNsb3plO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGNvbnRleHRDbG96ZU9yU3RyaW5nVG9TdHJpbmcoYzogQ29udGV4dENsb3plfHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB0eXBlb2YgYyA9PT0gJ3N0cmluZycgPyBjIDogY29udGV4dENsb3plVG9TdHJpbmcoYyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaW5lc1RvQ3VydGl6TWFya2Rvd24obGluZXM6IHN0cmluZ1tdKSB7XG4gIGNvbnN0IHJldDogc3RyaW5nW10gPSBbXTtcblxuICBjb25zdCB7ZGJ9ID0gYXdhaXQgam1kaWN0UHJvbWlzZTtcbiAgY29uc3QgdGFnczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IEpTT04ucGFyc2UoYXdhaXQgZ2V0RmllbGQoZGIsICd0YWdzJykpO1xuXG4gIGNvbnN0IE1BWF9MSU5FUyA9IDg7XG4gIGNvbnN0IG92ZXJyaWRlczogUmVjb3JkPHN0cmluZywgRnVyaWdhbmFbXT4gPSB7fTtcbiAgY29uc3Qgc3RhcnRSZWdleHAgPSAvXi1cXHMrQFxccysvO1xuICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICBpZiAoIXN0YXJ0UmVnZXhwLnRlc3QobGluZSkpIHtcbiAgICAgIHJldC5wdXNoKGxpbmUpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHNlbnRlbmNlID0gbGluZS5zbGljZShsaW5lLm1hdGNoKHN0YXJ0UmVnZXhwKT8uWzBdLmxlbmd0aCk7XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IGFuYWx5emVTZW50ZW5jZShzZW50ZW5jZSwgb3ZlcnJpZGVzKTtcbiAgICByZXQucHVzaChyZXN1bHRzLmZ1cmlnYW5hID8gJy0gQCAnICsgcmVzdWx0cy5mdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1J1YnkpLmpvaW4oJycpIDogbGluZSk7XG5cbiAgICB7XG4gICAgICBpZiAocmVzdWx0cy5wYXJ0aWNsZXNDb25qcGhyYXNlcy5wYXJ0aWNsZXMuc2l6ZSkge1xuICAgICAgICByZXQucHVzaCgnICAtIFBhcnRpY2xlcycpO1xuICAgICAgICBmb3IgKGNvbnN0IFtfLCBjbG96ZV0gb2YgcmVzdWx0cy5wYXJ0aWNsZXNDb25qcGhyYXNlcy5wYXJ0aWNsZXMpIHtcbiAgICAgICAgICByZXQucHVzaChcbiAgICAgICAgICAgICAgYCAgICAtICR7Y2xvemUubGVmdH0ke2Nsb3plLmxlZnQgfHwgY2xvemUucmlnaHQgPyAnWycgKyBjbG96ZS5jbG96ZSArICddJyA6IGNsb3plLmNsb3plfSR7Y2xvemUucmlnaHR9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChyZXN1bHRzLnBhcnRpY2xlc0NvbmpwaHJhc2VzLmNvbmp1Z2F0ZWRQaHJhc2VzLnNpemUpIHtcbiAgICAgICAgcmV0LnB1c2goJyAgLSBDb25qdWdhdGVkIHBocmFzZXMnKTtcbiAgICAgICAgZm9yIChjb25zdCBbXywgY10gb2YgcmVzdWx0cy5wYXJ0aWNsZXNDb25qcGhyYXNlcy5jb25qdWdhdGVkUGhyYXNlcykge1xuICAgICAgICAgIGNvbnN0IGNsb3plID0gYy5jbG96ZTtcbiAgICAgICAgICByZXQucHVzaChgICAgIC0gJHtjb250ZXh0Q2xvemVUb1N0cmluZyhjbG96ZSl9IHwgJHtjLmxlbW1hcy5tYXAoZnVyaWdhbmFUb1J1YnkpLmpvaW4oJyArICcpfWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHtcbiAgICAgIHJldC5wdXNoKCcgIC0gVm9jYWInKTtcbiAgICAgIGZvciAoY29uc3QgZnJvbVN0YXJ0IG9mIHJlc3VsdHMuZGljdGlvbmFyeUhpdHMpIHtcbiAgICAgICAgZm9yIChjb25zdCBmcm9tRW5kIG9mIGZyb21TdGFydC5yZXN1bHRzKSB7XG4gICAgICAgICAgcmV0LnB1c2goYCAgLSBWb2NhYjogJHtjb250ZXh0Q2xvemVPclN0cmluZ1RvU3RyaW5nKGZyb21FbmQucnVuKX0gSU5GT2ApO1xuICAgICAgICAgIGNvbnN0IGhpdHMgPSBmcm9tRW5kLnJlc3VsdHMuc2xpY2UoMCwgTUFYX0xJTkVTKTtcbiAgICAgICAgICBjb25zdCB3b3JkcyA9IGF3YWl0IHNjb3JlSGl0c1RvV29yZHMoaGl0cyk7XG4gICAgICAgICAgZm9yIChjb25zdCBbd2ksIHddIG9mIHdvcmRzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgcmV0LnB1c2goJyAgICAtICcgKyBoaXRzW3dpXS5zZWFyY2ggKyAnIHwgJyArIGRpc3BsYXlXb3JkTGlnaHQodywgdGFncykpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZnJvbUVuZC5yZXN1bHRzLmxlbmd0aCA+IE1BWF9MSU5FUykge1xuICAgICAgICAgICAgcmV0LnB1c2goYCAgICAtICjigKYgJHtmcm9tRW5kLnJlc3VsdHMubGVuZ3RoIC0gTUFYX0xJTkVTfSBvbWl0dGVkKSBJTkZPYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbi8vIFJGQyA0NjQ4IMKnNTogYmFzZTY0dXJsXG5mdW5jdGlvbiBiYXNlNjRfdG9fYmFzZTY0dXJsKGJhc2U2NDogc3RyaW5nKSB7XG4gIHJldHVybiBiYXNlNjQucmVwbGFjZSgvXFwvL2csICdfJykucmVwbGFjZSgvXFwrL2csICctJykucmVwbGFjZSgvPSskL2csICcnKTtcbn1cbmFzeW5jIGZ1bmN0aW9uIGZpbGVFeGlzdHMoZmlsZTogc3RyaW5nKSB7IHJldHVybiBwZnMuYWNjZXNzKGZpbGUpLnRoZW4oKCkgPT4gdHJ1ZSkuY2F0Y2goKCkgPT4gZmFsc2UpOyB9XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaW5lc1RvRnVyaWdhbmEobGluZXM6IHN0cmluZ1tdLCBidWlsZERpY3Rpb25hcnkgPSBmYWxzZSkge1xuICBjb25zdCB7ZGJ9ID0gYXdhaXQgam1kaWN0UHJvbWlzZTtcbiAgY29uc3QgdGFnczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IEpTT04ucGFyc2UoYXdhaXQgZ2V0RmllbGQoZGIsICd0YWdzJykpO1xuXG4gIGNvbnN0IHJldDogc3RyaW5nW10gPSBbXTtcbiAgY29uc3Qgb3ZlcnJpZGVzOiBSZWNvcmQ8c3RyaW5nLCBGdXJpZ2FuYVtdPiA9IHt9O1xuXG4gIGNvbnN0IHBhcmVudERpciA9IHByb2Nlc3MuY3dkKCkgKyAnL2RpY3QtaGl0cy1wZXItbGluZSc7XG4gIGF3YWl0IG1rZGlycChwYXJlbnREaXIpO1xuXG4gIC8vIHRoaXMgd2lsbCBnZXQgd3JpdHRlbiB0byBkaXNrXG4gIGNvbnN0IGxpZ2h0d2VpZ2h0OiAoc3RyaW5nfHtsaW5lOiBzdHJpbmcsIGhhc2g6IHN0cmluZywgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXX0pW10gPSBbXTtcbiAgY29uc3QgdG90YWxIYXNoID0gY3JlYXRlSGFzaCgnbWQ1Jyk7XG5cbiAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgdG90YWxIYXNoLnVwZGF0ZShsaW5lKTsgLy8gd2UnbGwgdXNlIHRoaXMgdG8gc2F2ZSBzb21lIGxpZ2h0d2VpZ2h0IGRhdGEgYWJvdXQgZWFjaCBsaW5lIGluIHRoaXMgbGlzdCBvZiBgbGluZXNgXG5cbiAgICBpZiAoIWhhc0thbmppKGxpbmUpICYmICFoYXNLYW5hKGxpbmUpKSB7XG4gICAgICByZXQucHVzaChsaW5lKTtcbiAgICAgIGxpZ2h0d2VpZ2h0LnB1c2gobGluZSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29uc3QgcGFyc2VkID0gYXdhaXQgbWVjYWJKZGVwcChsaW5lKTtcbiAgICBjb25zdCBmdXJpZ2FuYSA9IGF3YWl0IG1vcnBoZW1lc1RvRnVyaWdhbmEobGluZSwgcGFyc2VkLm1vcnBoZW1lcywgb3ZlcnJpZGVzKTtcbiAgICBjb25zdCBsaW5lSGFzaCA9IGJhc2U2NF90b19iYXNlNjR1cmwoY3JlYXRlSGFzaCgnbWQ1JykudXBkYXRlKGxpbmUpLmRpZ2VzdCgnYmFzZTY0JykpO1xuICAgIHJldC5wdXNoKGA8bGluZSBpZD1cImhhc2gtJHtsaW5lSGFzaH1cIj5gICsgZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9SdWJ5KS5qb2luKCcnKSArICc8L2xpbmU+Jyk7XG4gICAgbGlnaHR3ZWlnaHQucHVzaCh7bGluZSwgaGFzaDogbGluZUhhc2gsIGZ1cmlnYW5hfSk7XG5cbiAgICBpZiAoYnVpbGREaWN0aW9uYXJ5KSB7XG4gICAgICBjb25zdCBzaWRlY2FyRmlsZSA9IGAke3BhcmVudERpcn0vbGluZS0ke2xpbmVIYXNofS5qc29uYDtcbiAgICAgIGlmICghKGF3YWl0IGZpbGVFeGlzdHMoc2lkZWNhckZpbGUpKSkge1xuICAgICAgICBjb25zdCBkaWN0SGl0cyA9IGF3YWl0IGVudW1lcmF0ZURpY3Rpb25hcnlIaXRzKHBhcnNlZC5tb3JwaGVtZXMsIGZhbHNlLCAxMCk7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZGljdEhpdHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBmb3IgKGxldCBqID0gMDsgaiA8IGRpY3RIaXRzW2ldLnJlc3VsdHMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgIGNvbnN0IHdvcmRzID0gYXdhaXQgc2NvcmVIaXRzVG9Xb3JkcyhkaWN0SGl0c1tpXS5yZXN1bHRzW2pdLnJlc3VsdHMpO1xuICAgICAgICAgICAgZm9yIChsZXQgayA9IDA7IGsgPCB3b3Jkcy5sZW5ndGg7IGsrKykge1xuICAgICAgICAgICAgICBkaWN0SGl0c1tpXS5yZXN1bHRzW2pdLnJlc3VsdHNba10uc3VtbWFyeSA9IGRpc3BsYXlXb3JkTGlnaHQod29yZHNba10sIHRhZ3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBwZnMud3JpdGVGaWxlKHNpZGVjYXJGaWxlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHtsaW5lLCBmdXJpZ2FuYSwgYnVuc2V0c3VzOiBwYXJzZWQuYnVuc2V0c3VzLCBkaWN0SGl0c30sIG51bGwsIDEpKTtcbiAgICAgICAgLy8gd2Ugc2hvdWxkIHB1dCB0aGlzIGJsb2NrIGluIGEgcHJvbWlzZSBhbmQgYXdhaXQgYWxsIHN1Y2ggcHJvbWlzZXMgYmVmb3JlIHJldHVybmluZywgdG8gZ2V0IG1vcmUgdGhyb3VnaHB1dFxuICAgICAgICAvLyAod2UnZCBpbnRlcmxlYXZlIGNvbXB1dGF0aW9uIGJldHdlZW4gTGV2ZWxEQi9kaXNrIGkvbylcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAge1xuICAgIGNvbnN0IHRvdGFsID0gYmFzZTY0X3RvX2Jhc2U2NHVybCh0b3RhbEhhc2guZGlnZXN0KCdiYXNlNjQnKSk7XG4gICAgYXdhaXQgcGZzLndyaXRlRmlsZShgJHtwYXJlbnREaXJ9L2xpZ2h0d2VpZ2h0LSR7dG90YWx9Lmpzb25gLCBKU09OLnN0cmluZ2lmeShsaWdodHdlaWdodCwgbnVsbCwgMSkpO1xuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmlmIChtb2R1bGUgPT09IHJlcXVpcmUubWFpbikge1xuICBjb25zdCBVU0FHRSA9IGBVU0FHRTpcblxuYW5ub3RhdGUgTU9ERSBmaWxlMSBmaWxlMlxuXG5NT0RFIG11c3QgYmUgb25lIG9mOlxuLSBcImZ1cmlnYW5hXCI6IGFkZCBmdXJpZ2FuYSB0byBrYW5qaSAoZGVmYXVsdClcbi0gXCJmdXJpZ2FuYS1kaWN0XCI6IHNhbWUgYXMgXCJmdXJpZ2FuYVwiIGJ1dCBhbHNvIGVtaXQgbW9ycGhlbWUvZGljdGlvbmFyeSBpbmZvcm1hdGlvblxuLSBcIm1hcmtkb3duXCI6IG91dHB1dCBkZXRhaWxlZCBicmVha2Rvd25zIG9mIHRleHQgaW4gZmlsZXNcblxuSW5wdXQgc3RyZWFtcyBhcmUgYWxzbyB1bmRlcnN0b29kOlxuXG5hbm5vdGF0ZSBNT0RFIDwgaW5wdXRmaWxlXG5cbmNhdCBpbnB1dGZpbGUgfCBhbm5vdGF0ZSBNT0RFXG5gO1xuICBlbnVtIE1vZGUge1xuICAgIG1hcmtkb3duID0gJ21hcmtkb3duJyxcbiAgICBmdXJpZ2FuYSA9ICdmdXJpZ2FuYScsXG4gICAgZnVyaWdhbmFEaWN0ID0gJ2Z1cmlnYW5hLWRpY3QnLFxuICB9XG5cbiAgKGFzeW5jICgpID0+IHtcbiAgICBsZXQgbGluZXMgPSBgLSBAIOS7iuaXpeOBr+iJr+OBhOWkqeawl+OBoOOAglxuXG4tIEAg44Gf44Gu44GX44GE44Gn44GZ44GL44CCXG5cbi0gQCDkvZXjgafjgY3jgZ/vvJ9gLnNwbGl0KCdcXG4nKTtcbiAgICBjb25zdCBbLCAsIHJlcXVlc3RlZE1vZGUsIC4uLmZpbGVzXSA9IHByb2Nlc3MuYXJndjtcbiAgICBpZiAoIU9iamVjdC52YWx1ZXMoTW9kZSkuaW5jbHVkZXMocmVxdWVzdGVkTW9kZSBhcyBhbnkpKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFVTQUdFKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgY29uc3QgbW9kZSA9IHJlcXVlc3RlZE1vZGUgYXMgTW9kZTtcblxuICAgIGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG5cbiAgICAgIC8vIG5vIGFyZ3VtZW50cywgcmVhZCBmcm9tIHN0ZGluLiBJZiBzdGRpbiBpcyBlbXB0eSwgdXNlIGRlZmF1bHQuXG4gICAgICBjb25zdCByYXcgPSAoYXdhaXQgZ2V0U3RkaW4oKSkudHJpbSgpO1xuICAgICAgaWYgKHJhdykgeyBsaW5lcyA9IHJhdy5zcGxpdCgnXFxuJyk7IH1cbiAgICB9IGVsc2Uge1xuICAgICAgbGluZXMgPSBmbGF0bWFwKGF3YWl0IFByb21pc2UuYWxsKGZpbGVzLm1hcChmID0+IHBmcy5yZWFkRmlsZShmLCAndXRmOCcpKSksXG4gICAgICAgICAgICAgICAgICAgICAgcyA9PiBzLnRyaW0oKS5yZXBsYWNlKC9cXHIvZywgJycpLnNwbGl0KCdcXG4nKSk7XG4gICAgfVxuXG4gICAgaWYgKG1vZGUgPT09IE1vZGUuZnVyaWdhbmEpIHtcbiAgICAgIGNvbnNvbGUubG9nKChhd2FpdCBsaW5lc1RvRnVyaWdhbmEobGluZXMsIGZhbHNlKSkuam9pbignXFxuJykpO1xuICAgIH0gZWxzZSBpZiAobW9kZSA9PT0gTW9kZS5mdXJpZ2FuYURpY3QpIHtcbiAgICAgIGNvbnNvbGUubG9nKChhd2FpdCBsaW5lc1RvRnVyaWdhbmEobGluZXMsIHRydWUpKS5qb2luKCdcXG4nKSk7XG4gICAgfSBlbHNlIGlmIChtb2RlID09PSBNb2RlLm1hcmtkb3duKSB7XG4gICAgICBjb25zb2xlLmxvZygoYXdhaXQgbGluZXNUb0N1cnRpek1hcmtkb3duKGxpbmVzKSkuam9pbignXFxuJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBfOiBuZXZlciA9IG1vZGU7XG4gICAgfVxuICB9KSgpO1xufVxuIl19