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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFDQSxtQ0FBaUM7QUFDakMsaUNBQWlDO0FBQ2pDLCtDQUFrSDtBQUNsSCwrQ0FBK0Y7QUFDL0YsK0RBQWdHO0FBRWhHLE1BQU0sY0FBYyxHQUFHLDRCQUFLLEVBQUUsQ0FBQztBQUUvQixTQUFzQixLQUFLLENBQUMsUUFBZ0I7O1FBQzFDLElBQUksUUFBUSxHQUFHLE1BQU0seUJBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMzQyxJQUFJLFNBQVMsR0FBRyx1Q0FBeUIsQ0FBQyx3QkFBVSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RixJQUFJLFNBQVMsR0FBRyxNQUFNLGdCQUFRLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3BELE9BQU8sRUFBQyxTQUFTLEVBQUUsU0FBUyxFQUFDLENBQUM7SUFDaEMsQ0FBQztDQUFBO0FBTEQsc0JBS0M7QUFFRCxNQUFNLGdCQUFnQixHQUFHLENBQUMsU0FBcUIsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFM0YsU0FBZ0IsY0FBYyxDQUFDLElBQVk7SUFDekMsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDO0lBQzdCLE9BQU8sMEJBQVcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzlELENBQUM7QUFIRCx3Q0FHQztBQUVE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LE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbEUsQ0FBQztLQUFBLENBQUMsRUFBRSxDQUFDO0NBQ04iLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQge2FkZEpkZXBwfSBmcm9tICcuL2pkZXBwJztcbmltcG9ydCB7a2F0YTJoaXJhfSBmcm9tICcuL2thbmEnO1xuaW1wb3J0IHtnb29kTW9ycGhlbWVQcmVkaWNhdGUsIGludm9rZU1lY2FiLCBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzLCBNb3JwaGVtZSwgcGFyc2VNZWNhYn0gZnJvbSAnLi9tZWNhYlVuaWRpYyc7XG5pbXBvcnQge2VudW1lcmF0ZSwgZmlsdGVyUmlnaHQsIGZsYXR0ZW4sIGhhc0thbmppLCBwYXJ0aXRpb25CeSwgdGFrZVdoaWxlfSBmcm9tICdjdXJ0aXotdXRpbHMnO1xuaW1wb3J0IHtFbnRyeSwgZnVyaWdhbmFUb1N0cmluZywgRnVyaWdhbmEsIHNldHVwLCBzdHJpbmdUb0Z1cmlnYW5hfSBmcm9tICdqbWRpY3QtZnVyaWdhbmEtbm9kZSc7XG5cbmNvbnN0IEptZGljdEZ1cmlnYW5hID0gc2V0dXAoKTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlKHNlbnRlbmNlOiBzdHJpbmcpOiBQcm9taXNlPHttb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO30+IHtcbiAgbGV0IHJhd01lY2FiID0gYXdhaXQgaW52b2tlTWVjYWIoc2VudGVuY2UpO1xuICBsZXQgbW9ycGhlbWVzID0gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyhwYXJzZU1lY2FiKHNlbnRlbmNlLCByYXdNZWNhYilbMF0uZmlsdGVyKG8gPT4gISFvKSk7XG4gIGxldCBidW5zZXRzdXMgPSBhd2FpdCBhZGRKZGVwcChyYXdNZWNhYiwgbW9ycGhlbWVzKTtcbiAgcmV0dXJuIHttb3JwaGVtZXMsIGJ1bnNldHN1c307XG59XG5cbmNvbnN0IGJ1bnNldHN1VG9TdHJpbmcgPSAobW9ycGhlbWVzOiBNb3JwaGVtZVtdKSA9PiBtb3JwaGVtZXMubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNwbGl0QXRIZWFkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdW10ge1xuICBjb25zdCBoZWFkZXJSZSA9IC9eIytcXHMrLiskLztcbiAgcmV0dXJuIHBhcnRpdGlvbkJ5KHRleHQuc3BsaXQoJ1xcbicpLCBzID0+IGhlYWRlclJlLnRlc3QocykpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzOiBzdHJpbmdbXVtdLCBjb25jdXJyZW50TGltaXQ6IG51bWJlciA9IDEpIHtcbiAgbGV0IHJldDogc3RyaW5nW11bXSA9IFtdO1xuICBsZXQgcHJvbWlzZXM6IFByb21pc2U8c3RyaW5nW10+W10gPSBbXTtcbiAgY29uc3Qgc2VlbjogTWFwPHN0cmluZywgU2Vlbj4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgbyBvZiBibG9ja3MpIHtcbiAgICBpZiAocHJvbWlzZXMubGVuZ3RoID49IGNvbmN1cnJlbnRMaW1pdCkge1xuICAgICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gICAgICBwcm9taXNlcyA9IFtdO1xuICAgIH1cbiAgICBwcm9taXNlcy5wdXNoKHBhcnNlSGVhZGVyQmxvY2sobywgc2VlbikpO1xuICB9XG4gIGlmIChwcm9taXNlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IFBMRUFTRV9QQVJTRV9CTE9DSyA9ICctIEBwbGVhc2VQYXJzZSc7XG5jb25zdCBGVVJJR0FOQV9CTE9DSyA9ICctIEBmdXJpZ2FuYSc7XG5cbmNvbnN0IGZsYXNoYWJsZU1vcnBoZW1lID0gKG06IE1vcnBoZW1lKSA9PiB7XG4gIGNvbnN0IHBvcyA9IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKTtcbiAgaWYgKGhhc0thbmppKG0ubGl0ZXJhbCkgJiYgIXBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgaWYgKHBvcy5zdGFydHNXaXRoKCd2ZXJiLScpIHx8IHBvcy5zdGFydHNXaXRoKCdub3VuJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ3Byb25vdW4nKSB8fCBwb3Muc3RhcnRzV2l0aCgnYWRqZWN0aXYnKSB8fFxuICAgICAgcG9zLnN0YXJ0c1dpdGgoJ2FkdmVyYicpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcbmZ1bmN0aW9uIG1vcnBoZW1lVG9SZWFkaW5nKG06IE1vcnBoZW1lKTogc3RyaW5nIHtcbiAgaWYgKCFoYXNLYW5qaShtLmxpdGVyYWwpKSB7IHJldHVybiBtLmxpdGVyYWw7IH1cbiAgY29uc3QgcmV0ID0ga2F0YTJoaXJhKG0ubGl0ZXJhbCA9PT0gbS5sZW1tYSA/IG0ubGVtbWFSZWFkaW5nIDogbS5wcm9udW5jaWF0aW9uKTtcbiAgaWYgKCFyZXQuaW5jbHVkZXMoQ0hPVU9OUFUpKSB7IHJldHVybiByZXQ7IH1cbiAgY29uc3QgYWx0cyA9IGZpbmRBbHRlcm5hdGl2ZUNob3VvbnB1KHJldCk7XG4gIHJldHVybiBhbHRzWzFdIHx8IHJldDtcbn1cbnR5cGUgUGFyc2VkID0ge1xuICBtb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO1xufTtcbnR5cGUgU2VlbiA9IHtcbiAgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXTsgcmVhZGluZzogc3RyaW5nO1xufTtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUhlYWRlckJsb2NrKGJsb2NrOiBzdHJpbmdbXSwgc2VlbjogTWFwPHN0cmluZywgU2Vlbj4gPSBuZXcgTWFwKFtdKSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3QgYXRIZWFkZXJSZSA9IC9eIytcXHMrQFxccysvO1xuICBjb25zdCBtYXRjaCA9IGJsb2NrWzBdLm1hdGNoKGF0SGVhZGVyUmUpO1xuICBpZiAobWF0Y2gpIHtcbiAgICBjb25zdCBsaW5lID0gYmxvY2tbMF0uc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKTsgLy8gbWludXMgdGhlIGZpcnN0IEBcblxuICAgIGxldCBbcHJvbXB0LCAuLi5yZXNwb25zZXNdID0gbGluZS5zcGxpdCgnQCcpLm1hcChzID0+IHMudHJpbSgpKTtcbiAgICBjb25zdCBwcmVmaXg6IHN0cmluZ1tdID0gW107XG4gICAgLy8gcHJvY2VzcyBsaW5lIGFuZCBibG9jay5cbiAgICBjb25zdCBuZWVkc1Jlc3BvbnNlID0gcmVzcG9uc2VzLmxlbmd0aCA9PT0gMSAmJiByZXNwb25zZXNbMF0ubGVuZ3RoID09IDA7XG4gICAgY29uc3QgaGFzUGxlYXNlUGFyc2UgPVxuICAgICAgICB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChQTEVBU0VfUEFSU0VfQkxPQ0spKTtcbiAgICBjb25zdCBoYXNGdXJpZ2FuYSA9IHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgaWYgKG5lZWRzUmVzcG9uc2UgfHwgaGFzUGxlYXNlUGFyc2UgfHwgIWhhc0Z1cmlnYW5hKSB7XG4gICAgICBjb25zdCBwYXJzZWQ6IFBhcnNlZCA9IGF3YWl0IHBhcnNlKHByb21wdCk7XG4gICAgICBpZiAobmVlZHNSZXNwb25zZSkge1xuICAgICAgICByZXNwb25zZXMgPSBba2F0YTJoaXJhKGZsYXR0ZW4ocGFyc2VkLmJ1bnNldHN1cylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihtID0+IG0ucGFydE9mU3BlZWNoWzBdICE9PSAnc3VwcGxlbWVudGFyeV9zeW1ib2wnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKG0gPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGhpdCA9IHNlZW4uZ2V0KG0ubGl0ZXJhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhpdCA/IGhpdC5yZWFkaW5nIDogbW9ycGhlbWVUb1JlYWRpbmcobSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5qb2luKCcnKSldO1xuICAgICAgICBibG9ja1swXSA9IGJsb2NrWzBdICsgKGJsb2NrWzBdLmVuZHNXaXRoKCcgJykgPyAnJyA6ICcgJykgKyByZXNwb25zZXNbMF07XG4gICAgICB9XG4gICAgICBpZiAoaGFzUGxlYXNlUGFyc2UpIHtcbiAgICAgICAgLy8gYWRkIEAgdm9jYWJ1bGFyeSBsaW5lczpcbiAgICAgICAgbGV0IGZsYXNoQnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgW21pZHgsIG1vcnBoZW1lXSBvZiBlbnVtZXJhdGUocGFyc2VkLm1vcnBoZW1lcykpIHtcbiAgICAgICAgICBpZiAocGFyc2VkLm1vcnBoZW1lcy5sZW5ndGggPT09IDEpIHsgYnJlYWs7IH1cbiAgICAgICAgICBpZiAoZmxhc2hhYmxlTW9ycGhlbWUobW9ycGhlbWUpKSB7XG4gICAgICAgICAgICBsZXQge3Byb21wdDogbXByb21wdCwgcmVzcG9uc2U6IG1yZXNwb25zZX0gPSBtb3JwaGVtZVRvUHJvbXB0UmVzcG9uc2UobW9ycGhlbWUpO1xuXG4gICAgICAgICAgICBsZXQgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IFtdO1xuICAgICAgICAgICAgaWYgKGhhc0thbmppKG1wcm9tcHQpKSB7IGZ1cmlnYW5hID0gYXdhaXQgdm9jYWJUb0Z1cmlnYW5hKFttb3JwaGVtZV0pOyB9XG5cbiAgICAgICAgICAgIGNvbnN0IGhpdCA9IHNlZW4uZ2V0KG1wcm9tcHQpO1xuICAgICAgICAgICAgaWYgKCFoaXQpIHtcbiAgICAgICAgICAgICAgcHJlZml4LnB1c2gobWF0Y2hbMF0gKyBgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfWApO1xuICAgICAgICAgICAgICBwcmVmaXgucHVzaChGVVJJR0FOQV9CTE9DSyArICcgJyArIGZ1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKGAoQXV0by1hZGRlZCB2aWEg44COJHtwcm9tcHR944CPKWApO1xuICAgICAgICAgICAgICBzZWVuLnNldChtcHJvbXB0LCB7ZnVyaWdhbmEsIHJlYWRpbmc6IG1yZXNwb25zZX0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbXJlc3BvbnNlID0gaGl0LnJlYWRpbmc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGxlZnQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKDAsIG1pZHgpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UobWlkeCArIDEpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBsZXQgY2xvemUgPSBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgbW9ycGhlbWUubGl0ZXJhbCwgcmlnaHQpO1xuICAgICAgICAgICAgbGV0IGZpbmFsID0gJyc7XG4gICAgICAgICAgICBpZiAobXByb21wdCA9PT0gbW9ycGhlbWUubGl0ZXJhbCAmJiBhcHBlYXJzRXhhY3RseU9uY2UocHJvbXB0LCBtb3JwaGVtZS5saXRlcmFsKSkge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfSBAb21pdCAke2Nsb3plfWA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZsYXNoQnVsbGV0cy5wdXNoKGZpbmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmZsYXNoQnVsbGV0cyk7XG5cbiAgICAgICAgLy8gYWRkIEBmaWxsIGxpbmVzXG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5pZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIEBwbGVhc2VQYXJzZVxuICAgICAgICBibG9jayA9IGJsb2NrLmZpbHRlcihzID0+ICFzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgICB9XG4gICAgICBpZiAoIWhhc0Z1cmlnYW5hKSB7XG4gICAgICAgIGlmIChoYXNLYW5qaShwcm9tcHQpKSB7XG4gICAgICAgICAgLy8gYWRkIGZ1cmlnYW5hIGxpbmVcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IGF3YWl0IHBhcnNlZFRvRnVyaWdhbmEocGFyc2VkLm1vcnBoZW1lcywgc2Vlbik7XG4gICAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIGAke0ZVUklHQU5BX0JMT0NLfSAke2Z1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKX1gKTtcbiAgICAgICAgICBzZWVuLnNldChwcm9tcHQsIHtmdXJpZ2FuYSwgcmVhZGluZzogcmVzcG9uc2VzWzBdfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtbcmVzcG9uc2VzWzBdXV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYUJ1bGxldHMgPSBibG9jay5maWx0ZXIocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICAgICAgaWYgKGZ1cmlnYW5hQnVsbGV0cy5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IHN0cmluZ1RvRnVyaWdhbmEoZnVyaWdhbmFCdWxsZXRzWzBdLnNsaWNlKEZVUklHQU5BX0JMT0NLLmxlbmd0aCkpXG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtmdXJpZ2FuYV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZJWE1FIERSWSBzYW1lIGFzIGFib3ZlXG4gICAgICBjb25zdCBmdXJpZ2FuYUJ1bGxldCA9IGJsb2NrLmZpbmQocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICAgIGlmIChmdXJpZ2FuYUJ1bGxldCkge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IHN0cmluZ1RvRnVyaWdhbmEoZnVyaWdhbmFCdWxsZXQuc2xpY2UoRlVSSUdBTkFfQkxPQ0subGVuZ3RoKSlcbiAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtmdXJpZ2FuYV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgfVxuICAgIH1cbiAgICBibG9jayA9IHByZWZpeC5jb25jYXQoYmxvY2spO1xuICB9XG4gIHJldHVybiBibG9jaztcbn1cblxuLy8gcmV0dXJucyB0cnVlIGlmIHByb251bmNpYXRpb24g44Kq44O844Kt44OKIHZzIGxlbW1hUmVhZGluZyDjgqrjgqrjgq3jg4osIGkuZS4sIGlmIGFsbCBub24tY2hvdW9ucHUgY2hhcnMgYXJlIHNhbWVcbmZ1bmN0aW9uIHByb251bmNpYXRpb25SZWFkaW5nRXF1YWxDaG91b25wdShtOiBNb3JwaGVtZSk6IGJvb2xlYW4ge1xuICBpZiAobS5wcm9udW5jaWF0aW9uID09PSBtLmxlbW1hUmVhZGluZykgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAobS5wcm9udW5jaWF0aW9uLmxlbmd0aCA9PT0gbS5sZW1tYVJlYWRpbmcubGVuZ3RoICYmIG0ucHJvbnVuY2lhdGlvbi5pbmNsdWRlcyhDSE9VT05QVSkpIHtcbiAgICBjb25zdCBwcyA9IG0ucHJvbnVuY2lhdGlvbi5zcGxpdCgnJyk7XG4gICAgY29uc3QgcnMgPSBtLmxlbW1hUmVhZGluZy5zcGxpdCgnJyk7XG4gICAgZm9yIChjb25zdCBbaSwgcF0gb2YgZW51bWVyYXRlKHBzKSkge1xuICAgICAgaWYgKHAgIT09IENIT1VPTlBVKSB7XG4gICAgICAgIGlmIChwICE9PSByc1tpXSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBtb3JwaGVtZVRvUHJvbXB0UmVzcG9uc2UobW9ycGhlbWU6IE1vcnBoZW1lKSB7XG4gIC8vIHVzZSBsZW1tYSBvbmx5IHdoZW4gaW5mbGVjdGVkLCBvciB3aGVuIGxpdGVyYWwgbGFja3Mga2FuamkgYnV0IGxlbW1hIGhhcyB0aGVtXG4gIGNvbnN0IHVzZUxlbW1hID1cbiAgICAgIChtb3JwaGVtZS5pbmZsZWN0aW9uICYmIG1vcnBoZW1lLmluZmxlY3Rpb25bMF0pIHx8IChoYXNLYW5qaShtb3JwaGVtZS5sZW1tYSkgJiYgIWhhc0thbmppKG1vcnBoZW1lLmxpdGVyYWwpKTtcbiAgY29uc3QgcHJvbXB0ID0gdXNlTGVtbWEgPyBtb3JwaGVtZS5sZW1tYSA6IG1vcnBoZW1lLmxpdGVyYWw7XG4gIGNvbnN0IHJlc3BvbnNlID0ga2F0YTJoaXJhKHVzZUxlbW1hID8gbW9ycGhlbWUubGVtbWFSZWFkaW5nIDogbW9ycGhlbWUucHJvbnVuY2lhdGlvbik7XG4gIHtcbiAgICBjb25zdCBsZW1tYUFueXdheSA9IGthdGEyaGlyYShtb3JwaGVtZS5sZW1tYVJlYWRpbmcpO1xuICAgIGlmICghdXNlTGVtbWEgJiYgcmVzcG9uc2UuaW5jbHVkZXMoQ0hPVU9OUFUpICYmXG4gICAgICAgIChmaW5kQWx0ZXJuYXRpdmVDaG91b25wdShyZXNwb25zZSkuZmluZChzID0+IHMgPT09IGxlbW1hQW55d2F5KSB8fFxuICAgICAgICAgcHJvbnVuY2lhdGlvblJlYWRpbmdFcXVhbENob3VvbnB1KG1vcnBoZW1lKSkpIHtcbiAgICAgIHJldHVybiB7cHJvbXB0LCByZXNwb25zZToga2F0YTJoaXJhKG1vcnBoZW1lLmxlbW1hUmVhZGluZyl9O1xuICAgIH1cbiAgfVxuICByZXR1cm4ge3Byb21wdCwgcmVzcG9uc2V9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB2b2NhYlRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgcmV0dXJuIFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge3Byb21wdDogbGVtbWEsIHJlc3BvbnNlOiBsZW1tYVJlYWRpbmd9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG0pO1xuICAgIGlmIChoYXNLYW5qaShsZW1tYSkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHsgcmV0dXJuIGxlbW1hSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGVtbWEpID8ge3J1Ynk6IGxlbW1hLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGVtbWFdO1xuICB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlZFRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdLCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPik6IFByb21pc2U8RnVyaWdhbmFbXVtdPiB7XG4gIGNvbnN0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBhd2FpdCBQcm9taXNlLmFsbChtb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgIGNvbnN0IHtsZW1tYSwgbGVtbWFSZWFkaW5nLCBsaXRlcmFsLCBwcm9udW5jaWF0aW9ufSA9IG07XG4gICAgaWYgKGhhc0thbmppKGxpdGVyYWwpKSB7XG4gICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChsaXRlcmFsKTtcbiAgICAgIGlmIChoaXQpIHsgcmV0dXJuIGZsYXR0ZW4oaGl0LmZ1cmlnYW5hKSB8fCBbXTsgfVxuXG4gICAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICBjb25zdCBsaXRlcmFsSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsaXRlcmFsLCAncmVhZGluZycsIHByb251bmNpYXRpb24pO1xuICAgICAgaWYgKGxpdGVyYWxIaXQpIHsgcmV0dXJuIGxpdGVyYWxIaXQuZnVyaWdhbmE7IH1cbiAgICAgIGNvbnN0IHByb251bmNpYXRpb25IaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIHByb251bmNpYXRpb24sICd0ZXh0JywgbGl0ZXJhbCk7XG4gICAgICBpZiAocHJvbnVuY2lhdGlvbkhpdCkgeyByZXR1cm4gcHJvbnVuY2lhdGlvbkhpdC5mdXJpZ2FuYTsgfVxuXG4gICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYURpY3Q6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3QgZiBvZiBsZW1tYUhpdC5mdXJpZ2FuYSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBmdXJpZ2FuYURpY3Quc2V0KGYucnVieSwgZi5ydCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgICBsZXQga2FuamkgPSBjaGFycy5maWx0ZXIoaGFzS2FuamkpO1xuICAgICAgICBjb25zdCBhbm5vdGF0ZWRDaGFyczogRnVyaWdhbmFbXSA9IGNoYXJzLnNsaWNlKCk7XG5cbiAgICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICAgIHdoaWxlIChrYW5qaS5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBoaXQgPSB0cml1KGthbmppKS5maW5kKGtzID0+IGZ1cmlnYW5hRGljdC5oYXMoa3Muam9pbignJykpKTtcbiAgICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgICBjb25zdCBoaXRzdHIgPSBoaXQuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBsaXRlcmFsLmluZGV4T2YoaGl0c3RyKTtcbiAgICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaWR4ICsgMTsgaSA8IGlkeCArIGhpdHN0ci5sZW5ndGg7IGkrKykgeyBhbm5vdGF0ZWRDaGFyc1tpXSA9ICcnOyB9XG4gICAgICAgICAgICBrYW5qaSA9IGthbmppLnNsaWNlKGhpdHN0ci5sZW5ndGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhbm5vdGF0ZWRDaGFycztcbiAgICAgIH1cbiAgICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAgIC8vIGlmIChsZW1tYVJlYWRpbmdIaXQpIHsgcmV0dXJuIGxlbW1hUmVhZGluZ0hpdC5mdXJpZ2FuYTsgfVxuICAgIH1cbiAgICByZXR1cm4gW2hhc0thbmppKGxpdGVyYWwpID8ge3J1Ynk6IGxpdGVyYWwsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsaXRlcmFsXTtcbiAgfSkpO1xuXG4gIHJldHVybiBmdXJpZ2FuYTtcbn1cblxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IENIT1VPTlBVX1BSRUZJWF9NQVAgPSBjcmVhdGVDaG91b25wdVByZWZpeE1hcCgpO1xuY29uc3QgQ0hPVU9OUFUgPSAn44O8JzsgLy8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ2glQzUlOERvbnB1XG5mdW5jdGlvbiBjcmVhdGVDaG91b25wdVByZWZpeE1hcCgpIHtcbiAgY29uc3QgcHJlZml4ZXMgPSAn44GC44GE44GG44GE44GGJztcbiAgY29uc3QgbWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICBg44GB44GC44GL44GM44GV44GW44Gf44Gg44Gq44Gv44Gw44Gx44G+44KD44KE44KJ44KO44KPXG7jgYPjgYTjgY3jgY7jgZfjgZjjgaHjgaLjgavjgbLjgbPjgbTjgb/jgopcbuOBheOBhuOBj+OBkOOBmeOBmuOBo+OBpOOBpeOBrOOBteOBtuOBt+OCgOOCheOChuOCi+OClFxu44GH44GI44GR44GS44Gb44Gc44Gm44Gn44Gt44G444G544G644KB44KMXG7jgYnjgYrjgZPjgZTjgZ3jgZ7jgajjganjga7jgbvjgbzjgb3jgoLjgofjgojjgo3jgpJgLnNwbGl0KCdcXG4nKVxuICAgICAgLmZvckVhY2goKGxpbmUsIGkpID0+IGxpbmUuc3BsaXQoJycpLmZvckVhY2gocyA9PiBtYXAuc2V0KHMsIHMgKyBwcmVmaXhlc1tpXSkpKTtcbiAgcmV0dXJuIG1hcDtcbn1cblxuZnVuY3Rpb24gZmluZEFsdGVybmF0aXZlQ2hvdW9ucHUoaGlyYWdhbmE6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgaGl0cyA9IFtoaXJhZ2FuYV07XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgaGlyYWdhbmEubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaGlyYWdhbmFbaV0gPT09IENIT1VPTlBVKSB7XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IENIT1VPTlBVX1BSRUZJWF9NQVAuZ2V0KGhpcmFnYW5hW2kgLSAxXSk7XG4gICAgICBpZiAocmVwbGFjZW1lbnQpIHtcbiAgICAgICAgY29uc3QgcHJlZml4ID0gaGlyYWdhbmEuc2xpY2UoMCwgaSAtIDEpO1xuICAgICAgICBjb25zdCBwb3N0Zml4ID0gaGlyYWdhbmEuc2xpY2UoaSArIDEpO1xuICAgICAgICBoaXRzLnB1c2gocHJlZml4ICsgcmVwbGFjZW1lbnQgKyBwb3N0Zml4KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGhpdHM7XG59XG5mdW5jdGlvbiBzZWFyY2gobWFwOiBNYXA8c3RyaW5nLCBFbnRyeVtdPiwgZmlyc3Q6IHN0cmluZywgc3ViOiAncmVhZGluZyd8J3RleHQnLCBzZWNvbmQ6IHN0cmluZyk6IEVudHJ5fHVuZGVmaW5lZCB7XG4gIGNvbnN0IGhpdCA9IG1hcC5nZXQoZmlyc3QpO1xuICBpZiAoaGl0KSB7XG4gICAgaWYgKGhpdC5sZW5ndGggPT09IDEpIHsgcmV0dXJuIGhpdFswXTsgfVxuICAgIGNvbnN0IHBvc3NpYmxlU2Vjb25kcyA9IGZpbmRBbHRlcm5hdGl2ZUNob3VvbnB1KGthdGEyaGlyYShzZWNvbmQpKTtcbiAgICBjb25zdCBzdWJoaXQgPSBoaXQuZmluZChlID0+IHtcbiAgICAgIGNvbnN0IGRpY3QgPSBrYXRhMmhpcmEoZVtzdWJdKTtcbiAgICAgIHJldHVybiBwb3NzaWJsZVNlY29uZHMuc29tZShzZWNvbmQgPT4gc2Vjb25kID09PSBkaWN0KTtcbiAgICB9KTtcbiAgICBpZiAoc3ViaGl0KSB7IHJldHVybiBzdWJoaXQ7IH1cbiAgICBjb25zb2xlLmVycm9yKGBmb3VuZCBoaXQgZm9yICR7Zmlyc3R9IGJ1dCBub3QgJHtzZWNvbmR9YCwge2hpdCwgcG9zc2libGVTZWNvbmRzfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbmVlZGxlIGlzIGZvdW5kIGluIGhheXN0YWNrIG9ubHkgb25jZVxuICogQHBhcmFtIGhheXN0YWNrIGJpZyBzdHJpbmdcbiAqIEBwYXJhbSBuZWVkbGUgbGl0dGxlIHN0cmluZ1xuICovXG5mdW5jdGlvbiBhcHBlYXJzRXhhY3RseU9uY2UoaGF5c3RhY2s6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgbGV0IGhpdDogbnVtYmVyO1xuICByZXR1cm4gKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlKSkgPj0gMCAmJiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGhpdCArIDEpKSA8IDA7XG59XG4vKipcbiAqIEdpdmVuIHRocmVlIGNvbnNlY3V0aWVzIHN1YnN0cmluZ3MgKHRoZSBhcmd1bWVudHMpLCByZXR1cm4gZWl0aGVyXG4gKiAtIGAke2xlZnQyfVske2Nsb3plfV0ke3JpZ2h0Mn1gIHdoZXJlIGBsZWZ0MmAgYW5kIGByaWdodDJgIGFyZSBhcyBzaG9ydCBhcyBwb3NzaWJsZSAoYW5kIG9mIGVxdWFsIGxlbmd0aCwgaWZcbiAqICAgIHBvc3NpYmxlKSBzbyB0aGUgdGhpcyByZXR1cm4gc3RyaW5nIChtaW51cyB0aGUgYnJhY2tldHMpIGlzIHVuaXF1ZSBpbiB0aGUgZnVsbCBzdHJpbmcsIG9yXG4gKiAtIGAke2Nsb3plfWAgaWYgYGxlZnQyID09PSByaWdodDIgPT09ICcnYCAoaS5lLiwgdGhlIGFib3ZlIGJ1dCB3aXRob3V0IHRoZSBicmFja2V0cykuXG4gKiBAcGFyYW0gbGVmdCBsZWZ0IHN0cmluZywgcG9zc2libHkgZW1wdHlcbiAqIEBwYXJhbSBjbG96ZSBtaWRkbGUgc3RyaW5nXG4gKiBAcGFyYW0gcmlnaHQgcmlnaHQgc3RyaW5nLCBwb3NzaWJsZSBlbXB0eVxuICogQHRocm93cyBpbiB0aGUgdW5saWtlbHkgZXZlbnQgdGhhdCBzdWNoIGEgcmV0dXJuIHN0cmluZyBjYW5ub3QgYmUgYnVpbGQgKEkgY2Fubm90IHRoaW5rIG9mIGFuIGV4YW1wbGUgdGhvdWdoKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdDogc3RyaW5nLCBjbG96ZTogc3RyaW5nLCByaWdodDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VudGVuY2UgPSBsZWZ0ICsgY2xvemUgKyByaWdodDtcbiAgbGV0IGxlZnRDb250ZXh0ID0gJyc7XG4gIGxldCByaWdodENvbnRleHQgPSAnJztcbiAgbGV0IGNvbnRleHRMZW5ndGggPSAwO1xuICB3aGlsZSAoIWFwcGVhcnNFeGFjdGx5T25jZShzZW50ZW5jZSwgbGVmdENvbnRleHQgKyBjbG96ZSArIHJpZ2h0Q29udGV4dCkpIHtcbiAgICBjb250ZXh0TGVuZ3RoKys7XG4gICAgaWYgKGNvbnRleHRMZW5ndGggPj0gbGVmdC5sZW5ndGggJiYgY29udGV4dExlbmd0aCA+PSByaWdodC5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmFuIG91dCBvZiBjb250ZXh0IHRvIGJ1aWxkIHVuaXF1ZSBjbG96ZScpO1xuICAgIH1cbiAgICBsZWZ0Q29udGV4dCA9IGxlZnQuc2xpY2UoLWNvbnRleHRMZW5ndGgpO1xuICAgIHJpZ2h0Q29udGV4dCA9IHJpZ2h0LnNsaWNlKDAsIGNvbnRleHRMZW5ndGgpO1xuICB9XG4gIGlmIChsZWZ0Q29udGV4dCA9PT0gJycgJiYgcmlnaHRDb250ZXh0ID09PSAnJykgeyByZXR1cm4gY2xvemU7IH1cbiAgcmV0dXJuIGAke2xlZnRDb250ZXh0fVske2Nsb3plfV0ke3JpZ2h0Q29udGV4dH1gO1xufVxuXG5mdW5jdGlvbiBpZGVudGlmeUZpbGxJbkJsYW5rcyhidW5zZXRzdXM6IE1vcnBoZW1lW11bXSkge1xuICAvLyBGaW5kIGNsb3plczogcGFydGljbGVzIGFuZCBjb25qdWdhdGVkIHZlcmIvYWRqZWN0aXZlIHBocmFzZXNcbiAgbGV0IGxpdGVyYWxDbG96ZXM6IE1hcDxzdHJpbmcsIE1vcnBoZW1lW10+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IFtiaWR4LCBidW5zZXRzdV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1cykpIHtcbiAgICBsZXQgZmlyc3QgPSBidW5zZXRzdVswXTtcbiAgICBpZiAoIWZpcnN0KSB7IGNvbnRpbnVlOyB9XG4gICAgY29uc3QgcG9zMCA9IGZpcnN0LnBhcnRPZlNwZWVjaFswXTtcbiAgICBsZXQgc2VhcmNoRm9yUGFydGljbGVzID0gdHJ1ZTtcbiAgICBpZiAoYnVuc2V0c3VzLmxlbmd0aCA+IDEgJiYgYnVuc2V0c3UubGVuZ3RoID4gMSAmJlxuICAgICAgICAocG9zMC5zdGFydHNXaXRoKCd2ZXJiJykgfHwgcG9zMC5lbmRzV2l0aCgnX3ZlcmInKSB8fCBwb3MwLnN0YXJ0c1dpdGgoJ2FkamVjdCcpKSkge1xuICAgICAgbGV0IGlnbm9yZVJpZ2h0ID0gZmlsdGVyUmlnaHQoYnVuc2V0c3UsIG0gPT4gIWdvb2RNb3JwaGVtZVByZWRpY2F0ZShtKSk7XG4gICAgICBsZXQgZ29vZEJ1bnNldHN1ID0gaWdub3JlUmlnaHQubGVuZ3RoID09PSAwID8gYnVuc2V0c3UgOiBidW5zZXRzdS5zbGljZSgwLCAtaWdub3JlUmlnaHQubGVuZ3RoKTtcbiAgICAgIGlmIChnb29kQnVuc2V0c3UubGVuZ3RoID4gMSkge1xuICAgICAgICBzZWFyY2hGb3JQYXJ0aWNsZXMgPSBmYWxzZTtcbiAgICAgICAgbGV0IGNsb3plID0gYnVuc2V0c3VUb1N0cmluZyhnb29kQnVuc2V0c3UpO1xuICAgICAgICBsZXQgbGVmdCA9IGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxldCByaWdodCA9IGJ1bnNldHN1VG9TdHJpbmcoaWdub3JlUmlnaHQpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBjbG96ZSwgcmlnaHQpLCBnb29kQnVuc2V0c3UpO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBvbmx5IGFkZCBwYXJ0aWNsZXMgaWYgdGhleSdyZSBOT1QgaW5zaWRlIGNvbmp1Z2F0ZWQgcGhyYXNlc1xuICAgIGNvbnN0IHBhcnRpY2xlUHJlZGljYXRlID0gKHA6IE1vcnBoZW1lKSA9PiBwLnBhcnRPZlNwZWVjaFswXS5zdGFydHNXaXRoKCdwYXJ0aWNsZScpICYmIHAucGFydE9mU3BlZWNoLmxlbmd0aCA+IDEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXAucGFydE9mU3BlZWNoWzFdLnN0YXJ0c1dpdGgoJ3BocmFzZV9maW5hbCcpO1xuICAgIGlmIChzZWFyY2hGb3JQYXJ0aWNsZXMpIHtcbiAgICAgIGZvciAobGV0IFtwaWR4LCBwYXJ0aWNsZV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1KSkge1xuICAgICAgICBpZiAocGFydGljbGVQcmVkaWNhdGUocGFydGljbGUpKSB7XG4gICAgICAgICAgbGV0IGxlZnQgPVxuICAgICAgICAgICAgICBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpICsgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZSgwLCBwaWR4KSk7XG4gICAgICAgICAgbGV0IHJpZ2h0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZShwaWR4ICsgMSkpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIHBhcnRpY2xlLmxpdGVyYWwsIHJpZ2h0KSwgW3BhcnRpY2xlXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgbGV0IGV4aXN0aW5nQ2xvemVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW10pO1xuICBsZXQgYnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgW2Nsb3plLCBidW5zZXRzdV0gb2YgbGl0ZXJhbENsb3plcykge1xuICAgIGlmICghZXhpc3RpbmdDbG96ZXMuaGFzKGNsb3plKSkge1xuICAgICAgbGV0IGFjY2VwdGFibGUgPSBbY2xvemVdO1xuICAgICAgaWYgKGhhc0thbmppKGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3UpKSkge1xuICAgICAgICBhY2NlcHRhYmxlLnB1c2goa2F0YTJoaXJhKGJ1bnNldHN1Lm1hcChtID0+IG0ucHJvbnVuY2lhdGlvbikuam9pbignJykpKVxuICAgICAgfVxuICAgICAgYnVsbGV0cy5wdXNoKCctIEBmaWxsICcgKyBhY2NlcHRhYmxlLmpvaW4oJyBAICcpICtcbiAgICAgICAgICAgICAgICAgICBgICAgIEBwb3MgJHtidW5zZXRzdS5tYXAobSA9PiBtLnBhcnRPZlNwZWVjaC5qb2luKCctJykpLmpvaW4oJy8nKX1gKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ1bGxldHM7XG59XG5cbmNvbnN0IFVTQUdFID0gYFVTQUdFIDE6XG4kIG5vZGUgW3RoaXMtc2NyaXB0LmpzXSBbbWFya2Rvd24ubWRdXG5cblVTQUdFIDI6XG4kIGNhdCBbbWFya2Rvd24ubWRdIHwgbm9kZSBbdGhpcy1zY3JpcHQuanNdXG5cbkJvdGggd2lsbCBwcmludCBhIHBhcnNlZCB2ZXJzaW9uIG9mIHRoZSBpbnB1dC5gO1xuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IHJlYWRGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2ZzJykucmVhZEZpbGUpO1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgY29uc3QgdGV4dCA9IHByb2Nlc3MuYXJndlsyXSA/IGF3YWl0IHJlYWRGaWxlKHByb2Nlc3MuYXJndlsyXSwgJ3V0ZjgnKSA6ICgoYXdhaXQgZ2V0U3RkaW4oKSkgfHwgVVNBR0UpO1xuICAgIC8vIFNwbGl0IE1hcmtkb3duIGF0IGhlYWRlciAoYCMgYmxhYmxhYClcbiAgICBsZXQgYmxvY2tzID0gc3BsaXRBdEhlYWRlcnModGV4dCk7XG4gICAgLy8gUGFyc2UgaGVhZGVyc1xuICAgIGxldCBjb250ZW50ID0gYXdhaXQgcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzKTtcbiAgICAvLyBQcmludCByZXN1bHRcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb250ZW50Lm1hcCh2ID0+IHYuam9pbignXFxuJykpLmpvaW4oJ1xcbicpKTtcbiAgfSkoKTtcbn0iXX0=