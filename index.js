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
function morphemeToPromptResponse(morpheme) {
    // use lemma only when inflected, or when literal lacks kanji but lemma has them
    const useLemma = (morpheme.inflection && morpheme.inflection[0]) || (curtiz_utils_1.hasKanji(morpheme.lemma) && !curtiz_utils_1.hasKanji(morpheme.literal));
    const prompt = useLemma ? morpheme.lemma : morpheme.literal;
    const response = kana_1.kata2hira(useLemma ? morpheme.lemmaReading : morpheme.pronunciation);
    {
        const lemmaAnyway = kana_1.kata2hira(morpheme.lemmaReading);
        if (!useLemma && response.includes(CHOUONPU) && findAlternativeChouonpu(response).find(s => s === lemmaAnyway)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBZ0c7QUFFaEcsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQXNCLEtBQUssQ0FBQyxRQUFnQjs7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxzQkFLQztBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQs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QUFJLE9BQU8sR0FBRyxNQUFNLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELGVBQWU7WUFDZixPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7S0FBQSxDQUFDLEVBQUUsQ0FBQztDQUNOIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IHthZGRKZGVwcH0gZnJvbSAnLi9qZGVwcCc7XG5pbXBvcnQge2thdGEyaGlyYX0gZnJvbSAnLi9rYW5hJztcbmltcG9ydCB7Z29vZE1vcnBoZW1lUHJlZGljYXRlLCBpbnZva2VNZWNhYiwgbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcywgTW9ycGhlbWUsIHBhcnNlTWVjYWJ9IGZyb20gJy4vbWVjYWJVbmlkaWMnO1xuaW1wb3J0IHtlbnVtZXJhdGUsIGZpbHRlclJpZ2h0LCBmbGF0dGVuLCBoYXNLYW5qaSwgcGFydGl0aW9uQnksIHRha2VXaGlsZX0gZnJvbSAnY3VydGl6LXV0aWxzJztcbmltcG9ydCB7RW50cnksIGZ1cmlnYW5hVG9TdHJpbmcsIEZ1cmlnYW5hLCBzZXR1cCwgc3RyaW5nVG9GdXJpZ2FuYX0gZnJvbSAnam1kaWN0LWZ1cmlnYW5hLW5vZGUnO1xuXG5jb25zdCBKbWRpY3RGdXJpZ2FuYSA9IHNldHVwKCk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZShzZW50ZW5jZTogc3RyaW5nKTogUHJvbWlzZTx7bW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTt9PiB7XG4gIGxldCByYXdNZWNhYiA9IGF3YWl0IGludm9rZU1lY2FiKHNlbnRlbmNlKTtcbiAgbGV0IG1vcnBoZW1lcyA9IG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMocGFyc2VNZWNhYihzZW50ZW5jZSwgcmF3TWVjYWIpWzBdLmZpbHRlcihvID0+ICEhbykpO1xuICBsZXQgYnVuc2V0c3VzID0gYXdhaXQgYWRkSmRlcHAocmF3TWVjYWIsIG1vcnBoZW1lcyk7XG4gIHJldHVybiB7bW9ycGhlbWVzLCBidW5zZXRzdXN9O1xufVxuXG5jb25zdCBidW5zZXRzdVRvU3RyaW5nID0gKG1vcnBoZW1lczogTW9ycGhlbWVbXSkgPT4gbW9ycGhlbWVzLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdEF0SGVhZGVycyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXVtdIHtcbiAgY29uc3QgaGVhZGVyUmUgPSAvXiMrXFxzKy4rJC87XG4gIHJldHVybiBwYXJ0aXRpb25CeSh0ZXh0LnNwbGl0KCdcXG4nKSwgcyA9PiBoZWFkZXJSZS50ZXN0KHMpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrczogc3RyaW5nW11bXSwgY29uY3VycmVudExpbWl0OiBudW1iZXIgPSAxKSB7XG4gIGxldCByZXQ6IHN0cmluZ1tdW10gPSBbXTtcbiAgbGV0IHByb21pc2VzOiBQcm9taXNlPHN0cmluZ1tdPltdID0gW107XG4gIGNvbnN0IHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IG8gb2YgYmxvY2tzKSB7XG4gICAgaWYgKHByb21pc2VzLmxlbmd0aCA+PSBjb25jdXJyZW50TGltaXQpIHtcbiAgICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICAgICAgcHJvbWlzZXMgPSBbXTtcbiAgICB9XG4gICAgcHJvbWlzZXMucHVzaChwYXJzZUhlYWRlckJsb2NrKG8sIHNlZW4pKTtcbiAgfVxuICBpZiAocHJvbWlzZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgfVxuICByZXR1cm4gcmV0O1xufVxuXG5jb25zdCBQTEVBU0VfUEFSU0VfQkxPQ0sgPSAnLSBAcGxlYXNlUGFyc2UnO1xuY29uc3QgRlVSSUdBTkFfQkxPQ0sgPSAnLSBAZnVyaWdhbmEnO1xuXG5jb25zdCBmbGFzaGFibGVNb3JwaGVtZSA9IChtOiBNb3JwaGVtZSkgPT4ge1xuICBjb25zdCBwb3MgPSBtLnBhcnRPZlNwZWVjaC5qb2luKCctJyk7XG4gIGlmIChoYXNLYW5qaShtLmxpdGVyYWwpICYmICFwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAocG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIGZhbHNlOyB9XG4gIGlmIChwb3Muc3RhcnRzV2l0aCgndmVyYi0nKSB8fCBwb3Muc3RhcnRzV2l0aCgnbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdwcm9ub3VuJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ2FkamVjdGl2JykgfHxcbiAgICAgIHBvcy5zdGFydHNXaXRoKCdhZHZlcmInKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5mdW5jdGlvbiBtb3JwaGVtZVRvUmVhZGluZyhtOiBNb3JwaGVtZSkge1xuICByZXR1cm4gaGFzS2FuamkobS5saXRlcmFsKSA/IGthdGEyaGlyYShtLmxpdGVyYWwgPT09IG0ubGVtbWEgPyBtLmxlbW1hUmVhZGluZyA6IG0ucHJvbnVuY2lhdGlvbikgOiBtLmxpdGVyYWw7XG59XG50eXBlIFBhcnNlZCA9IHtcbiAgbW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTtcbn07XG50eXBlIFNlZW4gPSB7XG4gIGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW107IHJlYWRpbmc6IHN0cmluZztcbn07XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VIZWFkZXJCbG9jayhibG9jazogc3RyaW5nW10sIHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+ID0gbmV3IE1hcChbXSkpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IGF0SGVhZGVyUmUgPSAvXiMrXFxzK0BcXHMrLztcbiAgY29uc3QgbWF0Y2ggPSBibG9ja1swXS5tYXRjaChhdEhlYWRlclJlKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgbGluZSA9IGJsb2NrWzBdLnNsaWNlKG1hdGNoWzBdLmxlbmd0aCk7IC8vIG1pbnVzIHRoZSBmaXJzdCBAXG5cbiAgICBsZXQgW3Byb21wdCwgLi4ucmVzcG9uc2VzXSA9IGxpbmUuc3BsaXQoJ0AnKS5tYXAocyA9PiBzLnRyaW0oKSk7XG4gICAgY29uc3QgcHJlZml4OiBzdHJpbmdbXSA9IFtdO1xuICAgIC8vIHByb2Nlc3MgbGluZSBhbmQgYmxvY2suXG4gICAgY29uc3QgbmVlZHNSZXNwb25zZSA9IHJlc3BvbnNlcy5sZW5ndGggPT09IDEgJiYgcmVzcG9uc2VzWzBdLmxlbmd0aCA9PSAwO1xuICAgIGNvbnN0IGhhc1BsZWFzZVBhcnNlID1cbiAgICAgICAgdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgY29uc3QgaGFzRnVyaWdhbmEgPSB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChGVVJJR0FOQV9CTE9DSykpO1xuICAgIGlmIChuZWVkc1Jlc3BvbnNlIHx8IGhhc1BsZWFzZVBhcnNlIHx8ICFoYXNGdXJpZ2FuYSkge1xuICAgICAgY29uc3QgcGFyc2VkOiBQYXJzZWQgPSBhd2FpdCBwYXJzZShwcm9tcHQpO1xuICAgICAgaWYgKG5lZWRzUmVzcG9uc2UpIHtcbiAgICAgICAgcmVzcG9uc2VzID0gW2thdGEyaGlyYShmbGF0dGVuKHBhcnNlZC5idW5zZXRzdXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIobSA9PiBtLnBhcnRPZlNwZWVjaFswXSAhPT0gJ3N1cHBsZW1lbnRhcnlfc3ltYm9sJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChtID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChtLmxpdGVyYWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoaXQgPyBoaXQucmVhZGluZyA6IG1vcnBoZW1lVG9SZWFkaW5nKG0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbignJykpXTtcbiAgICAgICAgYmxvY2tbMF0gPSBibG9ja1swXSArIChibG9ja1swXS5lbmRzV2l0aCgnICcpID8gJycgOiAnICcpICsgcmVzcG9uc2VzWzBdO1xuICAgICAgfVxuICAgICAgaWYgKGhhc1BsZWFzZVBhcnNlKSB7XG4gICAgICAgIC8vIGFkZCBAIHZvY2FidWxhcnkgbGluZXM6XG4gICAgICAgIGxldCBmbGFzaEJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAobGV0IFttaWR4LCBtb3JwaGVtZV0gb2YgZW51bWVyYXRlKHBhcnNlZC5tb3JwaGVtZXMpKSB7XG4gICAgICAgICAgaWYgKHBhcnNlZC5tb3JwaGVtZXMubGVuZ3RoID09PSAxKSB7IGJyZWFrOyB9XG4gICAgICAgICAgaWYgKGZsYXNoYWJsZU1vcnBoZW1lKG1vcnBoZW1lKSkge1xuICAgICAgICAgICAgbGV0IHtwcm9tcHQ6IG1wcm9tcHQsIHJlc3BvbnNlOiBtcmVzcG9uc2V9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG1vcnBoZW1lKTtcblxuICAgICAgICAgICAgbGV0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBbXTtcbiAgICAgICAgICAgIGlmIChoYXNLYW5qaShtcHJvbXB0KSkgeyBmdXJpZ2FuYSA9IGF3YWl0IHZvY2FiVG9GdXJpZ2FuYShbbW9ycGhlbWVdKTsgfVxuXG4gICAgICAgICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChtcHJvbXB0KTtcbiAgICAgICAgICAgIGlmICghaGl0KSB7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKG1hdGNoWzBdICsgYCR7bXByb21wdH0gQCAke21yZXNwb25zZX1gKTtcbiAgICAgICAgICAgICAgcHJlZml4LnB1c2goRlVSSUdBTkFfQkxPQ0sgKyAnICcgKyBmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJykpO1xuICAgICAgICAgICAgICBwcmVmaXgucHVzaChgKEF1dG8tYWRkZWQgdmlhIOOAjiR7cHJvbXB0feOAjylgKTtcbiAgICAgICAgICAgICAgc2Vlbi5zZXQobXByb21wdCwge2Z1cmlnYW5hLCByZWFkaW5nOiBtcmVzcG9uc2V9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG1yZXNwb25zZSA9IGhpdC5yZWFkaW5nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZSgwLCBtaWR4KS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgcmlnaHQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKG1pZHggKyAxKS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgbGV0IGNsb3plID0gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIG1vcnBoZW1lLmxpdGVyYWwsIHJpZ2h0KTtcbiAgICAgICAgICAgIGxldCBmaW5hbCA9ICcnO1xuICAgICAgICAgICAgaWYgKG1wcm9tcHQgPT09IG1vcnBoZW1lLmxpdGVyYWwgJiYgYXBwZWFyc0V4YWN0bHlPbmNlKHByb21wdCwgbW9ycGhlbWUubGl0ZXJhbCkpIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gQG9taXQgJHtjbG96ZX1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmbGFzaEJ1bGxldHMucHVzaChmaW5hbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5mbGFzaEJ1bGxldHMpO1xuXG4gICAgICAgIC8vIGFkZCBAZmlsbCBsaW5lc1xuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uaWRlbnRpZnlGaWxsSW5CbGFua3MocGFyc2VkLmJ1bnNldHN1cykpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBAcGxlYXNlUGFyc2VcbiAgICAgICAgYmxvY2sgPSBibG9jay5maWx0ZXIocyA9PiAhcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgICAgfVxuICAgICAgaWYgKCFoYXNGdXJpZ2FuYSkge1xuICAgICAgICBpZiAoaGFzS2FuamkocHJvbXB0KSkge1xuICAgICAgICAgIC8vIGFkZCBmdXJpZ2FuYSBsaW5lXG4gICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCBwYXJzZWRUb0Z1cmlnYW5hKHBhcnNlZC5tb3JwaGVtZXMsIHNlZW4pO1xuICAgICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCBgJHtGVVJJR0FOQV9CTE9DS30gJHtmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJyl9YCk7XG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmEsIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbW3Jlc3BvbnNlc1swXV1dLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmFCdWxsZXRzID0gYmxvY2suZmlsdGVyKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgICAgIGlmIChmdXJpZ2FuYUJ1bGxldHMubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBzdHJpbmdUb0Z1cmlnYW5hKGZ1cmlnYW5hQnVsbGV0c1swXS5zbGljZShGVVJJR0FOQV9CTE9DSy5sZW5ndGgpKVxuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbZnVyaWdhbmFdLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGSVhNRSBEUlkgc2FtZSBhcyBhYm92ZVxuICAgICAgY29uc3QgZnVyaWdhbmFCdWxsZXQgPSBibG9jay5maW5kKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgICBpZiAoZnVyaWdhbmFCdWxsZXQpIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBzdHJpbmdUb0Z1cmlnYW5hKGZ1cmlnYW5hQnVsbGV0LnNsaWNlKEZVUklHQU5BX0JMT0NLLmxlbmd0aCkpXG4gICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbZnVyaWdhbmFdLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgIH1cbiAgICB9XG4gICAgYmxvY2sgPSBwcmVmaXguY29uY2F0KGJsb2NrKTtcbiAgfVxuICByZXR1cm4gYmxvY2s7XG59XG5cbmZ1bmN0aW9uIG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtb3JwaGVtZTogTW9ycGhlbWUpIHtcbiAgLy8gdXNlIGxlbW1hIG9ubHkgd2hlbiBpbmZsZWN0ZWQsIG9yIHdoZW4gbGl0ZXJhbCBsYWNrcyBrYW5qaSBidXQgbGVtbWEgaGFzIHRoZW1cbiAgY29uc3QgdXNlTGVtbWEgPVxuICAgICAgKG1vcnBoZW1lLmluZmxlY3Rpb24gJiYgbW9ycGhlbWUuaW5mbGVjdGlvblswXSkgfHwgKGhhc0thbmppKG1vcnBoZW1lLmxlbW1hKSAmJiAhaGFzS2FuamkobW9ycGhlbWUubGl0ZXJhbCkpO1xuICBjb25zdCBwcm9tcHQgPSB1c2VMZW1tYSA/IG1vcnBoZW1lLmxlbW1hIDogbW9ycGhlbWUubGl0ZXJhbDtcbiAgY29uc3QgcmVzcG9uc2UgPSBrYXRhMmhpcmEodXNlTGVtbWEgPyBtb3JwaGVtZS5sZW1tYVJlYWRpbmcgOiBtb3JwaGVtZS5wcm9udW5jaWF0aW9uKTtcbiAge1xuICAgIGNvbnN0IGxlbW1hQW55d2F5ID0ga2F0YTJoaXJhKG1vcnBoZW1lLmxlbW1hUmVhZGluZyk7XG4gICAgaWYgKCF1c2VMZW1tYSAmJiByZXNwb25zZS5pbmNsdWRlcyhDSE9VT05QVSkgJiYgZmluZEFsdGVybmF0aXZlQ2hvdW9ucHUocmVzcG9uc2UpLmZpbmQocyA9PiBzID09PSBsZW1tYUFueXdheSkpIHtcbiAgICAgIHJldHVybiB7cHJvbXB0LCByZXNwb25zZToga2F0YTJoaXJhKG1vcnBoZW1lLmxlbW1hUmVhZGluZyl9O1xuICAgIH1cbiAgfVxuICByZXR1cm4ge3Byb21wdCwgcmVzcG9uc2V9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB2b2NhYlRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgcmV0dXJuIFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge3Byb21wdDogbGVtbWEsIHJlc3BvbnNlOiBsZW1tYVJlYWRpbmd9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG0pO1xuICAgIGlmIChoYXNLYW5qaShsZW1tYSkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHsgcmV0dXJuIGxlbW1hSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGVtbWEpID8ge3J1Ynk6IGxlbW1hLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGVtbWFdO1xuICB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlZFRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdLCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPik6IFByb21pc2U8RnVyaWdhbmFbXVtdPiB7XG4gIGNvbnN0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBhd2FpdCBQcm9taXNlLmFsbChtb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgIGNvbnN0IHtsZW1tYSwgbGVtbWFSZWFkaW5nLCBsaXRlcmFsLCBwcm9udW5jaWF0aW9ufSA9IG07XG4gICAgaWYgKGhhc0thbmppKGxpdGVyYWwpKSB7XG4gICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChsaXRlcmFsKTtcbiAgICAgIGlmIChoaXQpIHsgcmV0dXJuIGZsYXR0ZW4oaGl0LmZ1cmlnYW5hKSB8fCBbXTsgfVxuXG4gICAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICBjb25zdCBsaXRlcmFsSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsaXRlcmFsLCAncmVhZGluZycsIHByb251bmNpYXRpb24pO1xuICAgICAgaWYgKGxpdGVyYWxIaXQpIHsgcmV0dXJuIGxpdGVyYWxIaXQuZnVyaWdhbmE7IH1cbiAgICAgIGNvbnN0IHByb251bmNpYXRpb25IaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIHByb251bmNpYXRpb24sICd0ZXh0JywgbGl0ZXJhbCk7XG4gICAgICBpZiAocHJvbnVuY2lhdGlvbkhpdCkgeyByZXR1cm4gcHJvbnVuY2lhdGlvbkhpdC5mdXJpZ2FuYTsgfVxuXG4gICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYURpY3Q6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3QgZiBvZiBsZW1tYUhpdC5mdXJpZ2FuYSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBmdXJpZ2FuYURpY3Quc2V0KGYucnVieSwgZi5ydCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgICBsZXQga2FuamkgPSBjaGFycy5maWx0ZXIoaGFzS2FuamkpO1xuICAgICAgICBjb25zdCBhbm5vdGF0ZWRDaGFyczogRnVyaWdhbmFbXSA9IGNoYXJzLnNsaWNlKCk7XG5cbiAgICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICAgIHdoaWxlIChrYW5qaS5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBoaXQgPSB0cml1KGthbmppKS5maW5kKGtzID0+IGZ1cmlnYW5hRGljdC5oYXMoa3Muam9pbignJykpKTtcbiAgICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgICBjb25zdCBoaXRzdHIgPSBoaXQuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBsaXRlcmFsLmluZGV4T2YoaGl0c3RyKTtcbiAgICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaWR4ICsgMTsgaSA8IGlkeCArIGhpdHN0ci5sZW5ndGg7IGkrKykgeyBhbm5vdGF0ZWRDaGFyc1tpXSA9ICcnOyB9XG4gICAgICAgICAgICBrYW5qaSA9IGthbmppLnNsaWNlKGhpdHN0ci5sZW5ndGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhbm5vdGF0ZWRDaGFycztcbiAgICAgIH1cbiAgICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAgIC8vIGlmIChsZW1tYVJlYWRpbmdIaXQpIHsgcmV0dXJuIGxlbW1hUmVhZGluZ0hpdC5mdXJpZ2FuYTsgfVxuICAgIH1cbiAgICByZXR1cm4gW2hhc0thbmppKGxpdGVyYWwpID8ge3J1Ynk6IGxpdGVyYWwsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsaXRlcmFsXTtcbiAgfSkpO1xuXG4gIHJldHVybiBmdXJpZ2FuYTtcbn1cblxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IENIT1VPTlBVX1BSRUZJWF9NQVAgPSBjcmVhdGVDaG91b25wdVByZWZpeE1hcCgpO1xuY29uc3QgQ0hPVU9OUFUgPSAn44O8JzsgLy8gaHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ2glQzUlOERvbnB1XG5mdW5jdGlvbiBjcmVhdGVDaG91b25wdVByZWZpeE1hcCgpIHtcbiAgY29uc3QgcHJlZml4ZXMgPSAn44GC44GE44GG44GE44GGJztcbiAgY29uc3QgbWFwOiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICBg44GB44GC44GL44GM44GV44GW44Gf44Gg44Gq44Gv44Gw44Gx44G+44KD44KE44KJ44KO44KPXG7jgYPjgYTjgY3jgY7jgZfjgZjjgaHjgaLjgavjgbLjgbPjgbTjgb/jgopcbuOBheOBhuOBj+OBkOOBmeOBmuOBo+OBpOOBpeOBrOOBteOBtuOBt+OCgOOCheOChuOCi+OClFxu44GH44GI44GR44GS44Gb44Gc44Gm44Gn44Gt44G444G544G644KB44KMXG7jgYnjgYrjgZPjgZTjgZ3jgZ7jgajjganjga7jgbvjgbzjgb3jgoLjgofjgojjgo3jgpJgLnNwbGl0KCdcXG4nKVxuICAgICAgLmZvckVhY2goKGxpbmUsIGkpID0+IGxpbmUuc3BsaXQoJycpLmZvckVhY2gocyA9PiBtYXAuc2V0KHMsIHMgKyBwcmVmaXhlc1tpXSkpKTtcbiAgcmV0dXJuIG1hcDtcbn1cblxuZnVuY3Rpb24gZmluZEFsdGVybmF0aXZlQ2hvdW9ucHUoaGlyYWdhbmE6IHN0cmluZyk6IHN0cmluZ1tdIHtcbiAgY29uc3QgaGl0cyA9IFtoaXJhZ2FuYV07XG4gIGZvciAobGV0IGkgPSAxOyBpIDwgaGlyYWdhbmEubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoaGlyYWdhbmFbaV0gPT09IENIT1VPTlBVKSB7XG4gICAgICBjb25zdCByZXBsYWNlbWVudCA9IENIT1VPTlBVX1BSRUZJWF9NQVAuZ2V0KGhpcmFnYW5hW2kgLSAxXSk7XG4gICAgICBpZiAocmVwbGFjZW1lbnQpIHtcbiAgICAgICAgY29uc3QgcHJlZml4ID0gaGlyYWdhbmEuc2xpY2UoMCwgaSAtIDEpO1xuICAgICAgICBjb25zdCBwb3N0Zml4ID0gaGlyYWdhbmEuc2xpY2UoaSArIDEpO1xuICAgICAgICBoaXRzLnB1c2gocHJlZml4ICsgcmVwbGFjZW1lbnQgKyBwb3N0Zml4KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGhpdHM7XG59XG5mdW5jdGlvbiBzZWFyY2gobWFwOiBNYXA8c3RyaW5nLCBFbnRyeVtdPiwgZmlyc3Q6IHN0cmluZywgc3ViOiAncmVhZGluZyd8J3RleHQnLCBzZWNvbmQ6IHN0cmluZyk6IEVudHJ5fHVuZGVmaW5lZCB7XG4gIGNvbnN0IGhpdCA9IG1hcC5nZXQoZmlyc3QpO1xuICBpZiAoaGl0KSB7XG4gICAgaWYgKGhpdC5sZW5ndGggPT09IDEpIHsgcmV0dXJuIGhpdFswXTsgfVxuICAgIGNvbnN0IHBvc3NpYmxlU2Vjb25kcyA9IGZpbmRBbHRlcm5hdGl2ZUNob3VvbnB1KGthdGEyaGlyYShzZWNvbmQpKTtcbiAgICBjb25zdCBzdWJoaXQgPSBoaXQuZmluZChlID0+IHtcbiAgICAgIGNvbnN0IGRpY3QgPSBrYXRhMmhpcmEoZVtzdWJdKTtcbiAgICAgIHJldHVybiBwb3NzaWJsZVNlY29uZHMuc29tZShzZWNvbmQgPT4gc2Vjb25kID09PSBkaWN0KTtcbiAgICB9KTtcbiAgICBpZiAoc3ViaGl0KSB7IHJldHVybiBzdWJoaXQ7IH1cbiAgICBjb25zb2xlLmVycm9yKGBmb3VuZCBoaXQgZm9yICR7Zmlyc3R9IGJ1dCBub3QgJHtzZWNvbmR9YCwge2hpdCwgcG9zc2libGVTZWNvbmRzfSk7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbmVlZGxlIGlzIGZvdW5kIGluIGhheXN0YWNrIG9ubHkgb25jZVxuICogQHBhcmFtIGhheXN0YWNrIGJpZyBzdHJpbmdcbiAqIEBwYXJhbSBuZWVkbGUgbGl0dGxlIHN0cmluZ1xuICovXG5mdW5jdGlvbiBhcHBlYXJzRXhhY3RseU9uY2UoaGF5c3RhY2s6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgbGV0IGhpdDogbnVtYmVyO1xuICByZXR1cm4gKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlKSkgPj0gMCAmJiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGhpdCArIDEpKSA8IDA7XG59XG4vKipcbiAqIEdpdmVuIHRocmVlIGNvbnNlY3V0aWVzIHN1YnN0cmluZ3MgKHRoZSBhcmd1bWVudHMpLCByZXR1cm4gZWl0aGVyXG4gKiAtIGAke2xlZnQyfVske2Nsb3plfV0ke3JpZ2h0Mn1gIHdoZXJlIGBsZWZ0MmAgYW5kIGByaWdodDJgIGFyZSBhcyBzaG9ydCBhcyBwb3NzaWJsZSAoYW5kIG9mIGVxdWFsIGxlbmd0aCwgaWZcbiAqICAgIHBvc3NpYmxlKSBzbyB0aGUgdGhpcyByZXR1cm4gc3RyaW5nIChtaW51cyB0aGUgYnJhY2tldHMpIGlzIHVuaXF1ZSBpbiB0aGUgZnVsbCBzdHJpbmcsIG9yXG4gKiAtIGAke2Nsb3plfWAgaWYgYGxlZnQyID09PSByaWdodDIgPT09ICcnYCAoaS5lLiwgdGhlIGFib3ZlIGJ1dCB3aXRob3V0IHRoZSBicmFja2V0cykuXG4gKiBAcGFyYW0gbGVmdCBsZWZ0IHN0cmluZywgcG9zc2libHkgZW1wdHlcbiAqIEBwYXJhbSBjbG96ZSBtaWRkbGUgc3RyaW5nXG4gKiBAcGFyYW0gcmlnaHQgcmlnaHQgc3RyaW5nLCBwb3NzaWJsZSBlbXB0eVxuICogQHRocm93cyBpbiB0aGUgdW5saWtlbHkgZXZlbnQgdGhhdCBzdWNoIGEgcmV0dXJuIHN0cmluZyBjYW5ub3QgYmUgYnVpbGQgKEkgY2Fubm90IHRoaW5rIG9mIGFuIGV4YW1wbGUgdGhvdWdoKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdDogc3RyaW5nLCBjbG96ZTogc3RyaW5nLCByaWdodDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VudGVuY2UgPSBsZWZ0ICsgY2xvemUgKyByaWdodDtcbiAgbGV0IGxlZnRDb250ZXh0ID0gJyc7XG4gIGxldCByaWdodENvbnRleHQgPSAnJztcbiAgbGV0IGNvbnRleHRMZW5ndGggPSAwO1xuICB3aGlsZSAoIWFwcGVhcnNFeGFjdGx5T25jZShzZW50ZW5jZSwgbGVmdENvbnRleHQgKyBjbG96ZSArIHJpZ2h0Q29udGV4dCkpIHtcbiAgICBjb250ZXh0TGVuZ3RoKys7XG4gICAgaWYgKGNvbnRleHRMZW5ndGggPj0gbGVmdC5sZW5ndGggJiYgY29udGV4dExlbmd0aCA+PSByaWdodC5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmFuIG91dCBvZiBjb250ZXh0IHRvIGJ1aWxkIHVuaXF1ZSBjbG96ZScpO1xuICAgIH1cbiAgICBsZWZ0Q29udGV4dCA9IGxlZnQuc2xpY2UoLWNvbnRleHRMZW5ndGgpO1xuICAgIHJpZ2h0Q29udGV4dCA9IHJpZ2h0LnNsaWNlKDAsIGNvbnRleHRMZW5ndGgpO1xuICB9XG4gIGlmIChsZWZ0Q29udGV4dCA9PT0gJycgJiYgcmlnaHRDb250ZXh0ID09PSAnJykgeyByZXR1cm4gY2xvemU7IH1cbiAgcmV0dXJuIGAke2xlZnRDb250ZXh0fVske2Nsb3plfV0ke3JpZ2h0Q29udGV4dH1gO1xufVxuXG5mdW5jdGlvbiBpZGVudGlmeUZpbGxJbkJsYW5rcyhidW5zZXRzdXM6IE1vcnBoZW1lW11bXSkge1xuICAvLyBGaW5kIGNsb3plczogcGFydGljbGVzIGFuZCBjb25qdWdhdGVkIHZlcmIvYWRqZWN0aXZlIHBocmFzZXNcbiAgbGV0IGxpdGVyYWxDbG96ZXM6IE1hcDxzdHJpbmcsIE1vcnBoZW1lW10+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IFtiaWR4LCBidW5zZXRzdV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1cykpIHtcbiAgICBsZXQgZmlyc3QgPSBidW5zZXRzdVswXTtcbiAgICBpZiAoIWZpcnN0KSB7IGNvbnRpbnVlOyB9XG4gICAgY29uc3QgcG9zMCA9IGZpcnN0LnBhcnRPZlNwZWVjaFswXTtcbiAgICBsZXQgc2VhcmNoRm9yUGFydGljbGVzID0gdHJ1ZTtcbiAgICBpZiAoYnVuc2V0c3VzLmxlbmd0aCA+IDEgJiYgYnVuc2V0c3UubGVuZ3RoID4gMSAmJlxuICAgICAgICAocG9zMC5zdGFydHNXaXRoKCd2ZXJiJykgfHwgcG9zMC5lbmRzV2l0aCgnX3ZlcmInKSB8fCBwb3MwLnN0YXJ0c1dpdGgoJ2FkamVjdCcpKSkge1xuICAgICAgbGV0IGlnbm9yZVJpZ2h0ID0gZmlsdGVyUmlnaHQoYnVuc2V0c3UsIG0gPT4gIWdvb2RNb3JwaGVtZVByZWRpY2F0ZShtKSk7XG4gICAgICBsZXQgZ29vZEJ1bnNldHN1ID0gaWdub3JlUmlnaHQubGVuZ3RoID09PSAwID8gYnVuc2V0c3UgOiBidW5zZXRzdS5zbGljZSgwLCAtaWdub3JlUmlnaHQubGVuZ3RoKTtcbiAgICAgIGlmIChnb29kQnVuc2V0c3UubGVuZ3RoID4gMSkge1xuICAgICAgICBzZWFyY2hGb3JQYXJ0aWNsZXMgPSBmYWxzZTtcbiAgICAgICAgbGV0IGNsb3plID0gYnVuc2V0c3VUb1N0cmluZyhnb29kQnVuc2V0c3UpO1xuICAgICAgICBsZXQgbGVmdCA9IGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxldCByaWdodCA9IGJ1bnNldHN1VG9TdHJpbmcoaWdub3JlUmlnaHQpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBjbG96ZSwgcmlnaHQpLCBnb29kQnVuc2V0c3UpO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBvbmx5IGFkZCBwYXJ0aWNsZXMgaWYgdGhleSdyZSBOT1QgaW5zaWRlIGNvbmp1Z2F0ZWQgcGhyYXNlc1xuICAgIGNvbnN0IHBhcnRpY2xlUHJlZGljYXRlID0gKHA6IE1vcnBoZW1lKSA9PiBwLnBhcnRPZlNwZWVjaFswXS5zdGFydHNXaXRoKCdwYXJ0aWNsZScpICYmIHAucGFydE9mU3BlZWNoLmxlbmd0aCA+IDEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXAucGFydE9mU3BlZWNoWzFdLnN0YXJ0c1dpdGgoJ3BocmFzZV9maW5hbCcpO1xuICAgIGlmIChzZWFyY2hGb3JQYXJ0aWNsZXMpIHtcbiAgICAgIGZvciAobGV0IFtwaWR4LCBwYXJ0aWNsZV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1KSkge1xuICAgICAgICBpZiAocGFydGljbGVQcmVkaWNhdGUocGFydGljbGUpKSB7XG4gICAgICAgICAgbGV0IGxlZnQgPVxuICAgICAgICAgICAgICBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpICsgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZSgwLCBwaWR4KSk7XG4gICAgICAgICAgbGV0IHJpZ2h0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZShwaWR4ICsgMSkpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIHBhcnRpY2xlLmxpdGVyYWwsIHJpZ2h0KSwgW3BhcnRpY2xlXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgbGV0IGV4aXN0aW5nQ2xvemVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW10pO1xuICBsZXQgYnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgW2Nsb3plLCBidW5zZXRzdV0gb2YgbGl0ZXJhbENsb3plcykge1xuICAgIGlmICghZXhpc3RpbmdDbG96ZXMuaGFzKGNsb3plKSkge1xuICAgICAgbGV0IGFjY2VwdGFibGUgPSBbY2xvemVdO1xuICAgICAgaWYgKGhhc0thbmppKGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3UpKSkge1xuICAgICAgICBhY2NlcHRhYmxlLnB1c2goa2F0YTJoaXJhKGJ1bnNldHN1Lm1hcChtID0+IG0ucHJvbnVuY2lhdGlvbikuam9pbignJykpKVxuICAgICAgfVxuICAgICAgYnVsbGV0cy5wdXNoKCctIEBmaWxsICcgKyBhY2NlcHRhYmxlLmpvaW4oJyBAICcpICtcbiAgICAgICAgICAgICAgICAgICBgICAgIEBwb3MgJHtidW5zZXRzdS5tYXAobSA9PiBtLnBhcnRPZlNwZWVjaC5qb2luKCctJykpLmpvaW4oJy8nKX1gKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ1bGxldHM7XG59XG5cbmNvbnN0IFVTQUdFID0gYFVTQUdFIDE6XG4kIG5vZGUgW3RoaXMtc2NyaXB0LmpzXSBbbWFya2Rvd24ubWRdXG5cblVTQUdFIDI6XG4kIGNhdCBbbWFya2Rvd24ubWRdIHwgbm9kZSBbdGhpcy1zY3JpcHQuanNdXG5cbkJvdGggd2lsbCBwcmludCBhIHBhcnNlZCB2ZXJzaW9uIG9mIHRoZSBpbnB1dC5gO1xuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IHJlYWRGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2ZzJykucmVhZEZpbGUpO1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgY29uc3QgdGV4dCA9IHByb2Nlc3MuYXJndlsyXSA/IGF3YWl0IHJlYWRGaWxlKHByb2Nlc3MuYXJndlsyXSwgJ3V0ZjgnKSA6ICgoYXdhaXQgZ2V0U3RkaW4oKSkgfHwgVVNBR0UpO1xuICAgIC8vIFNwbGl0IE1hcmtkb3duIGF0IGhlYWRlciAoYCMgYmxhYmxhYClcbiAgICBsZXQgYmxvY2tzID0gc3BsaXRBdEhlYWRlcnModGV4dCk7XG4gICAgLy8gUGFyc2UgaGVhZGVyc1xuICAgIGxldCBjb250ZW50ID0gYXdhaXQgcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzKTtcbiAgICAvLyBQcmludCByZXN1bHRcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb250ZW50Lm1hcCh2ID0+IHYuam9pbignXFxuJykpLmpvaW4oJ1xcbicpKTtcbiAgfSkoKTtcbn0iXX0=