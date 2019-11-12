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
    return curtiz_utils_1.hasKanji(m.literal) ? kana_1.kata2hira(m.literal === m.lemma ? m.lemmaReading : m.pronunciation) : m.literal;
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
function morphemeToPromptResponse(morpheme) {
    // use lemma only when inflected, or when literal lacks kanji but lemma has them
    const useLemma = (morpheme.inflection && morpheme.inflection[0]) || (curtiz_utils_1.hasKanji(morpheme.lemma) && !curtiz_utils_1.hasKanji(morpheme.literal));
    const prompt = useLemma ? morpheme.lemma : morpheme.literal;
    const response = kana_1.kata2hira(useLemma ? morpheme.lemmaReading : morpheme.pronunciation);
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
function search(map, first, sub, second) {
    const hit = map.get(first);
    if (hit) {
        if (hit.length === 1) {
            return hit[0];
        }
        const subhit = hit.find(e => kana_1.kata2hira(e[sub]) === kana_1.kata2hira(second));
        if (subhit) {
            return subhit;
        }
        console.error(`found hit for ${first} but not ${second}`, { hit });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBZ0c7QUFFaEcsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQXNCLEtBQUssQ0FBQyxRQUFnQjs7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxzQkFLQztBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQs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LE9BQU8sQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN0QyxDQUFDOztZQUNDLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLFFBQVEsRUFBRSxDQUFDLElBQUksS0FBSyxDQUFDLENBQUM7WUFDdkcsd0NBQXdDO1lBQ3hDLElBQUksTUFBTSxHQUFHLGNBQWMsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsQyxnQkFBZ0I7WUFDaEIsSUFBSSxPQUFPLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNqRCxlQUFlO1lBQ2YsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsRSxDQUFDO0tBQUEsQ0FBQyxFQUFFLENBQUM7Q0FDTiIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCB7YWRkSmRlcHB9IGZyb20gJy4vamRlcHAnO1xuaW1wb3J0IHtrYXRhMmhpcmF9IGZyb20gJy4va2FuYSc7XG5pbXBvcnQge2dvb2RNb3JwaGVtZVByZWRpY2F0ZSwgaW52b2tlTWVjYWIsIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMsIE1vcnBoZW1lLCBwYXJzZU1lY2FifSBmcm9tICcuL21lY2FiVW5pZGljJztcbmltcG9ydCB7ZW51bWVyYXRlLCBmaWx0ZXJSaWdodCwgZmxhdHRlbiwgaGFzS2FuamksIHBhcnRpdGlvbkJ5LCB0YWtlV2hpbGV9IGZyb20gJ2N1cnRpei11dGlscyc7XG5pbXBvcnQge0VudHJ5LCBmdXJpZ2FuYVRvU3RyaW5nLCBGdXJpZ2FuYSwgc2V0dXAsIHN0cmluZ1RvRnVyaWdhbmF9IGZyb20gJ2ptZGljdC1mdXJpZ2FuYS1ub2RlJztcblxuY29uc3QgSm1kaWN0RnVyaWdhbmEgPSBzZXR1cCgpO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2Uoc2VudGVuY2U6IHN0cmluZyk6IFByb21pc2U8e21vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107fT4ge1xuICBsZXQgcmF3TWVjYWIgPSBhd2FpdCBpbnZva2VNZWNhYihzZW50ZW5jZSk7XG4gIGxldCBtb3JwaGVtZXMgPSBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzKHBhcnNlTWVjYWIoc2VudGVuY2UsIHJhd01lY2FiKVswXS5maWx0ZXIobyA9PiAhIW8pKTtcbiAgbGV0IGJ1bnNldHN1cyA9IGF3YWl0IGFkZEpkZXBwKHJhd01lY2FiLCBtb3JwaGVtZXMpO1xuICByZXR1cm4ge21vcnBoZW1lcywgYnVuc2V0c3VzfTtcbn1cblxuY29uc3QgYnVuc2V0c3VUb1N0cmluZyA9IChtb3JwaGVtZXM6IE1vcnBoZW1lW10pID0+IG1vcnBoZW1lcy5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuXG5leHBvcnQgZnVuY3Rpb24gc3BsaXRBdEhlYWRlcnModGV4dDogc3RyaW5nKTogc3RyaW5nW11bXSB7XG4gIGNvbnN0IGhlYWRlclJlID0gL14jK1xccysuKyQvO1xuICByZXR1cm4gcGFydGl0aW9uQnkodGV4dC5zcGxpdCgnXFxuJyksIHMgPT4gaGVhZGVyUmUudGVzdChzKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3M6IHN0cmluZ1tdW10sIGNvbmN1cnJlbnRMaW1pdDogbnVtYmVyID0gMSkge1xuICBsZXQgcmV0OiBzdHJpbmdbXVtdID0gW107XG4gIGxldCBwcm9taXNlczogUHJvbWlzZTxzdHJpbmdbXT5bXSA9IFtdO1xuICBjb25zdCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPiA9IG5ldyBNYXAoW10pO1xuICBmb3IgKGxldCBvIG9mIGJsb2Nrcykge1xuICAgIGlmIChwcm9taXNlcy5sZW5ndGggPj0gY29uY3VycmVudExpbWl0KSB7XG4gICAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgICAgIHByb21pc2VzID0gW107XG4gICAgfVxuICAgIHByb21pc2VzLnB1c2gocGFyc2VIZWFkZXJCbG9jayhvLCBzZWVuKSk7XG4gIH1cbiAgaWYgKHByb21pc2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gIH1cbiAgcmV0dXJuIHJldDtcbn1cblxuY29uc3QgUExFQVNFX1BBUlNFX0JMT0NLID0gJy0gQHBsZWFzZVBhcnNlJztcbmNvbnN0IEZVUklHQU5BX0JMT0NLID0gJy0gQGZ1cmlnYW5hJztcblxuY29uc3QgZmxhc2hhYmxlTW9ycGhlbWUgPSAobTogTW9ycGhlbWUpID0+IHtcbiAgY29uc3QgcG9zID0gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpO1xuICBpZiAoaGFzS2FuamkobS5saXRlcmFsKSAmJiAhcG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAocG9zLnN0YXJ0c1dpdGgoJ3ZlcmItJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ25vdW4nKSB8fCBwb3Muc3RhcnRzV2l0aCgncHJvbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdhZGplY3RpdicpIHx8XG4gICAgICBwb3Muc3RhcnRzV2l0aCgnYWR2ZXJiJykpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuZnVuY3Rpb24gbW9ycGhlbWVUb1JlYWRpbmcobTogTW9ycGhlbWUpIHtcbiAgcmV0dXJuIGhhc0thbmppKG0ubGl0ZXJhbCkgPyBrYXRhMmhpcmEobS5saXRlcmFsID09PSBtLmxlbW1hID8gbS5sZW1tYVJlYWRpbmcgOiBtLnByb251bmNpYXRpb24pIDogbS5saXRlcmFsO1xufVxudHlwZSBQYXJzZWQgPSB7XG4gIG1vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107XG59O1xudHlwZSBTZWVuID0ge1xuICBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdOyByZWFkaW5nOiBzdHJpbmc7XG59O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlSGVhZGVyQmxvY2soYmxvY2s6IHN0cmluZ1tdLCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPiA9IG5ldyBNYXAoW10pKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBjb25zdCBhdEhlYWRlclJlID0gL14jK1xccytAXFxzKy87XG4gIGNvbnN0IG1hdGNoID0gYmxvY2tbMF0ubWF0Y2goYXRIZWFkZXJSZSk7XG4gIGlmIChtYXRjaCkge1xuICAgIGNvbnN0IGxpbmUgPSBibG9ja1swXS5zbGljZShtYXRjaFswXS5sZW5ndGgpOyAvLyBtaW51cyB0aGUgZmlyc3QgQFxuXG4gICAgbGV0IFtwcm9tcHQsIC4uLnJlc3BvbnNlc10gPSBsaW5lLnNwbGl0KCdAJykubWFwKHMgPT4gcy50cmltKCkpO1xuICAgIGNvbnN0IHByZWZpeDogc3RyaW5nW10gPSBbXTtcbiAgICAvLyBwcm9jZXNzIGxpbmUgYW5kIGJsb2NrLlxuICAgIGNvbnN0IG5lZWRzUmVzcG9uc2UgPSByZXNwb25zZXMubGVuZ3RoID09PSAxICYmIHJlc3BvbnNlc1swXS5sZW5ndGggPT0gMDtcbiAgICBjb25zdCBoYXNQbGVhc2VQYXJzZSA9XG4gICAgICAgIHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgIGNvbnN0IGhhc0Z1cmlnYW5hID0gdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICBpZiAobmVlZHNSZXNwb25zZSB8fCBoYXNQbGVhc2VQYXJzZSB8fCAhaGFzRnVyaWdhbmEpIHtcbiAgICAgIGNvbnN0IHBhcnNlZDogUGFyc2VkID0gYXdhaXQgcGFyc2UocHJvbXB0KTtcbiAgICAgIGlmIChuZWVkc1Jlc3BvbnNlKSB7XG4gICAgICAgIHJlc3BvbnNlcyA9IFtrYXRhMmhpcmEoZmxhdHRlbihwYXJzZWQuYnVuc2V0c3VzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKG0gPT4gbS5wYXJ0T2ZTcGVlY2hbMF0gIT09ICdzdXBwbGVtZW50YXJ5X3N5bWJvbCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAobSA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgaGl0ID0gc2Vlbi5nZXQobS5saXRlcmFsKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaGl0ID8gaGl0LnJlYWRpbmcgOiBtb3JwaGVtZVRvUmVhZGluZyhtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmpvaW4oJycpKV07XG4gICAgICAgIGJsb2NrWzBdID0gYmxvY2tbMF0gKyAoYmxvY2tbMF0uZW5kc1dpdGgoJyAnKSA/ICcnIDogJyAnKSArIHJlc3BvbnNlc1swXTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNQbGVhc2VQYXJzZSkge1xuICAgICAgICAvLyBhZGQgQCB2b2NhYnVsYXJ5IGxpbmVzOlxuICAgICAgICBsZXQgZmxhc2hCdWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBbbWlkeCwgbW9ycGhlbWVdIG9mIGVudW1lcmF0ZShwYXJzZWQubW9ycGhlbWVzKSkge1xuICAgICAgICAgIGlmIChwYXJzZWQubW9ycGhlbWVzLmxlbmd0aCA9PT0gMSkgeyBicmVhazsgfVxuICAgICAgICAgIGlmIChmbGFzaGFibGVNb3JwaGVtZShtb3JwaGVtZSkpIHtcbiAgICAgICAgICAgIGxldCB7cHJvbXB0OiBtcHJvbXB0LCByZXNwb25zZTogbXJlc3BvbnNlfSA9IG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtb3JwaGVtZSk7XG5cbiAgICAgICAgICAgIGxldCBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdID0gW107XG4gICAgICAgICAgICBpZiAoaGFzS2FuamkobXByb21wdCkpIHsgZnVyaWdhbmEgPSBhd2FpdCB2b2NhYlRvRnVyaWdhbmEoW21vcnBoZW1lXSk7IH1cblxuICAgICAgICAgICAgY29uc3QgaGl0ID0gc2Vlbi5nZXQobXByb21wdCk7XG4gICAgICAgICAgICBpZiAoIWhpdCkge1xuICAgICAgICAgICAgICBwcmVmaXgucHVzaChtYXRjaFswXSArIGAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9YCk7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKEZVUklHQU5BX0JMT0NLICsgJyAnICsgZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpKTtcbiAgICAgICAgICAgICAgc2Vlbi5zZXQobXByb21wdCwge2Z1cmlnYW5hLCByZWFkaW5nOiBtcmVzcG9uc2V9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG1yZXNwb25zZSA9IGhpdC5yZWFkaW5nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZSgwLCBtaWR4KS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgcmlnaHQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKG1pZHggKyAxKS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgbGV0IGNsb3plID0gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIG1vcnBoZW1lLmxpdGVyYWwsIHJpZ2h0KTtcbiAgICAgICAgICAgIGxldCBmaW5hbCA9ICcnO1xuICAgICAgICAgICAgaWYgKG1wcm9tcHQgPT09IG1vcnBoZW1lLmxpdGVyYWwgJiYgYXBwZWFyc0V4YWN0bHlPbmNlKHByb21wdCwgbW9ycGhlbWUubGl0ZXJhbCkpIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gQG9taXQgJHtjbG96ZX1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmbGFzaEJ1bGxldHMucHVzaChmaW5hbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5mbGFzaEJ1bGxldHMpO1xuXG4gICAgICAgIC8vIGFkZCBAZmlsbCBsaW5lc1xuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uaWRlbnRpZnlGaWxsSW5CbGFua3MocGFyc2VkLmJ1bnNldHN1cykpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBAcGxlYXNlUGFyc2VcbiAgICAgICAgYmxvY2sgPSBibG9jay5maWx0ZXIocyA9PiAhcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgICAgfVxuICAgICAgaWYgKCFoYXNGdXJpZ2FuYSkge1xuICAgICAgICBpZiAoaGFzS2FuamkocHJvbXB0KSkge1xuICAgICAgICAgIC8vIGFkZCBmdXJpZ2FuYSBsaW5lXG4gICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCBwYXJzZWRUb0Z1cmlnYW5hKHBhcnNlZC5tb3JwaGVtZXMsIHNlZW4pO1xuICAgICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCBgJHtGVVJJR0FOQV9CTE9DS30gJHtmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJyl9YCk7XG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmEsIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbW3Jlc3BvbnNlc1swXV1dLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmFCdWxsZXRzID0gYmxvY2suZmlsdGVyKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgICAgIGlmIChmdXJpZ2FuYUJ1bGxldHMubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBzdHJpbmdUb0Z1cmlnYW5hKGZ1cmlnYW5hQnVsbGV0c1swXS5zbGljZShGVVJJR0FOQV9CTE9DSy5sZW5ndGgpKVxuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbZnVyaWdhbmFdLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGSVhNRSBEUlkgc2FtZSBhcyBhYm92ZVxuICAgICAgY29uc3QgZnVyaWdhbmFCdWxsZXQgPSBibG9jay5maW5kKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgICBpZiAoZnVyaWdhbmFCdWxsZXQpIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBzdHJpbmdUb0Z1cmlnYW5hKGZ1cmlnYW5hQnVsbGV0LnNsaWNlKEZVUklHQU5BX0JMT0NLLmxlbmd0aCkpXG4gICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbZnVyaWdhbmFdLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgIH1cbiAgICB9XG4gICAgYmxvY2sgPSBwcmVmaXguY29uY2F0KGJsb2NrKTtcbiAgfVxuICByZXR1cm4gYmxvY2s7XG59XG5cbmZ1bmN0aW9uIG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtb3JwaGVtZTogTW9ycGhlbWUpIHtcbiAgLy8gdXNlIGxlbW1hIG9ubHkgd2hlbiBpbmZsZWN0ZWQsIG9yIHdoZW4gbGl0ZXJhbCBsYWNrcyBrYW5qaSBidXQgbGVtbWEgaGFzIHRoZW1cbiAgY29uc3QgdXNlTGVtbWEgPVxuICAgICAgKG1vcnBoZW1lLmluZmxlY3Rpb24gJiYgbW9ycGhlbWUuaW5mbGVjdGlvblswXSkgfHwgKGhhc0thbmppKG1vcnBoZW1lLmxlbW1hKSAmJiAhaGFzS2FuamkobW9ycGhlbWUubGl0ZXJhbCkpO1xuICBjb25zdCBwcm9tcHQgPSB1c2VMZW1tYSA/IG1vcnBoZW1lLmxlbW1hIDogbW9ycGhlbWUubGl0ZXJhbDtcbiAgY29uc3QgcmVzcG9uc2UgPSBrYXRhMmhpcmEodXNlTGVtbWEgPyBtb3JwaGVtZS5sZW1tYVJlYWRpbmcgOiBtb3JwaGVtZS5wcm9udW5jaWF0aW9uKTtcbiAgcmV0dXJuIHtwcm9tcHQsIHJlc3BvbnNlfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdm9jYWJUb0Z1cmlnYW5hKG1vcnBoZW1lczogTW9ycGhlbWVbXSk6IFByb21pc2U8RnVyaWdhbmFbXVtdPiB7XG4gIHJldHVybiBQcm9taXNlLmFsbChtb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgIGNvbnN0IHtwcm9tcHQ6IGxlbW1hLCByZXNwb25zZTogbGVtbWFSZWFkaW5nfSA9IG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtKTtcbiAgICBpZiAoaGFzS2FuamkobGVtbWEpKSB7XG4gICAgICBjb25zdCB7dGV4dFRvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsZW1tYSwgJ3JlYWRpbmcnLCBsZW1tYVJlYWRpbmcpO1xuICAgICAgaWYgKGxlbW1hSGl0KSB7IHJldHVybiBsZW1tYUhpdC5mdXJpZ2FuYTsgfVxuICAgIH1cbiAgICByZXR1cm4gW2hhc0thbmppKGxlbW1hKSA/IHtydWJ5OiBsZW1tYSwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxlbW1hXTtcbiAgfSkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwYXJzZWRUb0Z1cmlnYW5hKG1vcnBoZW1lczogTW9ycGhlbWVbXSwgc2VlbjogTWFwPHN0cmluZywgU2Vlbj4pOiBQcm9taXNlPEZ1cmlnYW5hW11bXT4ge1xuICBjb25zdCBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdID0gYXdhaXQgUHJvbWlzZS5hbGwobW9ycGhlbWVzLm1hcChhc3luYyBtID0+IHtcbiAgICBjb25zdCB7bGVtbWEsIGxlbW1hUmVhZGluZywgbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbn0gPSBtO1xuICAgIGlmIChoYXNLYW5qaShsaXRlcmFsKSkge1xuICAgICAgY29uc3QgaGl0ID0gc2Vlbi5nZXQobGl0ZXJhbCk7XG4gICAgICBpZiAoaGl0KSB7IHJldHVybiBmbGF0dGVuKGhpdC5mdXJpZ2FuYSkgfHwgW107IH1cblxuICAgICAgY29uc3Qge3RleHRUb0VudHJ5LCByZWFkaW5nVG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGl0ZXJhbEhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGl0ZXJhbCwgJ3JlYWRpbmcnLCBwcm9udW5jaWF0aW9uKTtcbiAgICAgIGlmIChsaXRlcmFsSGl0KSB7IHJldHVybiBsaXRlcmFsSGl0LmZ1cmlnYW5hOyB9XG4gICAgICBjb25zdCBwcm9udW5jaWF0aW9uSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBwcm9udW5jaWF0aW9uLCAndGV4dCcsIGxpdGVyYWwpO1xuICAgICAgaWYgKHByb251bmNpYXRpb25IaXQpIHsgcmV0dXJuIHByb251bmNpYXRpb25IaXQuZnVyaWdhbmE7IH1cblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmFEaWN0OiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICAgICAgICBmb3IgKGNvbnN0IGYgb2YgbGVtbWFIaXQuZnVyaWdhbmEpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGYgPT09ICdzdHJpbmcnKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgZnVyaWdhbmFEaWN0LnNldChmLnJ1YnksIGYucnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY2hhcnMgPSBsaXRlcmFsLnNwbGl0KCcnKTtcbiAgICAgICAgbGV0IGthbmppID0gY2hhcnMuZmlsdGVyKGhhc0thbmppKTtcbiAgICAgICAgY29uc3QgYW5ub3RhdGVkQ2hhcnM6IEZ1cmlnYW5hW10gPSBjaGFycy5zbGljZSgpO1xuXG4gICAgICAgIC8vIHN0YXJ0IGZyb20gYWxsIGthbmppIGNoYXJhY3RlcnMgaW4gYSBzdHJpbmcsIHNlZSBpZiB0aGF0J3MgaW4gZnVyaWdhbmFEaWN0LCBpZiBub3QsIGNob3AgbGFzdFxuICAgICAgICB3aGlsZSAoa2FuamkubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgaGl0ID0gdHJpdShrYW5qaSkuZmluZChrcyA9PiBmdXJpZ2FuYURpY3QuaGFzKGtzLmpvaW4oJycpKSk7XG4gICAgICAgICAgaWYgKGhpdCkge1xuICAgICAgICAgICAgY29uc3QgaGl0c3RyID0gaGl0LmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gbGl0ZXJhbC5pbmRleE9mKGhpdHN0cik7XG4gICAgICAgICAgICBhbm5vdGF0ZWRDaGFyc1tpZHhdID0ge3J1Ynk6IGhpdHN0ciwgcnQ6IGZ1cmlnYW5hRGljdC5nZXQoaGl0c3RyKSB8fCBoaXRzdHJ9O1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGlkeCArIDE7IGkgPCBpZHggKyBoaXRzdHIubGVuZ3RoOyBpKyspIHsgYW5ub3RhdGVkQ2hhcnNbaV0gPSAnJzsgfVxuICAgICAgICAgICAga2FuamkgPSBrYW5qaS5zbGljZShoaXRzdHIubGVuZ3RoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYW5ub3RhdGVkQ2hhcnM7XG4gICAgICB9XG4gICAgICAvLyBjb25zdCBsZW1tYVJlYWRpbmdIaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIGxlbW1hUmVhZGluZywgJ3RleHQnLCBsZW1tYSk7XG4gICAgICAvLyBpZiAobGVtbWFSZWFkaW5nSGl0KSB7IHJldHVybiBsZW1tYVJlYWRpbmdIaXQuZnVyaWdhbmE7IH1cbiAgICB9XG4gICAgcmV0dXJuIFtoYXNLYW5qaShsaXRlcmFsKSA/IHtydWJ5OiBsaXRlcmFsLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGl0ZXJhbF07XG4gIH0pKTtcblxuICByZXR1cm4gZnVyaWdhbmE7XG59XG5cbmZ1bmN0aW9uIHRyaXU8VD4oYXJyOiBUW10pOiBUW11bXSB7XG4gIGNvbnN0IHJldDogVFtdW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IGFyci5sZW5ndGg7IGkgPiAwOyAtLWkpIHsgcmV0LnB1c2goYXJyLnNsaWNlKDAsIGkpKTsgfVxuICByZXR1cm4gcmV0O1xufVxuXG5mdW5jdGlvbiBzZWFyY2gobWFwOiBNYXA8c3RyaW5nLCBFbnRyeVtdPiwgZmlyc3Q6IHN0cmluZywgc3ViOiAncmVhZGluZyd8J3RleHQnLCBzZWNvbmQ6IHN0cmluZyk6IEVudHJ5fHVuZGVmaW5lZCB7XG4gIGNvbnN0IGhpdCA9IG1hcC5nZXQoZmlyc3QpO1xuICBpZiAoaGl0KSB7XG4gICAgaWYgKGhpdC5sZW5ndGggPT09IDEpIHsgcmV0dXJuIGhpdFswXTsgfVxuICAgIGNvbnN0IHN1YmhpdCA9IGhpdC5maW5kKGUgPT4ga2F0YTJoaXJhKGVbc3ViXSkgPT09IGthdGEyaGlyYShzZWNvbmQpKTtcbiAgICBpZiAoc3ViaGl0KSB7IHJldHVybiBzdWJoaXQ7IH1cbiAgICBjb25zb2xlLmVycm9yKGBmb3VuZCBoaXQgZm9yICR7Zmlyc3R9IGJ1dCBub3QgJHtzZWNvbmR9YCwge2hpdH0pO1xuICB9XG59XG5cbi8qKlxuICogRW5zdXJlIG5lZWRsZSBpcyBmb3VuZCBpbiBoYXlzdGFjayBvbmx5IG9uY2VcbiAqIEBwYXJhbSBoYXlzdGFjayBiaWcgc3RyaW5nXG4gKiBAcGFyYW0gbmVlZGxlIGxpdHRsZSBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gYXBwZWFyc0V4YWN0bHlPbmNlKGhheXN0YWNrOiBzdHJpbmcsIG5lZWRsZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGxldCBoaXQ6IG51bWJlcjtcbiAgcmV0dXJuIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSkpID49IDAgJiYgKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlLCBoaXQgKyAxKSkgPCAwO1xufVxuLyoqXG4gKiBHaXZlbiB0aHJlZSBjb25zZWN1dGllcyBzdWJzdHJpbmdzICh0aGUgYXJndW1lbnRzKSwgcmV0dXJuIGVpdGhlclxuICogLSBgJHtsZWZ0Mn1bJHtjbG96ZX1dJHtyaWdodDJ9YCB3aGVyZSBgbGVmdDJgIGFuZCBgcmlnaHQyYCBhcmUgYXMgc2hvcnQgYXMgcG9zc2libGUgKGFuZCBvZiBlcXVhbCBsZW5ndGgsIGlmXG4gKiAgICBwb3NzaWJsZSkgc28gdGhlIHRoaXMgcmV0dXJuIHN0cmluZyAobWludXMgdGhlIGJyYWNrZXRzKSBpcyB1bmlxdWUgaW4gdGhlIGZ1bGwgc3RyaW5nLCBvclxuICogLSBgJHtjbG96ZX1gIGlmIGBsZWZ0MiA9PT0gcmlnaHQyID09PSAnJ2AgKGkuZS4sIHRoZSBhYm92ZSBidXQgd2l0aG91dCB0aGUgYnJhY2tldHMpLlxuICogQHBhcmFtIGxlZnQgbGVmdCBzdHJpbmcsIHBvc3NpYmx5IGVtcHR5XG4gKiBAcGFyYW0gY2xvemUgbWlkZGxlIHN0cmluZ1xuICogQHBhcmFtIHJpZ2h0IHJpZ2h0IHN0cmluZywgcG9zc2libGUgZW1wdHlcbiAqIEB0aHJvd3MgaW4gdGhlIHVubGlrZWx5IGV2ZW50IHRoYXQgc3VjaCBhIHJldHVybiBzdHJpbmcgY2Fubm90IGJlIGJ1aWxkIChJIGNhbm5vdCB0aGluayBvZiBhbiBleGFtcGxlIHRob3VnaClcbiAqL1xuZnVuY3Rpb24gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQ6IHN0cmluZywgY2xvemU6IHN0cmluZywgcmlnaHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHNlbnRlbmNlID0gbGVmdCArIGNsb3plICsgcmlnaHQ7XG4gIGxldCBsZWZ0Q29udGV4dCA9ICcnO1xuICBsZXQgcmlnaHRDb250ZXh0ID0gJyc7XG4gIGxldCBjb250ZXh0TGVuZ3RoID0gMDtcbiAgd2hpbGUgKCFhcHBlYXJzRXhhY3RseU9uY2Uoc2VudGVuY2UsIGxlZnRDb250ZXh0ICsgY2xvemUgKyByaWdodENvbnRleHQpKSB7XG4gICAgY29udGV4dExlbmd0aCsrO1xuICAgIGlmIChjb250ZXh0TGVuZ3RoID49IGxlZnQubGVuZ3RoICYmIGNvbnRleHRMZW5ndGggPj0gcmlnaHQubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JhbiBvdXQgb2YgY29udGV4dCB0byBidWlsZCB1bmlxdWUgY2xvemUnKTtcbiAgICB9XG4gICAgbGVmdENvbnRleHQgPSBsZWZ0LnNsaWNlKC1jb250ZXh0TGVuZ3RoKTtcbiAgICByaWdodENvbnRleHQgPSByaWdodC5zbGljZSgwLCBjb250ZXh0TGVuZ3RoKTtcbiAgfVxuICBpZiAobGVmdENvbnRleHQgPT09ICcnICYmIHJpZ2h0Q29udGV4dCA9PT0gJycpIHsgcmV0dXJuIGNsb3plOyB9XG4gIHJldHVybiBgJHtsZWZ0Q29udGV4dH1bJHtjbG96ZX1dJHtyaWdodENvbnRleHR9YDtcbn1cblxuZnVuY3Rpb24gaWRlbnRpZnlGaWxsSW5CbGFua3MoYnVuc2V0c3VzOiBNb3JwaGVtZVtdW10pIHtcbiAgLy8gRmluZCBjbG96ZXM6IHBhcnRpY2xlcyBhbmQgY29uanVnYXRlZCB2ZXJiL2FkamVjdGl2ZSBwaHJhc2VzXG4gIGxldCBsaXRlcmFsQ2xvemVzOiBNYXA8c3RyaW5nLCBNb3JwaGVtZVtdPiA9IG5ldyBNYXAoW10pO1xuICBmb3IgKGxldCBbYmlkeCwgYnVuc2V0c3VdIG9mIGVudW1lcmF0ZShidW5zZXRzdXMpKSB7XG4gICAgbGV0IGZpcnN0ID0gYnVuc2V0c3VbMF07XG4gICAgaWYgKCFmaXJzdCkgeyBjb250aW51ZTsgfVxuICAgIGNvbnN0IHBvczAgPSBmaXJzdC5wYXJ0T2ZTcGVlY2hbMF07XG4gICAgbGV0IHNlYXJjaEZvclBhcnRpY2xlcyA9IHRydWU7XG4gICAgaWYgKGJ1bnNldHN1cy5sZW5ndGggPiAxICYmIGJ1bnNldHN1Lmxlbmd0aCA+IDEgJiZcbiAgICAgICAgKHBvczAuc3RhcnRzV2l0aCgndmVyYicpIHx8IHBvczAuZW5kc1dpdGgoJ192ZXJiJykgfHwgcG9zMC5zdGFydHNXaXRoKCdhZGplY3QnKSkpIHtcbiAgICAgIGxldCBpZ25vcmVSaWdodCA9IGZpbHRlclJpZ2h0KGJ1bnNldHN1LCBtID0+ICFnb29kTW9ycGhlbWVQcmVkaWNhdGUobSkpO1xuICAgICAgbGV0IGdvb2RCdW5zZXRzdSA9IGlnbm9yZVJpZ2h0Lmxlbmd0aCA9PT0gMCA/IGJ1bnNldHN1IDogYnVuc2V0c3Uuc2xpY2UoMCwgLWlnbm9yZVJpZ2h0Lmxlbmd0aCk7XG4gICAgICBpZiAoZ29vZEJ1bnNldHN1Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgc2VhcmNoRm9yUGFydGljbGVzID0gZmFsc2U7XG4gICAgICAgIGxldCBjbG96ZSA9IGJ1bnNldHN1VG9TdHJpbmcoZ29vZEJ1bnNldHN1KTtcbiAgICAgICAgbGV0IGxlZnQgPSBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBsZXQgcmlnaHQgPSBidW5zZXRzdVRvU3RyaW5nKGlnbm9yZVJpZ2h0KSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgY2xvemUsIHJpZ2h0KSwgZ29vZEJ1bnNldHN1KTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gb25seSBhZGQgcGFydGljbGVzIGlmIHRoZXkncmUgTk9UIGluc2lkZSBjb25qdWdhdGVkIHBocmFzZXNcbiAgICBjb25zdCBwYXJ0aWNsZVByZWRpY2F0ZSA9IChwOiBNb3JwaGVtZSkgPT4gcC5wYXJ0T2ZTcGVlY2hbMF0uc3RhcnRzV2l0aCgncGFydGljbGUnKSAmJiBwLnBhcnRPZlNwZWVjaC5sZW5ndGggPiAxICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFwLnBhcnRPZlNwZWVjaFsxXS5zdGFydHNXaXRoKCdwaHJhc2VfZmluYWwnKTtcbiAgICBpZiAoc2VhcmNoRm9yUGFydGljbGVzKSB7XG4gICAgICBmb3IgKGxldCBbcGlkeCwgcGFydGljbGVdIG9mIGVudW1lcmF0ZShidW5zZXRzdSkpIHtcbiAgICAgICAgaWYgKHBhcnRpY2xlUHJlZGljYXRlKHBhcnRpY2xlKSkge1xuICAgICAgICAgIGxldCBsZWZ0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKSArIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UoMCwgcGlkeCkpO1xuICAgICAgICAgIGxldCByaWdodCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UocGlkeCArIDEpKSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBwYXJ0aWNsZS5saXRlcmFsLCByaWdodCksIFtwYXJ0aWNsZV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGxldCBleGlzdGluZ0Nsb3plczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KFtdKTtcbiAgbGV0IGJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gIGZvciAobGV0IFtjbG96ZSwgYnVuc2V0c3VdIG9mIGxpdGVyYWxDbG96ZXMpIHtcbiAgICBpZiAoIWV4aXN0aW5nQ2xvemVzLmhhcyhjbG96ZSkpIHtcbiAgICAgIGxldCBhY2NlcHRhYmxlID0gW2Nsb3plXTtcbiAgICAgIGlmIChoYXNLYW5qaShidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1KSkpIHtcbiAgICAgICAgYWNjZXB0YWJsZS5wdXNoKGthdGEyaGlyYShidW5zZXRzdS5tYXAobSA9PiBtLnByb251bmNpYXRpb24pLmpvaW4oJycpKSlcbiAgICAgIH1cbiAgICAgIGJ1bGxldHMucHVzaCgnLSBAZmlsbCAnICsgYWNjZXB0YWJsZS5qb2luKCcgQCAnKSArXG4gICAgICAgICAgICAgICAgICAgYCAgICBAcG9zICR7YnVuc2V0c3UubWFwKG0gPT4gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpKS5qb2luKCcvJyl9YCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBidWxsZXRzO1xufVxuXG5jb25zdCBVU0FHRSA9IGBVU0FHRSAxOlxuJCBub2RlIFt0aGlzLXNjcmlwdC5qc10gW21hcmtkb3duLm1kXVxuXG5VU0FHRSAyOlxuJCBjYXQgW21hcmtkb3duLm1kXSB8IG5vZGUgW3RoaXMtc2NyaXB0LmpzXVxuXG5Cb3RoIHdpbGwgcHJpbnQgYSBwYXJzZWQgdmVyc2lvbiBvZiB0aGUgaW5wdXQuYDtcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xuICBjb25zdCBwcm9taXNpZnkgPSByZXF1aXJlKCd1dGlsJykucHJvbWlzaWZ5O1xuICBjb25zdCByZWFkRmlsZSA9IHByb21pc2lmeShyZXF1aXJlKCdmcycpLnJlYWRGaWxlKTtcbiAgY29uc3QgZ2V0U3RkaW4gPSByZXF1aXJlKCdnZXQtc3RkaW4nKTtcbiAgKGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgIGNvbnN0IHRleHQgPSBwcm9jZXNzLmFyZ3ZbMl0gPyBhd2FpdCByZWFkRmlsZShwcm9jZXNzLmFyZ3ZbMl0sICd1dGY4JykgOiAoKGF3YWl0IGdldFN0ZGluKCkpIHx8IFVTQUdFKTtcbiAgICAvLyBTcGxpdCBNYXJrZG93biBhdCBoZWFkZXIgKGAjIGJsYWJsYWApXG4gICAgbGV0IGJsb2NrcyA9IHNwbGl0QXRIZWFkZXJzKHRleHQpO1xuICAgIC8vIFBhcnNlIGhlYWRlcnNcbiAgICBsZXQgY29udGVudCA9IGF3YWl0IHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrcyk7XG4gICAgLy8gUHJpbnQgcmVzdWx0XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29udGVudC5tYXAodiA9PiB2LmpvaW4oJ1xcbicpKS5qb2luKCdcXG4nKSk7XG4gIH0pKCk7XG59Il19