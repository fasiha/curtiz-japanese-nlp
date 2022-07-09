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
const kamiya_codec_1 = require("kamiya-codec");
const mkdirp_1 = __importDefault(require("mkdirp"));
const chino_particles_1 = require("./chino-particles");
const jdepp_1 = require("./jdepp");
const mecabUnidic_1 = require("./mecabUnidic");
var jmdict_furigana_node_2 = require("jmdict-furigana-node");
exports.furiganaToString = jmdict_furigana_node_2.furiganaToString;
exports.setupJmdictFurigana = jmdict_furigana_node_2.setup;
var jmdict_simplified_node_2 = require("jmdict-simplified-node");
exports.getField = jmdict_simplified_node_2.getField;
exports.jmdictFuriganaPromise = jmdict_furigana_node_1.setup(process.env['JMDICT_FURIGANA']);
exports.jmdictPromise = jmdict_simplified_node_1.setup(process.env['JMDICT_SIMPLIFIED_LEVELDB'] || 'jmdict-simplified', process.env['JMDICT_SIMPLIFIED_JSON'] || 'jmdict-eng-3.1.0.json', true, true);
/**
 * Without this limit on how many Leveldb hits jmdict-simplified-node will get, things slow way down. Not much loss in
 * usefulness with this set to 20.
 */
const DICTIONARY_LIMIT = 20;
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
                    const readingSubhits = yield Promise.all(readingSearches.map(search => jmdict_simplified_node_1.readingBeginning(db, search, DICTIONARY_LIMIT)));
                    scored = helperSearchesHitsToScored(readingSearches, readingSubhits, 'kana');
                }
                // Search literals if needed, this works around MeCab mis-readings like お父さん->おちちさん
                {
                    const kanjiSearches = forkingPaths(run.map(m => m.searchKanji)).map(v => v.join('')).filter(curtiz_utils_1.hasKanji);
                    const kanjiSubhits = yield Promise.all(kanjiSearches.map(search => jmdict_simplified_node_1.kanjiBeginning(db, search, DICTIONARY_LIMIT)));
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
function betterMorphemePredicate(m) {
    return !(m.partOfSpeech[0] === 'supplementary_symbol') && !(m.partOfSpeech[0] === 'particle');
}
function morphemesToConjPhrases(startIdx, goodBunsetsu, fullCloze, verbose = false) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const endIdx = startIdx + goodBunsetsu.length;
        const cloze = bunsetsuToString(goodBunsetsu);
        const jf = yield exports.jmdictFuriganaPromise;
        const lemmas = goodBunsetsu.map(o => {
            const entries = jf.textToEntry.get(o.lemma) || [];
            const lemmaReading = curtiz_utils_1.kata2hira(o.lemmaReading);
            const entry = entries.find(e => e.reading === lemmaReading);
            return entry ? entry.furigana : o.lemma === lemmaReading ? [lemmaReading] : [{ ruby: o.lemma, rt: lemmaReading }];
        });
        const ret = { deconj: [], startIdx, endIdx, morphemes: goodBunsetsu, cloze: fullCloze, lemmas };
        const first = goodBunsetsu[0];
        const pos0 = first.partOfSpeech[0];
        const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1];
        const verbNotAdj = pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0Last === 'verbal_suru';
        const ichidan = (_a = first.inflectionType) === null || _a === void 0 ? void 0 : _a[0].includes('ichidan');
        const iAdj = pos0.endsWith('adjective_i');
        const deconjs = [];
        for (const mergeSuffixes of [true, false]) {
            // sometimes the lemma is too helpful: "ワンダフル-wonderful", so split on dash
            let dictionaryForm = goodBunsetsu[0].lemma.split('-')[0];
            if (mergeSuffixes) {
                const nonSuffixIdx = goodBunsetsu.findIndex((m, i) => i > 0 && m.partOfSpeech[0] !== 'suffix');
                if (nonSuffixIdx >= 1) {
                    dictionaryForm += goodBunsetsu.slice(1, nonSuffixIdx).map(m => m.lemma.split('-')[0]).join('');
                }
            }
            // Often the literal cloze will have fewer kanji than the lemma
            if (cloze.split('').filter(curtiz_utils_1.hasKanji).length !== dictionaryForm.split('').filter(curtiz_utils_1.hasKanji).length) {
                // deconjugate won't find anything. Look at lemmas and try to kana-ify the dictionaryForm
                for (const lemma of lemmas.flat()) {
                    if (typeof lemma === 'string') {
                        continue;
                    }
                    const { ruby, rt } = lemma;
                    // Replace the kanji in the dictionary form if it's not in the literal cloze
                    if (!cloze.includes(ruby)) {
                        dictionaryForm = dictionaryForm.replace(ruby, rt);
                    }
                }
            }
            if (verbose) {
                console.log('? ', { verbNotAdj, ichidan, iAdj, dictionaryForm, cloze });
            }
            const deconj = verbNotAdj ? kamiya_codec_1.verbDeconjugate(cloze, dictionaryForm, ichidan) : kamiya_codec_1.adjDeconjugate(cloze, dictionaryForm, iAdj);
            if (deconj.length) {
                deconjs.push(...deconj);
            }
        }
        ret.deconj = uniqueKey(deconjs, x => {
            if ('auxiliaries' in x) {
                return x.auxiliaries.join('/') + x.conjugation + x.result.join('/');
            }
            return x.conjugation + x.result.join('/');
        });
        return ret;
    });
}
function uniqueKey(v, key) {
    const ys = new Set();
    const ret = [];
    for (const x of v) {
        const y = key(x);
        if (ys.has(y)) {
            continue;
        }
        ys.add(y);
        ret.push(x);
    }
    return ret;
}
// Find clozes: particles and conjugated verb/adjective phrases
function identifyFillInBlanks(bunsetsus, verbose = false) {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const sentence = bunsetsus.map(bunsetsuToString).join('');
        const conjugatedPhrases = [];
        const particles = [];
        for (const [bidx, bunsetsu] of bunsetsus.entries()) {
            const startIdx = bunsetsus.slice(0, bidx).map(o => o.length).reduce((p, c) => p + c, 0);
            // sometimes the first morpheme might be ご・お "prefix".
            const first = bunsetsu[0];
            if (!first) {
                continue;
            }
            const firstQuestionableIdx = bunsetsu.findIndex(m => !betterMorphemePredicate(m));
            const ignoreRight = firstQuestionableIdx === -1 ? [] : bunsetsu.slice(firstQuestionableIdx);
            const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
            // we usually want to strip bad morphemes on the right (`ignoreRight`) but sometimes we don't do a good job, e.g.,
            // MeCab thinks 急いで's で is a particle and we would ignore it, even though it's part of the Vte form.
            // So we loop over those bad morphemes just in case the deconjugator finds something.
            for (let questionableIdx = 0; questionableIdx <= ignoreRight.length; ++questionableIdx) {
                const goodBunsetsu = bunsetsu.slice(0, bunsetsu.length - ignoreRight.length + questionableIdx);
                if (verbose) {
                    console.log('g', goodBunsetsu.map(o => o.literal).join(' '));
                }
                const pos0 = first.partOfSpeech[0];
                const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1];
                /*
                If a bunsetsu has >1 morphemes, check if it's a verb or an adjective (i or na).
                If it's just one, make sure it's an adjective that's not a conclusive (catches 朝早く)
                */
                if ((goodBunsetsu.length === 1 && pos0.startsWith('adjectiv') &&
                    (((_a = first.inflection) === null || _a === void 0 ? void 0 : _a[0]) ? !first.inflection[0].endsWith('conclusive') : true)) ||
                    (goodBunsetsu.length > 0 && (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject') ||
                        pos0Last === 'verbal_suru' || pos0Last.startsWith('adjectival')))) {
                    const middle = bunsetsuToString(goodBunsetsu);
                    const right = sentence.slice(left.length + middle.length);
                    const cloze = generateContextClozed(left, middle, right);
                    const res = yield morphemesToConjPhrases(startIdx, goodBunsetsu, cloze);
                    if (verbose) {
                        console.log('^ found', res.deconj);
                    }
                    if (res.deconj.length === 0 && questionableIdx > 0) {
                        continue;
                    }
                    conjugatedPhrases.push(res);
                }
            }
            // We're not done with conjugated phrases yet. JDepP packs da/desu into the preceding bunsetsu,
            // which prevents the deconjugator from finding them. It'll also do something similar for noun+suru,
            // or any verb really (それは昨日のことちゃった, JDepP makes `ことちゃった` as a bunsetsu)
            const copulaIdx = bunsetsu.findIndex(m => {
                const [a = '', b = ''] = m.inflectionType || [];
                return (a.startsWith('aux') && (b.startsWith('desu') || b.startsWith('da'))) || m.lemma === '為る' ||
                    m.partOfSpeech[0].includes('verb');
            });
            if (copulaIdx > 0) {
                // copula found with something to its left
                const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(bunsetsu.slice(0, copulaIdx));
                for (let questionableIdx = copulaIdx + 1; questionableIdx <= bunsetsu.length; ++questionableIdx) {
                    const goodBunsetsu = bunsetsu.slice(copulaIdx, questionableIdx);
                    if (verbose) {
                        console.log('g2', goodBunsetsu.map(o => o.literal).join(' '));
                    }
                    const middle = bunsetsuToString(goodBunsetsu);
                    const right = sentence.slice(left.length + middle.length);
                    const cloze = generateContextClozed(left, middle, right);
                    const res = yield morphemesToConjPhrases(startIdx + copulaIdx, goodBunsetsu, cloze);
                    if (res.deconj.length) {
                        conjugatedPhrases.push(res);
                    }
                }
            }
            // Handle particles: identify and look up in Chino's "All About Particles" list
            const particlePredicate = (p) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1;
            for (const [pidx, particle] of bunsetsu.entries()) {
                if (particlePredicate(particle)) {
                    const startIdxParticle = startIdx + pidx;
                    const endIdx = startIdxParticle + 1;
                    const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(bunsetsu.slice(0, pidx));
                    const right = bunsetsuToString(bunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
                    const cloze = generateContextClozed(left, particle.literal, right);
                    const chino = chino_particles_1.lookup(cloze.cloze);
                    if (particle.literal !== particle.lemma) {
                        const chinoLemma = chino_particles_1.lookup(particle.lemma);
                        for (const [chinoNum, chinoStr] of chinoLemma) {
                            if (!chino.find(([c]) => c === chinoNum)) {
                                chino.push([chinoNum, chinoStr]);
                            }
                        }
                    }
                    particles.push({ chino, cloze, startIdx: startIdxParticle, endIdx, morphemes: [particle] });
                }
            }
        }
        // Try to glue adjacent particles together if they are in Chino's list of particles too
        const allMorphemes = bunsetsus.flat();
        for (let i = 0; i < particles.length; i++) {
            // `4` below means we'll try to glue 3 particles together
            // `j<=...` has to be `<=` because `j` will be `slice`'s 2nd arg and is exclusive (not inclusive)
            for (let j = i + 2; (j < i + 4) && (j <= particles.length); j++) {
                const adjacent = particles.slice(i, j);
                if (!adjacent.every((curr, idx, arr) => arr[idx + 1] ? curr.endIdx === arr[idx + 1].startIdx : true)) {
                    // `adjacent` isn't actually adjacent
                    continue;
                }
                const combined = adjacent.map(o => o.cloze.cloze).join('');
                const hits = chino_particles_1.lookup(combined);
                if (hits.length) {
                    const first = adjacent[0];
                    const last = adjacent[adjacent.length - 1];
                    const left = bunsetsuToString(allMorphemes.slice(0, first.startIdx));
                    const right = bunsetsuToString(allMorphemes.slice(last.endIdx));
                    const cloze = generateContextClozed(left, combined, right);
                    particles.push({
                        chino: hits,
                        cloze,
                        startIdx: first.startIdx,
                        endIdx: last.endIdx,
                        morphemes: adjacent.flatMap(o => o.morphemes)
                    });
                }
            }
        }
        return { particles, conjugatedPhrases };
    });
}
exports.identifyFillInBlanks = identifyFillInBlanks;
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
        if (m.literal === m.lemma) {
            return [m.literal];
        }
        // sometimes, e.g., `テンション、ひくっ`, literal=ひくっ but lemma=ひく and we want to look up the lemma
        return [m.literal, m.lemma];
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
    // In these markdown-like tables, the columns folow mecabUnidic.ts, and are:
    // | literal | pronunciation | lemma reading| lemma |
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
            // For example: literal="帰っ" and rt="かえっ". Also 鍛え直し vs きたえなおし.
            // In general, literal can mix kanji and kana, rt will have only kana.
            {
                const rt = morphemeToStringLiteral(m)[0];
                if (rt === literal) {
                    return [literal];
                }
                const ret = simpleConvertMecabReading(literal, rt);
                console.log({ ret });
                return ret;
            }
        })));
        return furigana;
    });
}
exports.morphemesToFuriganaCore = morphemesToFuriganaCore;
/*
(if kana is padded on either side, it's unambiguous, so kanji bookends are important)

Consider the following literal/reading pair, where uppercase represents KANJI and lowercase kana:

AxBzC = axbbzccc : this is unambiguous

But:

AxBzC =  axbxbzccc : ambiguous: which x should we cut at?
AxBzC ?= a x bxb zccc or
AxBzC ?= axb x b zccc

I.e., ambiguity when kana run in base (kanji) text appears also in the true reading of an adjancent kanji run.

Is this ambiguous:
AxBzC = axbbzxccc --- NO.
AxBzC = axxbbzccc --- YES

SIMPLE resolution: split eagerly at the first possible case.
Better resolution: use Kanjidic?
*/
function simpleConvertMecabReading(literal, reading) {
    const ret = [];
    const prepost = prePostMatches(literal, reading);
    if (prepost.pre) {
        ret.push(prepost.pre);
    }
    literal = prepost.middleA;
    reading = prepost.middleB;
    const splits = splitKanaKanjiRuns(literal);
    for (const { s, isKanji } of splits) {
        if (isKanji) {
            continue;
        }
        const litIdx = literal.indexOf(s);
        const readIdx = reading.indexOf(s);
        if (litIdx < 0 || readIdx < 0) { // bad error, return
            return [{ ruby: literal, rt: reading }];
        }
        ret.push({ ruby: literal.slice(0, litIdx), rt: reading.slice(0, readIdx) });
        ret.push(s);
        literal = literal.slice(litIdx + s.length);
        reading = reading.slice(readIdx + s.length);
    }
    if (splits[splits.length - 1].isKanji) { // last kanji split would have been skipped above
        ret.push({ ruby: literal, rt: reading });
    }
    if (prepost.post) {
        ret.push(prepost.post);
    }
    return ret;
}
function splitKanaKanjiRuns(s) {
    let current = { s: s[0], isKanji: curtiz_utils_1.hasKanji(s[0]) };
    const ret = [];
    for (const [i, c] of s.slice(1).split('').entries()) {
        const isKanji = curtiz_utils_1.hasKanji(c);
        if (isKanji === current.isKanji) {
            current.s = current.s + c;
        }
        else {
            ret.push(current);
            current = { s: c, isKanji };
        }
    }
    return ret.concat(current);
}
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
        const particlesConjphrasesP = identifyFillInBlanks(parsed.bunsetsus.map(o => o.morphemes));
        const dictionaryHitsP = enumerateDictionaryHits(parsed.morphemes);
        let [furigana, particlesConjphrases, dictionaryHits] = yield Promise.all([furiganaP, particlesConjphrasesP, dictionaryHitsP]);
        return { furigana, particlesConjphrases, dictionaryHits };
    });
}
exports.analyzeSentence = analyzeSentence;
function jmdictIdsToWords(hits) {
    return __awaiter(this, void 0, void 0, function* () {
        const { db } = yield exports.jmdictPromise;
        return jmdict_simplified_node_1.idsToWords(db, hits.map(o => o.wordId));
    });
}
exports.jmdictIdsToWords = jmdictIdsToWords;
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
                if (results.particlesConjphrases.particles.length) {
                    ret.push('  - Particles');
                    for (const { cloze } of results.particlesConjphrases.particles) {
                        ret.push(`    - ${cloze.left}${cloze.left || cloze.right ? '[' + cloze.cloze + ']' : cloze.cloze}${cloze.right}`);
                    }
                }
                if (results.particlesConjphrases.conjugatedPhrases.length) {
                    ret.push('  - Conjugated phrases');
                    for (const c of results.particlesConjphrases.conjugatedPhrases) {
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
                        const words = yield jmdictIdsToWords(hits);
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
                            const words = yield jmdictIdsToWords(dictHits[i].results[j].results);
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
    function renderDeconjugation(d) {
        if ("auxiliaries" in d) {
            return `${d.auxiliaries.join(" + ")} + ${d.conjugation}`;
        }
        return d.conjugation;
    }
    (() => __awaiter(void 0, void 0, void 0, function* () {
        {
            for (const line of ['長は得意げな顔',
            ]) {
                console.log('\n===\n');
                const x = yield analyzeSentence(line);
                console.log('conj');
                p(x.particlesConjphrases.conjugatedPhrases.map(o => o.morphemes.map(m => m.literal).join('|')));
                console.log('deconj');
                console.dir(x.particlesConjphrases.conjugatedPhrases.map(o => o.deconj.map(m => renderDeconjugation(m))), { depth: null });
                // console.log('particles')
                // console.dir(x.particlesConjphrases.particles.map(o => [o.startIdx, o.endIdx, o.cloze.cloze, o.chino.length]))
                // p(x.particlesConjphrases.particles.map(o => o.chino))
            }
            if (Math.random() > -1) {
                return;
            }
            ;
        }
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
