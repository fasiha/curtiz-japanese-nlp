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
