#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const jdepp_1 = require("./jdepp");
const kana_1 = require("./kana");
const mecabUnidic_1 = require("./mecabUnidic");
const curtiz_utils_1 = require("curtiz-utils");
const jmdict_furigana_node_1 = require("jmdict-furigana-node");
const JmdictFurigana = jmdict_furigana_node_1.setup();
function parse(sentence) {
    return __awaiter(this, void 0, void 0, function* () {
        let rawMecab = yield mecabUnidic_1.invokeMecab(sentence);
        let morphemes = mecabUnidic_1.maybeMorphemesToMorphemes(mecabUnidic_1.parseMecab(sentence, rawMecab)[0].filter(o => !!o));
        let bunsetsus = yield jdepp_1.addJdepp(rawMecab, morphemes);
        return { morphemes, bunsetsus };
    });
}
exports.parse = parse;
const bunsetsuToString = (morphemes) => morphemes.map(m => m.literal).join('');
function splitAtHeaders(text) {
    const headerRe = /^#+\s+.+$/;
    return curtiz_utils_1.partitionBy(text.split('\n'), s => headerRe.test(s));
}
exports.splitAtHeaders = splitAtHeaders;
function parseAllHeaderBlocks(blocks, concurrentLimit = 1) {
    return __awaiter(this, void 0, void 0, function* () {
        let ret = [];
        let promises = [];
        const seen = new Map([]);
        for (let o of blocks) {
            if (promises.length >= concurrentLimit) {
                const thisRet = yield Promise.all(promises);
                for (const o of thisRet) {
                    ret.push(o);
                }
                promises = [];
            }
            promises.push(parseHeaderBlock(o, seen));
        }
        if (promises.length > 0) {
            const thisRet = yield Promise.all(promises);
            for (const o of thisRet) {
                ret.push(o);
            }
        }
        return ret;
    });
}
exports.parseAllHeaderBlocks = parseAllHeaderBlocks;
const PLEASE_PARSE_BLOCK = '- @pleaseParse';
const FURIGANA_BLOCK = '- @furigana';
const flashableMorpheme = (m) => {
    const pos = m.partOfSpeech.join('-');
    if (curtiz_utils_1.hasKanji(m.literal) && !pos.endsWith('numeral')) {
        return true;
    }
    if (pos.endsWith('numeral')) {
        return false;
    }
    if (pos.startsWith('verb-') || pos.startsWith('noun') || pos.startsWith('pronoun') || pos.startsWith('adjectiv') ||
        pos.startsWith('adverb')) {
        return true;
    }
    return false;
};
function morphemeToReading(m) {
    if (!curtiz_utils_1.hasKanji(m.literal)) {
        return m.literal;
    }
    const ret = kana_1.kata2hira(m.literal === m.lemma ? m.lemmaReading : m.pronunciation);
    if (!ret.includes(CHOUONPU)) {
        return ret;
    }
    const alts = findAlternativeChouonpu(ret);
    return alts[1] || ret;
}
function parseHeaderBlock(block, seen = new Map([])) {
    return __awaiter(this, void 0, void 0, function* () {
        const atHeaderRe = /^#+\s+@\s+/;
        const match = block[0].match(atHeaderRe);
        if (match) {
            const line = block[0].slice(match[0].length); // minus the first @
            let [prompt, ...responses] = line.split('@').map(s => s.trim());
            const prefix = [];
            // process line and block.
            const needsResponse = responses.length === 1 && responses[0].length == 0;
            const hasPleaseParse = curtiz_utils_1.takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(PLEASE_PARSE_BLOCK));
            const hasFurigana = curtiz_utils_1.takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(FURIGANA_BLOCK));
            if (needsResponse || hasPleaseParse || !hasFurigana) {
                const parsed = yield parse(prompt);
                if (needsResponse) {
                    responses = [kana_1.kata2hira(curtiz_utils_1.flatten(parsed.bunsetsus)
                            .filter(m => m.partOfSpeech[0] !== 'supplementary_symbol')
                            .map(m => {
                            const hit = seen.get(m.literal);
                            return hit ? hit.reading : morphemeToReading(m);
                        })
                            .join(''))];
                    block[0] = block[0] + (block[0].endsWith(' ') ? '' : ' ') + responses[0];
                }
                if (hasPleaseParse) {
                    // add @ vocabulary lines:
                    let flashBullets = [];
                    for (let [midx, morpheme] of curtiz_utils_1.enumerate(parsed.morphemes)) {
                        if (parsed.morphemes.length === 1) {
                            break;
                        }
                        if (flashableMorpheme(morpheme)) {
                            let { prompt: mprompt, response: mresponse } = morphemeToPromptResponse(morpheme);
                            let furigana = [];
                            if (curtiz_utils_1.hasKanji(mprompt)) {
                                furigana = yield vocabToFurigana([morpheme]);
                            }
                            const hit = seen.get(mprompt);
                            if (!hit) {
                                prefix.push(match[0] + `${mprompt} @ ${mresponse}`);
                                prefix.push(FURIGANA_BLOCK + ' ' + furigana.map(jmdict_furigana_node_1.furiganaToString).join(''));
                                prefix.push(`(Auto-added via 『${prompt}』)`);
                                seen.set(mprompt, { furigana, reading: mresponse });
                            }
                            else {
                                mresponse = hit.reading;
                            }
                            const left = parsed.morphemes.slice(0, midx).map(m => m.literal).join('');
                            const right = parsed.morphemes.slice(midx + 1).map(m => m.literal).join('');
                            let cloze = generateContextClozed(left, morpheme.literal, right);
                            let final = '';
                            if (mprompt === morpheme.literal && appearsExactlyOnce(prompt, morpheme.literal)) {
                                final = `- @ ${mprompt} @ ${mresponse}`;
                            }
                            else {
                                final = `- @ ${mprompt} @ ${mresponse} @omit ${cloze}`;
                            }
                            flashBullets.push(final);
                        }
                    }
                    block.splice(1, 0, ...flashBullets);
                    // add @fill lines
                    block.splice(1, 0, ...identifyFillInBlanks(parsed.bunsetsus));
                    // remove @pleaseParse
                    block = block.filter(s => !s.startsWith(PLEASE_PARSE_BLOCK));
                }
                if (!hasFurigana) {
                    if (curtiz_utils_1.hasKanji(prompt)) {
                        // add furigana line
                        const furigana = yield parsedToFurigana(parsed.morphemes, seen);
                        block.splice(1, 0, `${FURIGANA_BLOCK} ${furigana.map(jmdict_furigana_node_1.furiganaToString).join('')}`);
                        seen.set(prompt, { furigana, reading: responses[0] });
                    }
                    else {
                        seen.set(prompt, { furigana: [[responses[0]]], reading: responses[0] });
                    }
                }
                else {
                    const furiganaBullets = block.filter(s => s.startsWith(FURIGANA_BLOCK));
                    if (furiganaBullets.length) {
                        const furigana = jmdict_furigana_node_1.stringToFurigana(furiganaBullets[0].slice(FURIGANA_BLOCK.length));
                        seen.set(prompt, { furigana: [furigana], reading: responses[0] });
                    }
                }
            }
            else {
                // FIXME DRY same as above
                const furiganaBullet = block.find(s => s.startsWith(FURIGANA_BLOCK));
                if (furiganaBullet) {
                    const furigana = jmdict_furigana_node_1.stringToFurigana(furiganaBullet.slice(FURIGANA_BLOCK.length));
                    seen.set(prompt, { furigana: [furigana], reading: responses[0] });
                }
            }
            block = prefix.concat(block);
        }
        return block;
    });
}
exports.parseHeaderBlock = parseHeaderBlock;
// returns true if pronunciation オーキナ vs lemmaReading オオキナ, i.e., if all non-chouonpu chars are same
function pronunciationReadingEqualChouonpu(m) {
    if (m.pronunciation === m.lemmaReading) {
        return true;
    }
    if (m.pronunciation.length === m.lemmaReading.length && m.pronunciation.includes(CHOUONPU)) {
        const ps = m.pronunciation.split('');
        const rs = m.lemmaReading.split('');
        for (const [i, p] of curtiz_utils_1.enumerate(ps)) {
            if (p !== CHOUONPU) {
                if (p !== rs[i]) {
                    return false;
                }
            }
        }
        return true;
    }
    return false;
}
function morphemeToPromptResponse(morpheme) {
    // use lemma only when inflected, or when literal lacks kanji but lemma has them
    const useLemma = (morpheme.inflection && morpheme.inflection[0]) || (curtiz_utils_1.hasKanji(morpheme.lemma) && !curtiz_utils_1.hasKanji(morpheme.literal));
    const prompt = useLemma ? morpheme.lemma : morpheme.literal;
    const response = kana_1.kata2hira(useLemma ? morpheme.lemmaReading : morpheme.pronunciation);
    {
        const lemmaAnyway = kana_1.kata2hira(morpheme.lemmaReading);
        if (!useLemma && response.includes(CHOUONPU) &&
            (findAlternativeChouonpu(response).find(s => s === lemmaAnyway) ||
                pronunciationReadingEqualChouonpu(morpheme))) {
            return { prompt, response: kana_1.kata2hira(morpheme.lemmaReading) };
        }
    }
    return { prompt, response };
}
function vocabToFurigana(morphemes) {
    return __awaiter(this, void 0, void 0, function* () {
        return Promise.all(morphemes.map((m) => __awaiter(this, void 0, void 0, function* () {
            const { prompt: lemma, response: lemmaReading } = morphemeToPromptResponse(m);
            if (curtiz_utils_1.hasKanji(lemma)) {
                const { textToEntry } = yield JmdictFurigana;
                const lemmaHit = search(textToEntry, lemma, 'reading', lemmaReading);
                if (lemmaHit) {
                    return lemmaHit.furigana;
                }
            }
            return [curtiz_utils_1.hasKanji(lemma) ? { ruby: lemma, rt: morphemeToReading(m) } : lemma];
        })));
    });
}
function parsedToFurigana(morphemes, seen) {
    return __awaiter(this, void 0, void 0, function* () {
        const furigana = yield Promise.all(morphemes.map((m) => __awaiter(this, void 0, void 0, function* () {
            const { lemma, lemmaReading, literal, pronunciation } = m;
            if (curtiz_utils_1.hasKanji(literal)) {
                const hit = seen.get(literal);
                if (hit) {
                    return curtiz_utils_1.flatten(hit.furigana) || [];
                }
                const { textToEntry, readingToEntry } = yield JmdictFurigana;
                const literalHit = search(textToEntry, literal, 'reading', pronunciation);
                if (literalHit) {
                    return literalHit.furigana;
                }
                const pronunciationHit = search(readingToEntry, pronunciation, 'text', literal);
                if (pronunciationHit) {
                    return pronunciationHit.furigana;
                }
                const lemmaHit = search(textToEntry, lemma, 'reading', lemmaReading);
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
                        break;
                    }
                    return annotatedChars;
                }
                // const lemmaReadingHit = search(readingToEntry, lemmaReading, 'text', lemma);
                // if (lemmaReadingHit) { return lemmaReadingHit.furigana; }
            }
            return [curtiz_utils_1.hasKanji(literal) ? { ruby: literal, rt: morphemeToReading(m) } : literal];
        })));
        return furigana;
    });
}
function triu(arr) {
    const ret = [];
    for (let i = arr.length; i > 0; --i) {
        ret.push(arr.slice(0, i));
    }
    return ret;
}
const CHOUONPU_PREFIX_MAP = createChouonpuPrefixMap();
const CHOUONPU = 'ー'; // https://en.wikipedia.org/wiki/Ch%C5%8Donpu
function createChouonpuPrefixMap() {
    const prefixes = 'あいういう';
    const map = new Map();
    `ぁあかがさざただなはばぱまゃやらゎわ
ぃいきぎしじちぢにひびぴみり
ぅうくぐすずっつづぬふぶぷむゅゆるゔ
ぇえけげせぜてでねへべぺめれ
ぉおこごそぞとどのほぼぽもょよろを`.split('\n')
        .forEach((line, i) => line.split('').forEach(s => map.set(s, s + prefixes[i])));
    return map;
}
function findAlternativeChouonpu(hiragana) {
    const hits = [hiragana];
    for (let i = 1; i < hiragana.length; i++) {
        if (hiragana[i] === CHOUONPU) {
            const replacement = CHOUONPU_PREFIX_MAP.get(hiragana[i - 1]);
            if (replacement) {
                const prefix = hiragana.slice(0, i - 1);
                const postfix = hiragana.slice(i + 1);
                hits.push(prefix + replacement + postfix);
            }
        }
    }
    return hits;
}
function search(map, first, sub, second) {
    const hit = map.get(first);
    if (hit) {
        if (hit.length === 1) {
            return hit[0];
        }
        const possibleSeconds = findAlternativeChouonpu(kana_1.kata2hira(second));
        const subhit = hit.find(e => {
            const dict = kana_1.kata2hira(e[sub]);
            return possibleSeconds.some(second => second === dict);
        });
        if (subhit) {
            return subhit;
        }
        console.error(`found hit for ${first} but not ${second}`, { hit, possibleSeconds });
    }
}
/**
 * Ensure needle is found in haystack only once
 * @param haystack big string
 * @param needle little string
 */
function appearsExactlyOnce(haystack, needle) {
    let hit;
    return (hit = haystack.indexOf(needle)) >= 0 && (hit = haystack.indexOf(needle, hit + 1)) < 0;
}
/**
 * Given three consecuties substrings (the arguments), return either
 * - `${left2}[${cloze}]${right2}` where `left2` and `right2` are as short as possible (and of equal length, if
 *    possible) so the this return string (minus the brackets) is unique in the full string, or
 * - `${cloze}` if `left2 === right2 === ''` (i.e., the above but without the brackets).
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
        if (contextLength >= left.length && contextLength >= right.length) {
            throw new Error('Ran out of context to build unique cloze');
        }
        leftContext = left.slice(-contextLength);
        rightContext = right.slice(0, contextLength);
    }
    if (leftContext === '' && rightContext === '') {
        return cloze;
    }
    return `${leftContext}[${cloze}]${rightContext}`;
}
function identifyFillInBlanks(bunsetsus) {
    // Find clozes: particles and conjugated verb/adjective phrases
    let literalClozes = new Map([]);
    for (let [bidx, bunsetsu] of curtiz_utils_1.enumerate(bunsetsus)) {
        let first = bunsetsu[0];
        if (!first) {
            continue;
        }
        const pos0 = first.partOfSpeech[0];
        let searchForParticles = true;
        if (bunsetsus.length > 1 && bunsetsu.length > 1 &&
            (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject'))) {
            let ignoreRight = curtiz_utils_1.filterRight(bunsetsu, m => !mecabUnidic_1.goodMorphemePredicate(m));
            let goodBunsetsu = ignoreRight.length === 0 ? bunsetsu : bunsetsu.slice(0, -ignoreRight.length);
            if (goodBunsetsu.length > 1) {
                searchForParticles = false;
                let cloze = bunsetsuToString(goodBunsetsu);
                let left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('');
                let right = bunsetsuToString(ignoreRight) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
                literalClozes.set(generateContextClozed(left, cloze, right), goodBunsetsu);
            }
        }
        // only add particles if they're NOT inside conjugated phrases
        const particlePredicate = (p) => p.partOfSpeech[0].startsWith('particle') && p.partOfSpeech.length > 1 &&
            !p.partOfSpeech[1].startsWith('phrase_final');
        if (searchForParticles) {
            for (let [pidx, particle] of curtiz_utils_1.enumerate(bunsetsu)) {
                if (particlePredicate(particle)) {
                    let left = bunsetsus.slice(0, bidx).map(bunsetsuToString).join('') + bunsetsuToString(bunsetsu.slice(0, pidx));
                    let right = bunsetsuToString(bunsetsu.slice(pidx + 1)) + bunsetsus.slice(bidx + 1).map(bunsetsuToString).join('');
                    literalClozes.set(generateContextClozed(left, particle.literal, right), [particle]);
                }
            }
        }
    }
    let existingClozes = new Set([]);
    let bullets = [];
    for (let [cloze, bunsetsu] of literalClozes) {
        if (!existingClozes.has(cloze)) {
            let acceptable = [cloze];
            if (curtiz_utils_1.hasKanji(bunsetsuToString(bunsetsu))) {
                acceptable.push(kana_1.kata2hira(bunsetsu.map(m => m.pronunciation).join('')));
            }
            bullets.push('- @fill ' + acceptable.join(' @ ') +
                `    @pos ${bunsetsu.map(m => m.partOfSpeech.join('-')).join('/')}`);
        }
    }
    return bullets;
}
const USAGE = `USAGE 1:
$ node [this-script.js] [markdown.md]

USAGE 2:
$ cat [markdown.md] | node [this-script.js]

Both will print a parsed version of the input.`;
if (require.main === module) {
    const promisify = require('util').promisify;
    const readFile = promisify(require('fs').readFile);
    const getStdin = require('get-stdin');
    (function () {
        return __awaiter(this, void 0, void 0, function* () {
            const text = process.argv[2] ? yield readFile(process.argv[2], 'utf8') : ((yield getStdin()) || USAGE);
            // Split Markdown at header (`# blabla`)
            let blocks = splitAtHeaders(text);
            // Parse headers
            let content = yield parseAllHeaderBlocks(blocks);
            // Print result
            process.stdout.write(content.map(v => v.join('\n')).join('\n'));
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBZ0c7QUFFaEcsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQXNCLEtBQUssQ0FBQyxRQUFnQjs7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxzQkFLQztBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQs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T0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsRSxDQUFDO0tBQUEsQ0FBQyxFQUFFLENBQUM7Q0FDTiIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCB7YWRkSmRlcHB9IGZyb20gJy4vamRlcHAnO1xuaW1wb3J0IHtrYXRhMmhpcmF9IGZyb20gJy4va2FuYSc7XG5pbXBvcnQge2dvb2RNb3JwaGVtZVByZWRpY2F0ZSwgaW52b2tlTWVjYWIsIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMsIE1vcnBoZW1lLCBwYXJzZU1lY2FifSBmcm9tICcuL21lY2FiVW5pZGljJztcbmltcG9ydCB7ZW51bWVyYXRlLCBmaWx0ZXJSaWdodCwgZmxhdHRlbiwgaGFzS2FuamksIHBhcnRpdGlvbkJ5LCB0YWtlV2hpbGV9IGZyb20gJ2N1cnRpei11dGlscyc7XG5pbXBvcnQge0VudHJ5LCBmdXJpZ2FuYVRvU3RyaW5nLCBGdXJpZ2FuYSwgc2V0dXAsIHN0cmluZ1RvRnVyaWdhbmF9IGZyb20gJ2ptZGljdC1mdXJpZ2FuYS1ub2RlJztcblxuY29uc3QgSm1kaWN0RnVyaWdhbmEgPSBzZXR1cCgpO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2Uoc2VudGVuY2U6IHN0cmluZyk6IFByb21pc2U8e21vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107fT4ge1xuICBsZXQgcmF3TWVjYWIgPSBhd2FpdCBpbnZva2VNZWNhYihzZW50ZW5jZSk7XG4gIGxldCBtb3JwaGVtZXMgPSBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzKHBhcnNlTWVjYWIoc2VudGVuY2UsIHJhd01lY2FiKVswXS5maWx0ZXIobyA9PiAhIW8pKTtcbiAgbGV0IGJ1bnNldHN1cyA9IGF3YWl0IGFkZEpkZXBwKHJhd01lY2FiLCBtb3JwaGVtZXMpO1xuICByZXR1cm4ge21vcnBoZW1lcywgYnVuc2V0c3VzfTtcbn1cblxuY29uc3QgYnVuc2V0c3VUb1N0cmluZyA9IChtb3JwaGVtZXM6IE1vcnBoZW1lW10pID0+IG1vcnBoZW1lcy5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuXG5leHBvcnQgZnVuY3Rpb24gc3BsaXRBdEhlYWRlcnModGV4dDogc3RyaW5nKTogc3RyaW5nW11bXSB7XG4gIGNvbnN0IGhlYWRlclJlID0gL14jK1xccysuKyQvO1xuICByZXR1cm4gcGFydGl0aW9uQnkodGV4dC5zcGxpdCgnXFxuJyksIHMgPT4gaGVhZGVyUmUudGVzdChzKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3M6IHN0cmluZ1tdW10sIGNvbmN1cnJlbnRMaW1pdDogbnVtYmVyID0gMSkge1xuICBsZXQgcmV0OiBzdHJpbmdbXVtdID0gW107XG4gIGxldCBwcm9taXNlczogUHJvbWlzZTxzdHJpbmdbXT5bXSA9IFtdO1xuICBjb25zdCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPiA9IG5ldyBNYXAoW10pO1xuICBmb3IgKGxldCBvIG9mIGJsb2Nrcykge1xuICAgIGlmIChwcm9taXNlcy5sZW5ndGggPj0gY29uY3VycmVudExpbWl0KSB7XG4gICAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgICAgIHByb21pc2VzID0gW107XG4gICAgfVxuICAgIHByb21pc2VzLnB1c2gocGFyc2VIZWFkZXJCbG9jayhvLCBzZWVuKSk7XG4gIH1cbiAgaWYgKHByb21pc2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gIH1cbiAgcmV0dXJuIHJldDtcbn1cblxuY29uc3QgUExFQVNFX1BBUlNFX0JMT0NLID0gJy0gQHBsZWFzZVBhcnNlJztcbmNvbnN0IEZVUklHQU5BX0JMT0NLID0gJy0gQGZ1cmlnYW5hJztcblxuY29uc3QgZmxhc2hhYmxlTW9ycGhlbWUgPSAobTogTW9ycGhlbWUpID0+IHtcbiAgY29uc3QgcG9zID0gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpO1xuICBpZiAoaGFzS2FuamkobS5saXRlcmFsKSAmJiAhcG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAocG9zLnN0YXJ0c1dpdGgoJ3ZlcmItJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ25vdW4nKSB8fCBwb3Muc3RhcnRzV2l0aCgncHJvbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdhZGplY3RpdicpIHx8XG4gICAgICBwb3Muc3RhcnRzV2l0aCgnYWR2ZXJiJykpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuZnVuY3Rpb24gbW9ycGhlbWVUb1JlYWRpbmcobTogTW9ycGhlbWUpOiBzdHJpbmcge1xuICBpZiAoIWhhc0thbmppKG0ubGl0ZXJhbCkpIHsgcmV0dXJuIG0ubGl0ZXJhbDsgfVxuICBjb25zdCByZXQgPSBrYXRhMmhpcmEobS5saXRlcmFsID09PSBtLmxlbW1hID8gbS5sZW1tYVJlYWRpbmcgOiBtLnByb251bmNpYXRpb24pO1xuICBpZiAoIXJldC5pbmNsdWRlcyhDSE9VT05QVSkpIHsgcmV0dXJuIHJldDsgfVxuICBjb25zdCBhbHRzID0gZmluZEFsdGVybmF0aXZlQ2hvdW9ucHUocmV0KTtcbiAgcmV0dXJuIGFsdHNbMV0gfHwgcmV0O1xufVxudHlwZSBQYXJzZWQgPSB7XG4gIG1vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107XG59O1xudHlwZSBTZWVuID0ge1xuICBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdOyByZWFkaW5nOiBzdHJpbmc7XG59O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlSGVhZGVyQmxvY2soYmxvY2s6IHN0cmluZ1tdLCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPiA9IG5ldyBNYXAoW10pKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBjb25zdCBhdEhlYWRlclJlID0gL14jK1xccytAXFxzKy87XG4gIGNvbnN0IG1hdGNoID0gYmxvY2tbMF0ubWF0Y2goYXRIZWFkZXJSZSk7XG4gIGlmIChtYXRjaCkge1xuICAgIGNvbnN0IGxpbmUgPSBibG9ja1swXS5zbGljZShtYXRjaFswXS5sZW5ndGgpOyAvLyBtaW51cyB0aGUgZmlyc3QgQFxuXG4gICAgbGV0IFtwcm9tcHQsIC4uLnJlc3BvbnNlc10gPSBsaW5lLnNwbGl0KCdAJykubWFwKHMgPT4gcy50cmltKCkpO1xuICAgIGNvbnN0IHByZWZpeDogc3RyaW5nW10gPSBbXTtcbiAgICAvLyBwcm9jZXNzIGxpbmUgYW5kIGJsb2NrLlxuICAgIGNvbnN0IG5lZWRzUmVzcG9uc2UgPSByZXNwb25zZXMubGVuZ3RoID09PSAxICYmIHJlc3BvbnNlc1swXS5sZW5ndGggPT0gMDtcbiAgICBjb25zdCBoYXNQbGVhc2VQYXJzZSA9XG4gICAgICAgIHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgIGNvbnN0IGhhc0Z1cmlnYW5hID0gdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICBpZiAobmVlZHNSZXNwb25zZSB8fCBoYXNQbGVhc2VQYXJzZSB8fCAhaGFzRnVyaWdhbmEpIHtcbiAgICAgIGNvbnN0IHBhcnNlZDogUGFyc2VkID0gYXdhaXQgcGFyc2UocHJvbXB0KTtcbiAgICAgIGlmIChuZWVkc1Jlc3BvbnNlKSB7XG4gICAgICAgIHJlc3BvbnNlcyA9IFtrYXRhMmhpcmEoZmxhdHRlbihwYXJzZWQuYnVuc2V0c3VzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKG0gPT4gbS5wYXJ0T2ZTcGVlY2hbMF0gIT09ICdzdXBwbGVtZW50YXJ5X3N5bWJvbCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAobSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGl0ID0gc2Vlbi5nZXQobS5saXRlcmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGl0ID8gaGl0LnJlYWRpbmcgOiBtb3JwaGVtZVRvUmVhZGluZyhtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmpvaW4oJycpKV07XG4gICAgICAgIGJsb2NrWzBdID0gYmxvY2tbMF0gKyAoYmxvY2tbMF0uZW5kc1dpdGgoJyAnKSA/ICcnIDogJyAnKSArIHJlc3BvbnNlc1swXTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNQbGVhc2VQYXJzZSkge1xuICAgICAgICAvLyBhZGQgQCB2b2NhYnVsYXJ5IGxpbmVzOlxuICAgICAgICBsZXQgZmxhc2hCdWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBbbWlkeCwgbW9ycGhlbWVdIG9mIGVudW1lcmF0ZShwYXJzZWQubW9ycGhlbWVzKSkge1xuICAgICAgICAgIGlmIChwYXJzZWQubW9ycGhlbWVzLmxlbmd0aCA9PT0gMSkgeyBicmVhazsgfVxuICAgICAgICAgIGlmIChmbGFzaGFibGVNb3JwaGVtZShtb3JwaGVtZSkpIHtcbiAgICAgICAgICAgIGxldCB7cHJvbXB0OiBtcHJvbXB0LCByZXNwb25zZTogbXJlc3BvbnNlfSA9IG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtb3JwaGVtZSk7XG5cbiAgICAgICAgICAgIGxldCBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdID0gW107XG4gICAgICAgICAgICBpZiAoaGFzS2FuamkobXByb21wdCkpIHsgZnVyaWdhbmEgPSBhd2FpdCB2b2NhYlRvRnVyaWdhbmEoW21vcnBoZW1lXSk7IH1cblxuICAgICAgICAgICAgY29uc3QgaGl0ID0gc2Vlbi5nZXQobXByb21wdCk7XG4gICAgICAgICAgICBpZiAoIWhpdCkge1xuICAgICAgICAgICAgICBwcmVmaXgucHVzaChtYXRjaFswXSArIGAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9YCk7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKEZVUklHQU5BX0JMT0NLICsgJyAnICsgZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgcHJlZml4LnB1c2goYChBdXRvLWFkZGVkIHZpYSDjgI4ke3Byb21wdH3jgI8pYCk7XG4gICAgICAgICAgICAgIHNlZW4uc2V0KG1wcm9tcHQsIHtmdXJpZ2FuYSwgcmVhZGluZzogbXJlc3BvbnNlfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBtcmVzcG9uc2UgPSBoaXQucmVhZGluZztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgbGVmdCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UoMCwgbWlkeCkubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IHJpZ2h0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZShtaWR4ICsgMSkubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcbiAgICAgICAgICAgIGxldCBjbG96ZSA9IGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBtb3JwaGVtZS5saXRlcmFsLCByaWdodCk7XG4gICAgICAgICAgICBsZXQgZmluYWwgPSAnJztcbiAgICAgICAgICAgIGlmIChtcHJvbXB0ID09PSBtb3JwaGVtZS5saXRlcmFsICYmIGFwcGVhcnNFeGFjdGx5T25jZShwcm9tcHQsIG1vcnBoZW1lLmxpdGVyYWwpKSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9IEBvbWl0ICR7Y2xvemV9YDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZmxhc2hCdWxsZXRzLnB1c2goZmluYWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uZmxhc2hCdWxsZXRzKTtcblxuICAgICAgICAvLyBhZGQgQGZpbGwgbGluZXNcbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmlkZW50aWZ5RmlsbEluQmxhbmtzKHBhcnNlZC5idW5zZXRzdXMpKTtcblxuICAgICAgICAvLyByZW1vdmUgQHBsZWFzZVBhcnNlXG4gICAgICAgIGJsb2NrID0gYmxvY2suZmlsdGVyKHMgPT4gIXMuc3RhcnRzV2l0aChQTEVBU0VfUEFSU0VfQkxPQ0spKTtcbiAgICAgIH1cbiAgICAgIGlmICghaGFzRnVyaWdhbmEpIHtcbiAgICAgICAgaWYgKGhhc0thbmppKHByb21wdCkpIHtcbiAgICAgICAgICAvLyBhZGQgZnVyaWdhbmEgbGluZVxuICAgICAgICAgIGNvbnN0IGZ1cmlnYW5hID0gYXdhaXQgcGFyc2VkVG9GdXJpZ2FuYShwYXJzZWQubW9ycGhlbWVzLCBzZWVuKTtcbiAgICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgYCR7RlVSSUdBTkFfQkxPQ0t9ICR7ZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpfWApO1xuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzZWVuLnNldChwcm9tcHQsIHtmdXJpZ2FuYTogW1tyZXNwb25zZXNbMF1dXSwgcmVhZGluZzogcmVzcG9uc2VzWzBdfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hQnVsbGV0cyA9IGJsb2NrLmZpbHRlcihzID0+IHMuc3RhcnRzV2l0aChGVVJJR0FOQV9CTE9DSykpO1xuICAgICAgICBpZiAoZnVyaWdhbmFCdWxsZXRzLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IGZ1cmlnYW5hID0gc3RyaW5nVG9GdXJpZ2FuYShmdXJpZ2FuYUJ1bGxldHNbMF0uc2xpY2UoRlVSSUdBTkFfQkxPQ0subGVuZ3RoKSlcbiAgICAgICAgICBzZWVuLnNldChwcm9tcHQsIHtmdXJpZ2FuYTogW2Z1cmlnYW5hXSwgcmVhZGluZzogcmVzcG9uc2VzWzBdfSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRklYTUUgRFJZIHNhbWUgYXMgYWJvdmVcbiAgICAgIGNvbnN0IGZ1cmlnYW5hQnVsbGV0ID0gYmxvY2suZmluZChzID0+IHMuc3RhcnRzV2l0aChGVVJJR0FOQV9CTE9DSykpO1xuICAgICAgaWYgKGZ1cmlnYW5hQnVsbGV0KSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hID0gc3RyaW5nVG9GdXJpZ2FuYShmdXJpZ2FuYUJ1bGxldC5zbGljZShGVVJJR0FOQV9CTE9DSy5sZW5ndGgpKVxuICAgICAgICBzZWVuLnNldChwcm9tcHQsIHtmdXJpZ2FuYTogW2Z1cmlnYW5hXSwgcmVhZGluZzogcmVzcG9uc2VzWzBdfSk7XG4gICAgICB9XG4gICAgfVxuICAgIGJsb2NrID0gcHJlZml4LmNvbmNhdChibG9jayk7XG4gIH1cbiAgcmV0dXJuIGJsb2NrO1xufVxuXG4vLyByZXR1cm5zIHRydWUgaWYgcHJvbnVuY2lhdGlvbiDjgqrjg7zjgq3jg4ogdnMgbGVtbWFSZWFkaW5nIOOCquOCquOCreODiiwgaS5lLiwgaWYgYWxsIG5vbi1jaG91b25wdSBjaGFycyBhcmUgc2FtZVxuZnVuY3Rpb24gcHJvbnVuY2lhdGlvblJlYWRpbmdFcXVhbENob3VvbnB1KG06IE1vcnBoZW1lKTogYm9vbGVhbiB7XG4gIGlmIChtLnByb251bmNpYXRpb24gPT09IG0ubGVtbWFSZWFkaW5nKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChtLnByb251bmNpYXRpb24ubGVuZ3RoID09PSBtLmxlbW1hUmVhZGluZy5sZW5ndGggJiYgbS5wcm9udW5jaWF0aW9uLmluY2x1ZGVzKENIT1VPTlBVKSkge1xuICAgIGNvbnN0IHBzID0gbS5wcm9udW5jaWF0aW9uLnNwbGl0KCcnKTtcbiAgICBjb25zdCBycyA9IG0ubGVtbWFSZWFkaW5nLnNwbGl0KCcnKTtcbiAgICBmb3IgKGNvbnN0IFtpLCBwXSBvZiBlbnVtZXJhdGUocHMpKSB7XG4gICAgICBpZiAocCAhPT0gQ0hPVU9OUFUpIHtcbiAgICAgICAgaWYgKHAgIT09IHJzW2ldKSB7IHJldHVybiBmYWxzZTsgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtb3JwaGVtZTogTW9ycGhlbWUpIHtcbiAgLy8gdXNlIGxlbW1hIG9ubHkgd2hlbiBpbmZsZWN0ZWQsIG9yIHdoZW4gbGl0ZXJhbCBsYWNrcyBrYW5qaSBidXQgbGVtbWEgaGFzIHRoZW1cbiAgY29uc3QgdXNlTGVtbWEgPVxuICAgICAgKG1vcnBoZW1lLmluZmxlY3Rpb24gJiYgbW9ycGhlbWUuaW5mbGVjdGlvblswXSkgfHwgKGhhc0thbmppKG1vcnBoZW1lLmxlbW1hKSAmJiAhaGFzS2FuamkobW9ycGhlbWUubGl0ZXJhbCkpO1xuICBjb25zdCBwcm9tcHQgPSB1c2VMZW1tYSA/IG1vcnBoZW1lLmxlbW1hIDogbW9ycGhlbWUubGl0ZXJhbDtcbiAgY29uc3QgcmVzcG9uc2UgPSBrYXRhMmhpcmEodXNlTGVtbWEgPyBtb3JwaGVtZS5sZW1tYVJlYWRpbmcgOiBtb3JwaGVtZS5wcm9udW5jaWF0aW9uKTtcbiAge1xuICAgIGNvbnN0IGxlbW1hQW55d2F5ID0ga2F0YTJoaXJhKG1vcnBoZW1lLmxlbW1hUmVhZGluZyk7XG4gICAgaWYgKCF1c2VMZW1tYSAmJiByZXNwb25zZS5pbmNsdWRlcyhDSE9VT05QVSkgJiZcbiAgICAgICAgKGZpbmRBbHRlcm5hdGl2ZUNob3VvbnB1KHJlc3BvbnNlKS5maW5kKHMgPT4gcyA9PT0gbGVtbWFBbnl3YXkpIHx8XG4gICAgICAgICBwcm9udW5jaWF0aW9uUmVhZGluZ0VxdWFsQ2hvdW9ucHUobW9ycGhlbWUpKSkge1xuICAgICAgcmV0dXJuIHtwcm9tcHQsIHJlc3BvbnNlOiBrYXRhMmhpcmEobW9ycGhlbWUubGVtbWFSZWFkaW5nKX07XG4gICAgfVxuICB9XG4gIHJldHVybiB7cHJvbXB0LCByZXNwb25zZX07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHZvY2FiVG9GdXJpZ2FuYShtb3JwaGVtZXM6IE1vcnBoZW1lW10pOiBQcm9taXNlPEZ1cmlnYW5hW11bXT4ge1xuICByZXR1cm4gUHJvbWlzZS5hbGwobW9ycGhlbWVzLm1hcChhc3luYyBtID0+IHtcbiAgICBjb25zdCB7cHJvbXB0OiBsZW1tYSwgcmVzcG9uc2U6IGxlbW1hUmVhZGluZ30gPSBtb3JwaGVtZVRvUHJvbXB0UmVzcG9uc2UobSk7XG4gICAgaWYgKGhhc0thbmppKGxlbW1hKSkge1xuICAgICAgY29uc3Qge3RleHRUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgIGlmIChsZW1tYUhpdCkgeyByZXR1cm4gbGVtbWFIaXQuZnVyaWdhbmE7IH1cbiAgICB9XG4gICAgcmV0dXJuIFtoYXNLYW5qaShsZW1tYSkgPyB7cnVieTogbGVtbWEsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsZW1tYV07XG4gIH0pKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGFyc2VkVG9GdXJpZ2FuYShtb3JwaGVtZXM6IE1vcnBoZW1lW10sIHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+KTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICBpZiAoaGFzS2FuamkobGl0ZXJhbCkpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHNlZW4uZ2V0KGxpdGVyYWwpO1xuICAgICAgaWYgKGhpdCkgeyByZXR1cm4gZmxhdHRlbihoaXQuZnVyaWdhbmEpIHx8IFtdOyB9XG5cbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeSwgcmVhZGluZ1RvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgIGNvbnN0IGxpdGVyYWxIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxpdGVyYWwsICdyZWFkaW5nJywgcHJvbnVuY2lhdGlvbik7XG4gICAgICBpZiAobGl0ZXJhbEhpdCkgeyByZXR1cm4gbGl0ZXJhbEhpdC5mdXJpZ2FuYTsgfVxuICAgICAgY29uc3QgcHJvbnVuY2lhdGlvbkhpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgcHJvbnVuY2lhdGlvbiwgJ3RleHQnLCBsaXRlcmFsKTtcbiAgICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsZW1tYSwgJ3JlYWRpbmcnLCBsZW1tYVJlYWRpbmcpO1xuICAgICAgaWYgKGxlbW1hSGl0KSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hRGljdDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcbiAgICAgICAgZm9yIChjb25zdCBmIG9mIGxlbW1hSGl0LmZ1cmlnYW5hKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmID09PSAnc3RyaW5nJykgeyBjb250aW51ZTsgfVxuICAgICAgICAgIGZ1cmlnYW5hRGljdC5zZXQoZi5ydWJ5LCBmLnJ0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNoYXJzID0gbGl0ZXJhbC5zcGxpdCgnJyk7XG4gICAgICAgIGxldCBrYW5qaSA9IGNoYXJzLmZpbHRlcihoYXNLYW5qaSk7XG4gICAgICAgIGNvbnN0IGFubm90YXRlZENoYXJzOiBGdXJpZ2FuYVtdID0gY2hhcnMuc2xpY2UoKTtcblxuICAgICAgICAvLyBzdGFydCBmcm9tIGFsbCBrYW5qaSBjaGFyYWN0ZXJzIGluIGEgc3RyaW5nLCBzZWUgaWYgdGhhdCdzIGluIGZ1cmlnYW5hRGljdCwgaWYgbm90LCBjaG9wIGxhc3RcbiAgICAgICAgd2hpbGUgKGthbmppLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IGhpdCA9IHRyaXUoa2FuamkpLmZpbmQoa3MgPT4gZnVyaWdhbmFEaWN0Lmhhcyhrcy5qb2luKCcnKSkpO1xuICAgICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICAgIGNvbnN0IGhpdHN0ciA9IGhpdC5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpdGVyYWwuaW5kZXhPZihoaXRzdHIpO1xuICAgICAgICAgICAgYW5ub3RhdGVkQ2hhcnNbaWR4XSA9IHtydWJ5OiBoaXRzdHIsIHJ0OiBmdXJpZ2FuYURpY3QuZ2V0KGhpdHN0cikgfHwgaGl0c3RyfTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpZHggKyAxOyBpIDwgaWR4ICsgaGl0c3RyLmxlbmd0aDsgaSsrKSB7IGFubm90YXRlZENoYXJzW2ldID0gJyc7IH1cbiAgICAgICAgICAgIGthbmppID0ga2Fuamkuc2xpY2UoaGl0c3RyLmxlbmd0aCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFubm90YXRlZENoYXJzO1xuICAgICAgfVxuICAgICAgLy8gY29uc3QgbGVtbWFSZWFkaW5nSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBsZW1tYVJlYWRpbmcsICd0ZXh0JywgbGVtbWEpO1xuICAgICAgLy8gaWYgKGxlbW1hUmVhZGluZ0hpdCkgeyByZXR1cm4gbGVtbWFSZWFkaW5nSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGl0ZXJhbCkgPyB7cnVieTogbGl0ZXJhbCwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxpdGVyYWxdO1xuICB9KSk7XG5cbiAgcmV0dXJuIGZ1cmlnYW5hO1xufVxuXG5mdW5jdGlvbiB0cml1PFQ+KGFycjogVFtdKTogVFtdW10ge1xuICBjb25zdCByZXQ6IFRbXVtdID0gW107XG4gIGZvciAobGV0IGkgPSBhcnIubGVuZ3RoOyBpID4gMDsgLS1pKSB7IHJldC5wdXNoKGFyci5zbGljZSgwLCBpKSk7IH1cbiAgcmV0dXJuIHJldDtcbn1cblxuY29uc3QgQ0hPVU9OUFVfUFJFRklYX01BUCA9IGNyZWF0ZUNob3VvbnB1UHJlZml4TWFwKCk7XG5jb25zdCBDSE9VT05QVSA9ICfjg7wnOyAvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9DaCVDNSU4RG9ucHVcbmZ1bmN0aW9uIGNyZWF0ZUNob3VvbnB1UHJlZml4TWFwKCkge1xuICBjb25zdCBwcmVmaXhlcyA9ICfjgYLjgYTjgYbjgYTjgYYnO1xuICBjb25zdCBtYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG4gIGDjgYHjgYLjgYvjgYzjgZXjgZbjgZ/jgaDjgarjga/jgbDjgbHjgb7jgoPjgoTjgonjgo7jgo9cbuOBg+OBhOOBjeOBjuOBl+OBmOOBoeOBouOBq+OBsuOBs+OBtOOBv+OCilxu44GF44GG44GP44GQ44GZ44Ga44Gj44Gk44Gl44Gs44G144G244G344KA44KF44KG44KL44KUXG7jgYfjgYjjgZHjgZLjgZvjgZzjgabjgafjga3jgbjjgbnjgbrjgoHjgoxcbuOBieOBiuOBk+OBlOOBneOBnuOBqOOBqeOBruOBu+OBvOOBveOCguOCh+OCiOOCjeOCkmAuc3BsaXQoJ1xcbicpXG4gICAgICAuZm9yRWFjaCgobGluZSwgaSkgPT4gbGluZS5zcGxpdCgnJykuZm9yRWFjaChzID0+IG1hcC5zZXQocywgcyArIHByZWZpeGVzW2ldKSkpO1xuICByZXR1cm4gbWFwO1xufVxuXG5mdW5jdGlvbiBmaW5kQWx0ZXJuYXRpdmVDaG91b25wdShoaXJhZ2FuYTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBoaXRzID0gW2hpcmFnYW5hXTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBoaXJhZ2FuYS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChoaXJhZ2FuYVtpXSA9PT0gQ0hPVU9OUFUpIHtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gQ0hPVU9OUFVfUFJFRklYX01BUC5nZXQoaGlyYWdhbmFbaSAtIDFdKTtcbiAgICAgIGlmIChyZXBsYWNlbWVudCkge1xuICAgICAgICBjb25zdCBwcmVmaXggPSBoaXJhZ2FuYS5zbGljZSgwLCBpIC0gMSk7XG4gICAgICAgIGNvbnN0IHBvc3RmaXggPSBoaXJhZ2FuYS5zbGljZShpICsgMSk7XG4gICAgICAgIGhpdHMucHVzaChwcmVmaXggKyByZXBsYWNlbWVudCArIHBvc3RmaXgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gaGl0cztcbn1cbmZ1bmN0aW9uIHNlYXJjaChtYXA6IE1hcDxzdHJpbmcsIEVudHJ5W10+LCBmaXJzdDogc3RyaW5nLCBzdWI6ICdyZWFkaW5nJ3wndGV4dCcsIHNlY29uZDogc3RyaW5nKTogRW50cnl8dW5kZWZpbmVkIHtcbiAgY29uc3QgaGl0ID0gbWFwLmdldChmaXJzdCk7XG4gIGlmIChoaXQpIHtcbiAgICBpZiAoaGl0Lmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gaGl0WzBdOyB9XG4gICAgY29uc3QgcG9zc2libGVTZWNvbmRzID0gZmluZEFsdGVybmF0aXZlQ2hvdW9ucHUoa2F0YTJoaXJhKHNlY29uZCkpO1xuICAgIGNvbnN0IHN1YmhpdCA9IGhpdC5maW5kKGUgPT4ge1xuICAgICAgY29uc3QgZGljdCA9IGthdGEyaGlyYShlW3N1Yl0pO1xuICAgICAgcmV0dXJuIHBvc3NpYmxlU2Vjb25kcy5zb21lKHNlY29uZCA9PiBzZWNvbmQgPT09IGRpY3QpO1xuICAgIH0pO1xuICAgIGlmIChzdWJoaXQpIHsgcmV0dXJuIHN1YmhpdDsgfVxuICAgIGNvbnNvbGUuZXJyb3IoYGZvdW5kIGhpdCBmb3IgJHtmaXJzdH0gYnV0IG5vdCAke3NlY29uZH1gLCB7aGl0LCBwb3NzaWJsZVNlY29uZHN9KTtcbiAgfVxufVxuXG4vKipcbiAqIEVuc3VyZSBuZWVkbGUgaXMgZm91bmQgaW4gaGF5c3RhY2sgb25seSBvbmNlXG4gKiBAcGFyYW0gaGF5c3RhY2sgYmlnIHN0cmluZ1xuICogQHBhcmFtIG5lZWRsZSBsaXR0bGUgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIGFwcGVhcnNFeGFjdGx5T25jZShoYXlzdGFjazogc3RyaW5nLCBuZWVkbGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBsZXQgaGl0OiBudW1iZXI7XG4gIHJldHVybiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpKSA+PSAwICYmIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSwgaGl0ICsgMSkpIDwgMDtcbn1cbi8qKlxuICogR2l2ZW4gdGhyZWUgY29uc2VjdXRpZXMgc3Vic3RyaW5ncyAodGhlIGFyZ3VtZW50cyksIHJldHVybiBlaXRoZXJcbiAqIC0gYCR7bGVmdDJ9WyR7Y2xvemV9XSR7cmlnaHQyfWAgd2hlcmUgYGxlZnQyYCBhbmQgYHJpZ2h0MmAgYXJlIGFzIHNob3J0IGFzIHBvc3NpYmxlIChhbmQgb2YgZXF1YWwgbGVuZ3RoLCBpZlxuICogICAgcG9zc2libGUpIHNvIHRoZSB0aGlzIHJldHVybiBzdHJpbmcgKG1pbnVzIHRoZSBicmFja2V0cykgaXMgdW5pcXVlIGluIHRoZSBmdWxsIHN0cmluZywgb3JcbiAqIC0gYCR7Y2xvemV9YCBpZiBgbGVmdDIgPT09IHJpZ2h0MiA9PT0gJydgIChpLmUuLCB0aGUgYWJvdmUgYnV0IHdpdGhvdXQgdGhlIGJyYWNrZXRzKS5cbiAqIEBwYXJhbSBsZWZ0IGxlZnQgc3RyaW5nLCBwb3NzaWJseSBlbXB0eVxuICogQHBhcmFtIGNsb3plIG1pZGRsZSBzdHJpbmdcbiAqIEBwYXJhbSByaWdodCByaWdodCBzdHJpbmcsIHBvc3NpYmxlIGVtcHR5XG4gKiBAdGhyb3dzIGluIHRoZSB1bmxpa2VseSBldmVudCB0aGF0IHN1Y2ggYSByZXR1cm4gc3RyaW5nIGNhbm5vdCBiZSBidWlsZCAoSSBjYW5ub3QgdGhpbmsgb2YgYW4gZXhhbXBsZSB0aG91Z2gpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0OiBzdHJpbmcsIGNsb3plOiBzdHJpbmcsIHJpZ2h0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBzZW50ZW5jZSA9IGxlZnQgKyBjbG96ZSArIHJpZ2h0O1xuICBsZXQgbGVmdENvbnRleHQgPSAnJztcbiAgbGV0IHJpZ2h0Q29udGV4dCA9ICcnO1xuICBsZXQgY29udGV4dExlbmd0aCA9IDA7XG4gIHdoaWxlICghYXBwZWFyc0V4YWN0bHlPbmNlKHNlbnRlbmNlLCBsZWZ0Q29udGV4dCArIGNsb3plICsgcmlnaHRDb250ZXh0KSkge1xuICAgIGNvbnRleHRMZW5ndGgrKztcbiAgICBpZiAoY29udGV4dExlbmd0aCA+PSBsZWZ0Lmxlbmd0aCAmJiBjb250ZXh0TGVuZ3RoID49IHJpZ2h0Lmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW4gb3V0IG9mIGNvbnRleHQgdG8gYnVpbGQgdW5pcXVlIGNsb3plJyk7XG4gICAgfVxuICAgIGxlZnRDb250ZXh0ID0gbGVmdC5zbGljZSgtY29udGV4dExlbmd0aCk7XG4gICAgcmlnaHRDb250ZXh0ID0gcmlnaHQuc2xpY2UoMCwgY29udGV4dExlbmd0aCk7XG4gIH1cbiAgaWYgKGxlZnRDb250ZXh0ID09PSAnJyAmJiByaWdodENvbnRleHQgPT09ICcnKSB7IHJldHVybiBjbG96ZTsgfVxuICByZXR1cm4gYCR7bGVmdENvbnRleHR9WyR7Y2xvemV9XSR7cmlnaHRDb250ZXh0fWA7XG59XG5cbmZ1bmN0aW9uIGlkZW50aWZ5RmlsbEluQmxhbmtzKGJ1bnNldHN1czogTW9ycGhlbWVbXVtdKSB7XG4gIC8vIEZpbmQgY2xvemVzOiBwYXJ0aWNsZXMgYW5kIGNvbmp1Z2F0ZWQgdmVyYi9hZGplY3RpdmUgcGhyYXNlc1xuICBsZXQgbGl0ZXJhbENsb3plczogTWFwPHN0cmluZywgTW9ycGhlbWVbXT4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgW2JpZHgsIGJ1bnNldHN1XSBvZiBlbnVtZXJhdGUoYnVuc2V0c3VzKSkge1xuICAgIGxldCBmaXJzdCA9IGJ1bnNldHN1WzBdO1xuICAgIGlmICghZmlyc3QpIHsgY29udGludWU7IH1cbiAgICBjb25zdCBwb3MwID0gZmlyc3QucGFydE9mU3BlZWNoWzBdO1xuICAgIGxldCBzZWFyY2hGb3JQYXJ0aWNsZXMgPSB0cnVlO1xuICAgIGlmIChidW5zZXRzdXMubGVuZ3RoID4gMSAmJiBidW5zZXRzdS5sZW5ndGggPiAxICYmXG4gICAgICAgIChwb3MwLnN0YXJ0c1dpdGgoJ3ZlcmInKSB8fCBwb3MwLmVuZHNXaXRoKCdfdmVyYicpIHx8IHBvczAuc3RhcnRzV2l0aCgnYWRqZWN0JykpKSB7XG4gICAgICBsZXQgaWdub3JlUmlnaHQgPSBmaWx0ZXJSaWdodChidW5zZXRzdSwgbSA9PiAhZ29vZE1vcnBoZW1lUHJlZGljYXRlKG0pKTtcbiAgICAgIGxldCBnb29kQnVuc2V0c3UgPSBpZ25vcmVSaWdodC5sZW5ndGggPT09IDAgPyBidW5zZXRzdSA6IGJ1bnNldHN1LnNsaWNlKDAsIC1pZ25vcmVSaWdodC5sZW5ndGgpO1xuICAgICAgaWYgKGdvb2RCdW5zZXRzdS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHNlYXJjaEZvclBhcnRpY2xlcyA9IGZhbHNlO1xuICAgICAgICBsZXQgY2xvemUgPSBidW5zZXRzdVRvU3RyaW5nKGdvb2RCdW5zZXRzdSk7XG4gICAgICAgIGxldCBsZWZ0ID0gYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gYnVuc2V0c3VUb1N0cmluZyhpZ25vcmVSaWdodCkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIGNsb3plLCByaWdodCksIGdvb2RCdW5zZXRzdSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIG9ubHkgYWRkIHBhcnRpY2xlcyBpZiB0aGV5J3JlIE5PVCBpbnNpZGUgY29uanVnYXRlZCBwaHJhc2VzXG4gICAgY29uc3QgcGFydGljbGVQcmVkaWNhdGUgPSAocDogTW9ycGhlbWUpID0+IHAucGFydE9mU3BlZWNoWzBdLnN0YXJ0c1dpdGgoJ3BhcnRpY2xlJykgJiYgcC5wYXJ0T2ZTcGVlY2gubGVuZ3RoID4gMSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhcC5wYXJ0T2ZTcGVlY2hbMV0uc3RhcnRzV2l0aCgncGhyYXNlX2ZpbmFsJyk7XG4gICAgaWYgKHNlYXJjaEZvclBhcnRpY2xlcykge1xuICAgICAgZm9yIChsZXQgW3BpZHgsIHBhcnRpY2xlXSBvZiBlbnVtZXJhdGUoYnVuc2V0c3UpKSB7XG4gICAgICAgIGlmIChwYXJ0aWNsZVByZWRpY2F0ZShwYXJ0aWNsZSkpIHtcbiAgICAgICAgICBsZXQgbGVmdCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJykgKyBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKDAsIHBpZHgpKTtcbiAgICAgICAgICBsZXQgcmlnaHQgPVxuICAgICAgICAgICAgICBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKHBpZHggKyAxKSkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgcGFydGljbGUubGl0ZXJhbCwgcmlnaHQpLCBbcGFydGljbGVdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBsZXQgZXhpc3RpbmdDbG96ZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldChbXSk7XG4gIGxldCBidWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGxldCBbY2xvemUsIGJ1bnNldHN1XSBvZiBsaXRlcmFsQ2xvemVzKSB7XG4gICAgaWYgKCFleGlzdGluZ0Nsb3plcy5oYXMoY2xvemUpKSB7XG4gICAgICBsZXQgYWNjZXB0YWJsZSA9IFtjbG96ZV07XG4gICAgICBpZiAoaGFzS2FuamkoYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdSkpKSB7XG4gICAgICAgIGFjY2VwdGFibGUucHVzaChrYXRhMmhpcmEoYnVuc2V0c3UubWFwKG0gPT4gbS5wcm9udW5jaWF0aW9uKS5qb2luKCcnKSkpXG4gICAgICB9XG4gICAgICBidWxsZXRzLnB1c2goJy0gQGZpbGwgJyArIGFjY2VwdGFibGUuam9pbignIEAgJykgK1xuICAgICAgICAgICAgICAgICAgIGAgICAgQHBvcyAke2J1bnNldHN1Lm1hcChtID0+IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKSkuam9pbignLycpfWApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYnVsbGV0cztcbn1cblxuY29uc3QgVVNBR0UgPSBgVVNBR0UgMTpcbiQgbm9kZSBbdGhpcy1zY3JpcHQuanNdIFttYXJrZG93bi5tZF1cblxuVVNBR0UgMjpcbiQgY2F0IFttYXJrZG93bi5tZF0gfCBub2RlIFt0aGlzLXNjcmlwdC5qc11cblxuQm90aCB3aWxsIHByaW50IGEgcGFyc2VkIHZlcnNpb24gb2YgdGhlIGlucHV0LmA7XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcHJvbWlzaWZ5ID0gcmVxdWlyZSgndXRpbCcpLnByb21pc2lmeTtcbiAgY29uc3QgcmVhZEZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnZnMnKS5yZWFkRmlsZSk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBjb25zdCB0ZXh0ID0gcHJvY2Vzcy5hcmd2WzJdID8gYXdhaXQgcmVhZEZpbGUocHJvY2Vzcy5hcmd2WzJdLCAndXRmOCcpIDogKChhd2FpdCBnZXRTdGRpbigpKSB8fCBVU0FHRSk7XG4gICAgLy8gU3BsaXQgTWFya2Rvd24gYXQgaGVhZGVyIChgIyBibGFibGFgKVxuICAgIGxldCBibG9ja3MgPSBzcGxpdEF0SGVhZGVycyh0ZXh0KTtcbiAgICAvLyBQYXJzZSBoZWFkZXJzXG4gICAgbGV0IGNvbnRlbnQgPSBhd2FpdCBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3MpO1xuICAgIC8vIFByaW50IHJlc3VsdFxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbnRlbnQubWFwKHYgPT4gdi5qb2luKCdcXG4nKSkuam9pbignXFxuJykpO1xuICB9KSgpO1xufSJdfQ==