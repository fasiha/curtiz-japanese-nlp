"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const curtiz_utils_1 = require("curtiz-utils");
const fs_1 = require("fs");
const jmdict_furigana_node_1 = require("jmdict-furigana-node");
const jmdict_simplified_node_1 = require("jmdict-simplified-node");
const kamiya_codec_1 = require("kamiya-codec");
const path_1 = __importDefault(require("path"));
const chino_particles_1 = require("./chino-particles");
const customDictionary_1 = require("./customDictionary");
const jdepp_1 = require("./jdepp");
const kanjidic_1 = require("./kanjidic");
const mecabUnidic_1 = require("./mecabUnidic");
__export(require("./interfaces"));
var jmdict_furigana_node_2 = require("jmdict-furigana-node");
exports.furiganaToString = jmdict_furigana_node_2.furiganaToString;
exports.setupJmdictFurigana = jmdict_furigana_node_2.setup;
var jmdict_simplified_node_2 = require("jmdict-simplified-node");
exports.getField = jmdict_simplified_node_2.getField;
exports.jmdictFuriganaPromise = jmdict_furigana_node_1.setup(process.env['JMDICT_FURIGANA']);
exports.jmdictPromise = jmdict_simplified_node_1.setup(process.env['JMDICT_SIMPLIFIED_LEVELDB'] || 'jmdict-simplified', process.env['JMDICT_SIMPLIFIED_JSON'] ||
    fs_1.readdirSync('.').sort().reverse().find(s => s.startsWith('jmdict-eng') && s.endsWith('.json')) ||
    'jmdict-eng-3.1.0.json', true, true);
/**
 * Without this limit on how many Leveldb hits jmdict-simplified-node will get, things slow way down. Not much loss in
 * usefulness with this set to 20.
 */
const DICTIONARY_LIMIT = 20;
async function mecabJdepp(sentence, nBest = 1) {
    let rawMecab = await mecabUnidic_1.invokeMecab(sentence, nBest);
    let { morphemes: allSentencesMorphemes, raws: allSentencesRaws } = mecabUnidic_1.parseMecab(rawMecab, nBest);
    // throw away multiple sentences, we're only going to pass in one (hopefully)
    const morphemes = allSentencesMorphemes[0];
    const raws = allSentencesRaws[0];
    const bunsetsus = await Promise.all(morphemes.map((attempt, idx) => jdepp_1.addJdepp(raws[idx], attempt)));
    return morphemes.map((attempt, idx) => ({ morphemes: attempt, bunsetsus: bunsetsus[idx] }));
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
async function enumerateDictionaryHits(plainMorphemes, full = true, limit = -1) {
    const { db } = await exports.jmdictPromise;
    const simplify = (c) => (c.left || c.right) ? c : c.cloze;
    const jmdictFurigana = await exports.jmdictFuriganaPromise;
    const morphemes = plainMorphemes.map(m => ({
        ...m,
        // if "symbol" POS, don't needlessly double the number of things to search for later in forkingPaths
        searchKanji: unique(m.partOfSpeech[0].startsWith('symbol') ? [m.literal] : [m.literal, m.lemma]),
        searchReading: unique(morphemeToSearchLemma(m).concat(morphemeToStringLiteral(m, jmdictFurigana)))
    }));
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
            const runLiteral = simplify(curtiz_utils_1.generateContextClozed(bunsetsuToString(morphemes.slice(0, startIdx)), runLiteralCore, bunsetsuToString(morphemes.slice(endIdx))));
            if (!full) {
                // skip particles like は and も if they're by themselves as an optimization
                if (runLiteralCore.length === 1 && curtiz_utils_1.hasKana(runLiteralCore[0]) && runLiteralCore === run[0].lemma) {
                    continue;
                }
            }
            const scored = [];
            function helperSearchesHitsToScored(searches, subhits, searchKey) {
                return curtiz_utils_1.flatten(subhits.map((v, i) => v.map(w => {
                    // help catch issues with automatic type widening and excess property checks
                    const ret = {
                        wordId: w.id,
                        score: scoreMorphemeWord(run, searches[i], searchKey, w),
                        search: searches[i],
                        tags: {},
                        word: w
                        // run: runLiteral,
                        // runIdx: [startIdx, endIdx - 1],
                    };
                    return ret;
                })));
            }
            // Search reading
            {
                const readingSearches = forkingPaths(run.map(m => m.searchReading)).map(v => v.join(''));
                // Consider searching rendaku above for non-initial morphemes? It'd be nice if "猿ちえお" (saru chi e o) found
                // "猿知恵" (さるぢえ・さるじえ)
                const readingSubhits = await Promise.all(readingSearches.map(search => Promise.all([jmdict_simplified_node_1.readingBeginning(db, search, DICTIONARY_LIMIT), customDictionary_1.readingBeginning(null, search)])
                    .then(([a, b]) => [...a, ...b])));
                scored.push(...helperSearchesHitsToScored(readingSearches, readingSubhits, 'kana'));
            }
            // Search literals if needed, this works around MeCab mis-readings like お父さん->おちちさん
            {
                const kanjiSearches = forkingPaths(run.map(m => m.searchKanji)).map(v => v.join('')).filter(curtiz_utils_1.hasKanji);
                const kanjiSubhits = await Promise.all(kanjiSearches.map(search => jmdict_simplified_node_1.kanjiBeginning(db, search, DICTIONARY_LIMIT)));
                scored.push(...helperSearchesHitsToScored(kanjiSearches, kanjiSubhits, 'kanji'));
            }
            scored.sort((a, b) => b.score - a.score);
            if (scored.length > 0) {
                results.push({ endIdx, run: runLiteral, results: curtiz_utils_1.dedupeLimit(scored, o => o.wordId, limit) });
            }
        }
        if (results.length === 0) {
            // we didn't find ANYTHING for this morpheme? Try character by character
            const m = morphemes[startIdx];
            const scored = [];
            for (const [searches, searchFn, key] of [[m.searchReading, jmdict_simplified_node_1.readingBeginning, 'kana'],
                [m.searchKanji, jmdict_simplified_node_1.kanjiBeginning, 'kanji'],
            ]) {
                for (const search of searches) {
                    const all = Array.from(curtiz_utils_1.allSubstrings(search));
                    const subhits = await Promise.all(all.map(search => searchFn(db, search, DICTIONARY_LIMIT)));
                    for (const [idx, hits] of subhits.entries()) {
                        const search = all[idx];
                        for (const w of hits) {
                            const score = scoreMorphemeWord([m], search, key, w);
                            scored.push({ wordId: w.id, score, search, tags: {} });
                        }
                    }
                }
            }
            if (scored.length > 0) {
                scored.sort((a, b) => b.score - a.score);
                const endIdx = startIdx + 1;
                const run = morphemes.slice(startIdx, endIdx);
                const runLiteralCore = bunsetsuToString(run);
                const runLiteral = simplify(curtiz_utils_1.generateContextClozed(bunsetsuToString(morphemes.slice(0, startIdx)), runLiteralCore, bunsetsuToString(morphemes.slice(endIdx))));
                results.push({ endIdx, run: runLiteral, results: curtiz_utils_1.dedupeLimit(scored, o => o.wordId, limit) });
            }
        }
        {
            // add relateds
            for (const r of results) {
                console.log("WHEE", r.results);
                const words = await jmdictIdsToWords(r.results);
                const xrefs = words.flatMap(w => w.sense.flatMap(s => s.related));
                const references = await Promise.all(xrefs.flatMap(x => jmdict_simplified_node_1.getXrefs(db, x).then(refs => ({ refs, xref: x }))));
                for (const { refs, xref } of references) {
                    for (const word of refs) {
                        r.results.push({ wordId: word.id, score: 0, search: JSON.stringify({ xref }), tags: {}, isXref: true });
                    }
                }
            }
        }
        superhits.push({ startIdx, results });
    }
    return superhits;
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
const bunsetsuToString = (morphemes) => morphemes.map(m => m.literal).join('');
function betterMorphemePredicate(m) {
    return !(m.partOfSpeech[0] === 'supplementary_symbol') && !(m.partOfSpeech[0] === 'particle');
}
async function morphemesToConjPhrases(startIdx, goodBunsetsu, fullCloze, verbose = false) {
    const endIdx = startIdx + goodBunsetsu.length;
    const cloze = bunsetsuToString(goodBunsetsu);
    const jf = await exports.jmdictFuriganaPromise;
    const lemmas = goodBunsetsu.map(o => {
        const entries = jf.textToEntry.get(o.lemma) || [];
        if (o.lemma.endsWith('-他動詞') && o.partOfSpeech[0] === 'verb') {
            // sometimes ("ひいた" in "かぜひいた"), UniDic lemmas are weird like "引く-他動詞" eyeroll
            entries.push(...(jf.textToEntry.get(o.lemma.replace('-他動詞', '')) || []));
        }
        const lemmaReading = curtiz_utils_1.kata2hira(o.lemmaReading);
        const entry = entries.find(e => e.reading === lemmaReading);
        return entry ? entry.furigana : o.lemma === lemmaReading ? [lemmaReading] : [{ ruby: o.lemma, rt: lemmaReading }];
    });
    const ret = { deconj: [], startIdx, endIdx, morphemes: goodBunsetsu, cloze: fullCloze, lemmas };
    const first = goodBunsetsu[0];
    const pos0 = first.partOfSpeech[0];
    const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1];
    const verbNotAdj = pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0Last === 'verbal_suru';
    const ichidan = first.inflectionType?.[0].includes('ichidan');
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
                const { rt } = lemma;
                // As above, the lemma is sometimes too detailed: "引く-他動詞"
                const ruby = lemma.ruby.split('-')[0];
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
        else {
            // sometimes, the lemma has a totally different kanji: 刺される has lemma "差す-他動詞" lol.
            // in these situations, try replacing kanji from the cloze into the dictionary form.
            const clozeKanji = cloze.split('').filter(curtiz_utils_1.hasKanji);
            const dictKanji = dictionaryForm.split('').filter(curtiz_utils_1.hasKanji);
            if (clozeKanji.length === dictKanji.length) {
                // This is a very stupid way to do it but works for 刺される: replace kanji one at a time...
                for (const [idx, clozeK] of clozeKanji.entries()) {
                    const dictK = dictKanji[idx];
                    const newDictionaryForm = dictionaryForm.replace(dictK, clozeK);
                    const deconj = verbNotAdj ? kamiya_codec_1.verbDeconjugate(cloze, newDictionaryForm, ichidan)
                        : kamiya_codec_1.adjDeconjugate(cloze, newDictionaryForm, iAdj);
                    if (deconj.length) {
                        deconjs.push(...deconj);
                        break;
                        // if we find something, pray it's good and bail.
                    }
                }
            }
        }
    }
    ret.deconj = uniqueKey(deconjs, x => {
        if ('auxiliaries' in x) {
            return x.auxiliaries.join('/') + x.conjugation + x.result.join('/');
        }
        return x.conjugation + x.result.join('/');
    });
    return ret;
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
function* allSlices(v) {
    for (let start = 0; start < v.length; start++) {
        for (let end = start + 1; end < v.length + 1; end++) {
            yield { start, end, slice: v.slice(start, end) };
        }
    }
}
// Find clozes: particles and conjugated verb/adjective phrases
async function identifyFillInBlanks(bunsetsus, verbose = false) {
    const sentence = bunsetsus.map(bunsetsuToString).join('');
    const conjugatedPhrases = [];
    const particles = [];
    for (const [bidx, fullBunsetsu] of bunsetsus.entries()) {
        const startIdx = bunsetsus.slice(0, bidx).map(o => o.length).reduce((p, c) => p + c, 0);
        if (!fullBunsetsu[0]) {
            continue;
        }
        for (const { start, slice: sliceBunsetsu } of allSlices(fullBunsetsu)) {
            const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(fullBunsetsu.slice(0, start));
            const first = sliceBunsetsu[0];
            if (verbose) {
                console.log('g', sliceBunsetsu.map(o => o.literal).join(' '));
            }
            const pos0 = first.partOfSpeech[0] || '';
            const pos1 = first.partOfSpeech[1] || '';
            const pos0Last = first.partOfSpeech[first.partOfSpeech.length - 1] || '';
            /*
            If a bunsetsu has >1 morphemes, check if it's a verb or an adjective (i or na).
            If it's just one, make sure it's an adjective that's not a conclusive (catches 朝早く)
            Also check for copulas (da/desu).
            */
            if ((sliceBunsetsu.length === 1 && pos0.startsWith('adjectiv') &&
                (first.inflection?.[0] ? !first.inflection[0].endsWith('conclusive') : true)) ||
                (sliceBunsetsu.length > 0 &&
                    (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject') ||
                        pos0Last === 'verbal_suru' || pos0Last.startsWith('adjectival'))) ||
                ((pos0.startsWith('aux') && (pos1.startsWith('desu') || pos1.startsWith('da'))))) {
                const middle = bunsetsuToString(sliceBunsetsu);
                const right = sentence.slice(left.length + middle.length);
                const cloze = curtiz_utils_1.generateContextClozed(left, middle, right);
                const res = await morphemesToConjPhrases(startIdx + start, sliceBunsetsu, cloze);
                if (verbose) {
                    console.log('^ found', res.deconj);
                }
                if (res.deconj.length) {
                    conjugatedPhrases.push(res);
                }
            }
        }
        // Handle particles: identify and look up in Chino's "All About Particles" list
        const particlePredicate = (p) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1;
        for (const [pidx, particle] of fullBunsetsu.entries()) {
            if (particlePredicate(particle)) {
                const startIdxParticle = startIdx + pidx;
                const endIdx = startIdxParticle + 1;
                const left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(fullBunsetsu.slice(0, pidx));
                const right = bunsetsuToString(fullBunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
                const cloze = curtiz_utils_1.generateContextClozed(left, particle.literal, right);
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
                const cloze = curtiz_utils_1.generateContextClozed(left, combined, right);
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
}
exports.identifyFillInBlanks = identifyFillInBlanks;
function morphemeToSearchLemma(m) {
    const pos0 = m.partOfSpeech[0];
    const conjugatable = (m.inflection?.[0]) || (m.inflectionType?.[0]) || pos0.startsWith('verb') ||
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
async function morphemesToFurigana(line, morphemes, overrides) {
    return morphemesToFuriganaCore(morphemes, overrides).then(o => checkFurigana(line, o));
}
exports.morphemesToFurigana = morphemesToFurigana;
/**
 * Try very hard to convert morphemes to furigana. `overrides` is a map of morpheme literal to the furigana you want.
 * This is useful because, e.g., Unidic always converts 日本 to ニッポン, and maybe you want overrides such that:
 * `overrides = new Map([['日本', [{ruby: '日', rt: 'に'}, {ruby: '本', rt: 'ほん'}]]])`
 * Note that `overrides` operates on a morpheme-by-morpheme basis.
 */
async function morphemesToFuriganaCore(morphemes, overrides) {
    const furigana = await Promise.all(morphemes.map(async (m) => {
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
        const jmdictFurigana = await exports.jmdictFuriganaPromise;
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
                return annotatedChars.filter(x => x !== '');
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
    }));
    return furigana;
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
async function jmdictIdsToWords(searches) {
    const { db } = await exports.jmdictPromise;
    const missingWord = searches.filter(x => !x.word);
    console.log('MISSING', missingWord);
    const missingWordsFound = await jmdict_simplified_node_1.idsToWords(db, missingWord.map(o => o.wordId));
    let i = 0;
    return searches.map(x => x.word ? x.word : missingWordsFound[i++]);
}
exports.jmdictIdsToWords = jmdictIdsToWords;
async function getTags() { return exports.jmdictPromise.then(({ db }) => jmdict_simplified_node_1.getTags(db)); }
exports.getTags = getTags;
function contextClozeToString(c) {
    return (c.left || c.right) ? `${c.left}[${c.cloze}]${c.right}` : c.cloze;
}
function contextClozeOrStringToString(c) {
    return typeof c === 'string' ? c : contextClozeToString(c);
}
const tagsPromise = exports.jmdictPromise.then(({ db }) => db)
    .then(db => jmdict_simplified_node_1.getField(db, 'tags'))
    .then(raw => JSON.parse(raw));
const kanjidicPromise = kanjidic_1.setupSimple();
const wanikaniGraph = JSON.parse(fs_1.readFileSync(path_1.default.join(__dirname, 'wanikani-kanji-graph.json'), 'utf8'));
async function handleSentence(sentence, overrides = {}, includeWord = true, extractParticlesConj = true, nBest = 1) {
    if (!curtiz_utils_1.hasKanji(sentence) && !curtiz_utils_1.hasKana(sentence)) {
        const resBody = sentence;
        return [resBody];
    }
    const res = await mecabJdepp(sentence, nBest);
    return Promise.all(res.map(async (res) => {
        const morphemes = res.morphemes;
        const bunsetsus = res.bunsetsus;
        const furigana = await morphemesToFurigana(sentence, morphemes, overrides);
        const tags = await tagsPromise;
        const dictHits = await enumerateDictionaryHits(morphemes, true, 10);
        for (let i = 0; i < dictHits.length; i++) {
            for (let j = 0; j < dictHits[i].results.length; j++) {
                const words = await jmdictIdsToWords(dictHits[i].results[j].results);
                for (let k = 0; k < words.length; k++) {
                    dictHits[i].results[j].results[k].summary = displayWordLight(words[k], tags);
                    if (includeWord) {
                        const word = words[k];
                        dictHits[i].results[j].results[k].word = word;
                        const thisTag = dictHits[i].results[j].results[k].tags;
                        for (const tag of word.sense.flatMap(s => s.field.concat(s.dialect).concat(s.misc).concat(s.partOfSpeech))) {
                            thisTag[tag] = tags[tag];
                        }
                    }
                }
            }
        }
        const kanjidic = await kanjidicPromise;
        const kanjidicHits = Object.fromEntries(sentence.split('')
            .filter(c => c in kanjidic)
            .map(c => [c, {
                ...kanjidic[c],
                dependencies: searchMap(treeSearch(wanikaniGraph, c), c => (kanjidic[c] || null))
                    .children
            }]));
        let clozes = undefined;
        if (extractParticlesConj) {
            clozes = await identifyFillInBlanks(bunsetsus.map(o => o.morphemes));
        }
        const resBody = { furigana, hits: dictHits, kanjidic: kanjidicHits, clozes, tags: includeWord ? tags : undefined, bunsetsus };
        return resBody;
    }));
}
exports.handleSentence = handleSentence;
function treeSearch(tree, node, seen = new Set()) {
    seen.add(node);
    const children = (tree[node] || []).filter(node => !seen.has(node));
    for (const child of children) {
        seen.add(child);
    }
    return { node, children: children.map(node => treeSearch(tree, node, seen)) };
}
function searchMap(search, f) {
    return { node: search.node, nodeMapped: f(search.node), children: search.children.map(node => searchMap(node, f)) };
}
if (module === require.main) {
    function renderDeconjugation(d) {
        if ("auxiliaries" in d) {
            return `${d.auxiliaries.join(" + ")} + ${d.conjugation}`;
        }
        return d.conjugation;
    }
    (async () => {
        for (const line of ['かぜひいた',
        ]) {
            console.log('\n===\n');
            const xs = await handleSentence(line);
            for (const x of xs) {
                if (typeof x === 'string') {
                    continue;
                }
                console.log(x.furigana);
                console.log('conj');
                p(x.clozes?.conjugatedPhrases.map(o => o.morphemes.map(m => m.literal).join('|')));
                console.log('deconj');
                console.dir(x.clozes?.conjugatedPhrases.map(o => o.deconj.map(m => renderDeconjugation(m))), { depth: null });
                // console.log('particles')
                // console.dir(x.particlesConjphrases.particles.map(o => [o.startIdx, o.endIdx, o.cloze.cloze, o.chino.length]))
                // p(x.particlesConjphrases.particles.map(o => o.chino))
                const SHOW_HITS = false;
                if (SHOW_HITS) {
                    const MAX_LINES = 10000;
                    const { db } = await exports.jmdictPromise;
                    const tags = JSON.parse(await jmdict_simplified_node_1.getField(db, 'tags'));
                    for (const fromStart of x.hits) {
                        for (const fromEnd of fromStart.results) {
                            console.log(`  - Vocab: ${contextClozeOrStringToString(fromEnd.run)} INFO`);
                            const hits = fromEnd.results.slice(0, MAX_LINES);
                            const words = await jmdictIdsToWords(hits);
                            for (const [wi, w] of words.entries()) {
                                console.log('    - ' + hits[wi].search + ' | ' + displayWordLight(w, tags));
                            }
                            if (fromEnd.results.length > MAX_LINES) {
                                console.log(`    - (… ${fromEnd.results.length - MAX_LINES} omitted) INFO`);
                            }
                        }
                    }
                }
            }
        }
    })();
}
