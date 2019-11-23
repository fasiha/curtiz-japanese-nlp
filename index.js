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
        .forEach((line, i) => line.split('').forEach(s => map.set(s, [s + prefixes[i]])));
    return map;
}
function findAlternativeChouonpu(katakana) {
    const hits = [katakana];
    for (let i = 1; i < katakana.length; i++) {
        if (katakana[i] === CHOUONPU) {
            const replacements = CHOUONPU_PREFIX_MAP.get(katakana[i - 1]);
            if (replacements) {
                const prefix = katakana.slice(0, i - 1);
                const postfix = katakana.slice(i + 1);
                hits.push(...replacements.map(replacer => prefix + replacer + postfix));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBZ0c7QUFFaEcsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQXNCLEtBQUssQ0FBQyxRQUFnQjs7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxzQkFLQztBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQs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QztDQUNOIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IHthZGRKZGVwcH0gZnJvbSAnLi9qZGVwcCc7XG5pbXBvcnQge2thdGEyaGlyYX0gZnJvbSAnLi9rYW5hJztcbmltcG9ydCB7Z29vZE1vcnBoZW1lUHJlZGljYXRlLCBpbnZva2VNZWNhYiwgbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcywgTW9ycGhlbWUsIHBhcnNlTWVjYWJ9IGZyb20gJy4vbWVjYWJVbmlkaWMnO1xuaW1wb3J0IHtlbnVtZXJhdGUsIGZpbHRlclJpZ2h0LCBmbGF0dGVuLCBoYXNLYW5qaSwgcGFydGl0aW9uQnksIHRha2VXaGlsZX0gZnJvbSAnY3VydGl6LXV0aWxzJztcbmltcG9ydCB7RW50cnksIGZ1cmlnYW5hVG9TdHJpbmcsIEZ1cmlnYW5hLCBzZXR1cCwgc3RyaW5nVG9GdXJpZ2FuYX0gZnJvbSAnam1kaWN0LWZ1cmlnYW5hLW5vZGUnO1xuXG5jb25zdCBKbWRpY3RGdXJpZ2FuYSA9IHNldHVwKCk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZShzZW50ZW5jZTogc3RyaW5nKTogUHJvbWlzZTx7bW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTt9PiB7XG4gIGxldCByYXdNZWNhYiA9IGF3YWl0IGludm9rZU1lY2FiKHNlbnRlbmNlKTtcbiAgbGV0IG1vcnBoZW1lcyA9IG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMocGFyc2VNZWNhYihzZW50ZW5jZSwgcmF3TWVjYWIpWzBdLmZpbHRlcihvID0+ICEhbykpO1xuICBsZXQgYnVuc2V0c3VzID0gYXdhaXQgYWRkSmRlcHAocmF3TWVjYWIsIG1vcnBoZW1lcyk7XG4gIHJldHVybiB7bW9ycGhlbWVzLCBidW5zZXRzdXN9O1xufVxuXG5jb25zdCBidW5zZXRzdVRvU3RyaW5nID0gKG1vcnBoZW1lczogTW9ycGhlbWVbXSkgPT4gbW9ycGhlbWVzLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdEF0SGVhZGVycyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXVtdIHtcbiAgY29uc3QgaGVhZGVyUmUgPSAvXiMrXFxzKy4rJC87XG4gIHJldHVybiBwYXJ0aXRpb25CeSh0ZXh0LnNwbGl0KCdcXG4nKSwgcyA9PiBoZWFkZXJSZS50ZXN0KHMpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrczogc3RyaW5nW11bXSwgY29uY3VycmVudExpbWl0OiBudW1iZXIgPSAxKSB7XG4gIGxldCByZXQ6IHN0cmluZ1tdW10gPSBbXTtcbiAgbGV0IHByb21pc2VzOiBQcm9taXNlPHN0cmluZ1tdPltdID0gW107XG4gIGNvbnN0IHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IG8gb2YgYmxvY2tzKSB7XG4gICAgaWYgKHByb21pc2VzLmxlbmd0aCA+PSBjb25jdXJyZW50TGltaXQpIHtcbiAgICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICAgICAgcHJvbWlzZXMgPSBbXTtcbiAgICB9XG4gICAgcHJvbWlzZXMucHVzaChwYXJzZUhlYWRlckJsb2NrKG8sIHNlZW4pKTtcbiAgfVxuICBpZiAocHJvbWlzZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgfVxuICByZXR1cm4gcmV0O1xufVxuXG5jb25zdCBQTEVBU0VfUEFSU0VfQkxPQ0sgPSAnLSBAcGxlYXNlUGFyc2UnO1xuY29uc3QgRlVSSUdBTkFfQkxPQ0sgPSAnLSBAZnVyaWdhbmEnO1xuXG5jb25zdCBmbGFzaGFibGVNb3JwaGVtZSA9IChtOiBNb3JwaGVtZSkgPT4ge1xuICBjb25zdCBwb3MgPSBtLnBhcnRPZlNwZWVjaC5qb2luKCctJyk7XG4gIGlmIChoYXNLYW5qaShtLmxpdGVyYWwpICYmICFwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAocG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIGZhbHNlOyB9XG4gIGlmIChwb3Muc3RhcnRzV2l0aCgndmVyYi0nKSB8fCBwb3Muc3RhcnRzV2l0aCgnbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdwcm9ub3VuJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ2FkamVjdGl2JykgfHxcbiAgICAgIHBvcy5zdGFydHNXaXRoKCdhZHZlcmInKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5mdW5jdGlvbiBtb3JwaGVtZVRvUmVhZGluZyhtOiBNb3JwaGVtZSkge1xuICByZXR1cm4gaGFzS2FuamkobS5saXRlcmFsKSA/IGthdGEyaGlyYShtLmxpdGVyYWwgPT09IG0ubGVtbWEgPyBtLmxlbW1hUmVhZGluZyA6IG0ucHJvbnVuY2lhdGlvbikgOiBtLmxpdGVyYWw7XG59XG50eXBlIFBhcnNlZCA9IHtcbiAgbW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTtcbn07XG50eXBlIFNlZW4gPSB7XG4gIGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW107IHJlYWRpbmc6IHN0cmluZztcbn07XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VIZWFkZXJCbG9jayhibG9jazogc3RyaW5nW10sIHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+ID0gbmV3IE1hcChbXSkpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IGF0SGVhZGVyUmUgPSAvXiMrXFxzK0BcXHMrLztcbiAgY29uc3QgbWF0Y2ggPSBibG9ja1swXS5tYXRjaChhdEhlYWRlclJlKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgbGluZSA9IGJsb2NrWzBdLnNsaWNlKG1hdGNoWzBdLmxlbmd0aCk7IC8vIG1pbnVzIHRoZSBmaXJzdCBAXG5cbiAgICBsZXQgW3Byb21wdCwgLi4ucmVzcG9uc2VzXSA9IGxpbmUuc3BsaXQoJ0AnKS5tYXAocyA9PiBzLnRyaW0oKSk7XG4gICAgY29uc3QgcHJlZml4OiBzdHJpbmdbXSA9IFtdO1xuICAgIC8vIHByb2Nlc3MgbGluZSBhbmQgYmxvY2suXG4gICAgY29uc3QgbmVlZHNSZXNwb25zZSA9IHJlc3BvbnNlcy5sZW5ndGggPT09IDEgJiYgcmVzcG9uc2VzWzBdLmxlbmd0aCA9PSAwO1xuICAgIGNvbnN0IGhhc1BsZWFzZVBhcnNlID1cbiAgICAgICAgdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgY29uc3QgaGFzRnVyaWdhbmEgPSB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChGVVJJR0FOQV9CTE9DSykpO1xuICAgIGlmIChuZWVkc1Jlc3BvbnNlIHx8IGhhc1BsZWFzZVBhcnNlIHx8ICFoYXNGdXJpZ2FuYSkge1xuICAgICAgY29uc3QgcGFyc2VkOiBQYXJzZWQgPSBhd2FpdCBwYXJzZShwcm9tcHQpO1xuICAgICAgaWYgKG5lZWRzUmVzcG9uc2UpIHtcbiAgICAgICAgcmVzcG9uc2VzID0gW2thdGEyaGlyYShmbGF0dGVuKHBhcnNlZC5idW5zZXRzdXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIobSA9PiBtLnBhcnRPZlNwZWVjaFswXSAhPT0gJ3N1cHBsZW1lbnRhcnlfc3ltYm9sJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChtID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChtLmxpdGVyYWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoaXQgPyBoaXQucmVhZGluZyA6IG1vcnBoZW1lVG9SZWFkaW5nKG0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbignJykpXTtcbiAgICAgICAgYmxvY2tbMF0gPSBibG9ja1swXSArIChibG9ja1swXS5lbmRzV2l0aCgnICcpID8gJycgOiAnICcpICsgcmVzcG9uc2VzWzBdO1xuICAgICAgfVxuICAgICAgaWYgKGhhc1BsZWFzZVBhcnNlKSB7XG4gICAgICAgIC8vIGFkZCBAIHZvY2FidWxhcnkgbGluZXM6XG4gICAgICAgIGxldCBmbGFzaEJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAobGV0IFttaWR4LCBtb3JwaGVtZV0gb2YgZW51bWVyYXRlKHBhcnNlZC5tb3JwaGVtZXMpKSB7XG4gICAgICAgICAgaWYgKHBhcnNlZC5tb3JwaGVtZXMubGVuZ3RoID09PSAxKSB7IGJyZWFrOyB9XG4gICAgICAgICAgaWYgKGZsYXNoYWJsZU1vcnBoZW1lKG1vcnBoZW1lKSkge1xuICAgICAgICAgICAgbGV0IHtwcm9tcHQ6IG1wcm9tcHQsIHJlc3BvbnNlOiBtcmVzcG9uc2V9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG1vcnBoZW1lKTtcblxuICAgICAgICAgICAgbGV0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBbXTtcbiAgICAgICAgICAgIGlmIChoYXNLYW5qaShtcHJvbXB0KSkgeyBmdXJpZ2FuYSA9IGF3YWl0IHZvY2FiVG9GdXJpZ2FuYShbbW9ycGhlbWVdKTsgfVxuXG4gICAgICAgICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChtcHJvbXB0KTtcbiAgICAgICAgICAgIGlmICghaGl0KSB7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKG1hdGNoWzBdICsgYCR7bXByb21wdH0gQCAke21yZXNwb25zZX1gKTtcbiAgICAgICAgICAgICAgcHJlZml4LnB1c2goRlVSSUdBTkFfQkxPQ0sgKyAnICcgKyBmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJykpO1xuICAgICAgICAgICAgICBwcmVmaXgucHVzaChgKEF1dG8tYWRkZWQgdmlhIOOAjiR7cHJvbXB0feOAjylgKTtcbiAgICAgICAgICAgICAgc2Vlbi5zZXQobXByb21wdCwge2Z1cmlnYW5hLCByZWFkaW5nOiBtcmVzcG9uc2V9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIG1yZXNwb25zZSA9IGhpdC5yZWFkaW5nO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZSgwLCBtaWR4KS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgcmlnaHQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKG1pZHggKyAxKS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgbGV0IGNsb3plID0gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIG1vcnBoZW1lLmxpdGVyYWwsIHJpZ2h0KTtcbiAgICAgICAgICAgIGxldCBmaW5hbCA9ICcnO1xuICAgICAgICAgICAgaWYgKG1wcm9tcHQgPT09IG1vcnBoZW1lLmxpdGVyYWwgJiYgYXBwZWFyc0V4YWN0bHlPbmNlKHByb21wdCwgbW9ycGhlbWUubGl0ZXJhbCkpIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gQG9taXQgJHtjbG96ZX1gO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmbGFzaEJ1bGxldHMucHVzaChmaW5hbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5mbGFzaEJ1bGxldHMpO1xuXG4gICAgICAgIC8vIGFkZCBAZmlsbCBsaW5lc1xuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uaWRlbnRpZnlGaWxsSW5CbGFua3MocGFyc2VkLmJ1bnNldHN1cykpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBAcGxlYXNlUGFyc2VcbiAgICAgICAgYmxvY2sgPSBibG9jay5maWx0ZXIocyA9PiAhcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgICAgfVxuICAgICAgaWYgKCFoYXNGdXJpZ2FuYSkge1xuICAgICAgICBpZiAoaGFzS2FuamkocHJvbXB0KSkge1xuICAgICAgICAgIC8vIGFkZCBmdXJpZ2FuYSBsaW5lXG4gICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCBwYXJzZWRUb0Z1cmlnYW5hKHBhcnNlZC5tb3JwaGVtZXMsIHNlZW4pO1xuICAgICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCBgJHtGVVJJR0FOQV9CTE9DS30gJHtmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJyl9YCk7XG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmEsIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbW3Jlc3BvbnNlc1swXV1dLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmFCdWxsZXRzID0gYmxvY2suZmlsdGVyKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgICAgIGlmIChmdXJpZ2FuYUJ1bGxldHMubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBzdHJpbmdUb0Z1cmlnYW5hKGZ1cmlnYW5hQnVsbGV0c1swXS5zbGljZShGVVJJR0FOQV9CTE9DSy5sZW5ndGgpKVxuICAgICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbZnVyaWdhbmFdLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGSVhNRSBEUlkgc2FtZSBhcyBhYm92ZVxuICAgICAgY29uc3QgZnVyaWdhbmFCdWxsZXQgPSBibG9jay5maW5kKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgICBpZiAoZnVyaWdhbmFCdWxsZXQpIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBzdHJpbmdUb0Z1cmlnYW5hKGZ1cmlnYW5hQnVsbGV0LnNsaWNlKEZVUklHQU5BX0JMT0NLLmxlbmd0aCkpXG4gICAgICAgIHNlZW4uc2V0KHByb21wdCwge2Z1cmlnYW5hOiBbZnVyaWdhbmFdLCByZWFkaW5nOiByZXNwb25zZXNbMF19KTtcbiAgICAgIH1cbiAgICB9XG4gICAgYmxvY2sgPSBwcmVmaXguY29uY2F0KGJsb2NrKTtcbiAgfVxuICByZXR1cm4gYmxvY2s7XG59XG5cbmZ1bmN0aW9uIG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtb3JwaGVtZTogTW9ycGhlbWUpIHtcbiAgLy8gdXNlIGxlbW1hIG9ubHkgd2hlbiBpbmZsZWN0ZWQsIG9yIHdoZW4gbGl0ZXJhbCBsYWNrcyBrYW5qaSBidXQgbGVtbWEgaGFzIHRoZW1cbiAgY29uc3QgdXNlTGVtbWEgPVxuICAgICAgKG1vcnBoZW1lLmluZmxlY3Rpb24gJiYgbW9ycGhlbWUuaW5mbGVjdGlvblswXSkgfHwgKGhhc0thbmppKG1vcnBoZW1lLmxlbW1hKSAmJiAhaGFzS2FuamkobW9ycGhlbWUubGl0ZXJhbCkpO1xuICBjb25zdCBwcm9tcHQgPSB1c2VMZW1tYSA/IG1vcnBoZW1lLmxlbW1hIDogbW9ycGhlbWUubGl0ZXJhbDtcbiAgY29uc3QgcmVzcG9uc2UgPSBrYXRhMmhpcmEodXNlTGVtbWEgPyBtb3JwaGVtZS5sZW1tYVJlYWRpbmcgOiBtb3JwaGVtZS5wcm9udW5jaWF0aW9uKTtcbiAgcmV0dXJuIHtwcm9tcHQsIHJlc3BvbnNlfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdm9jYWJUb0Z1cmlnYW5hKG1vcnBoZW1lczogTW9ycGhlbWVbXSk6IFByb21pc2U8RnVyaWdhbmFbXVtdPiB7XG4gIHJldHVybiBQcm9taXNlLmFsbChtb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgIGNvbnN0IHtwcm9tcHQ6IGxlbW1hLCByZXNwb25zZTogbGVtbWFSZWFkaW5nfSA9IG1vcnBoZW1lVG9Qcm9tcHRSZXNwb25zZShtKTtcbiAgICBpZiAoaGFzS2FuamkobGVtbWEpKSB7XG4gICAgICBjb25zdCB7dGV4dFRvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsZW1tYSwgJ3JlYWRpbmcnLCBsZW1tYVJlYWRpbmcpO1xuICAgICAgaWYgKGxlbW1hSGl0KSB7IHJldHVybiBsZW1tYUhpdC5mdXJpZ2FuYTsgfVxuICAgIH1cbiAgICByZXR1cm4gW2hhc0thbmppKGxlbW1hKSA/IHtydWJ5OiBsZW1tYSwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxlbW1hXTtcbiAgfSkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBwYXJzZWRUb0Z1cmlnYW5hKG1vcnBoZW1lczogTW9ycGhlbWVbXSwgc2VlbjogTWFwPHN0cmluZywgU2Vlbj4pOiBQcm9taXNlPEZ1cmlnYW5hW11bXT4ge1xuICBjb25zdCBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdID0gYXdhaXQgUHJvbWlzZS5hbGwobW9ycGhlbWVzLm1hcChhc3luYyBtID0+IHtcbiAgICBjb25zdCB7bGVtbWEsIGxlbW1hUmVhZGluZywgbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbn0gPSBtO1xuICAgIGlmIChoYXNLYW5qaShsaXRlcmFsKSkge1xuICAgICAgY29uc3QgaGl0ID0gc2Vlbi5nZXQobGl0ZXJhbCk7XG4gICAgICBpZiAoaGl0KSB7IHJldHVybiBmbGF0dGVuKGhpdC5mdXJpZ2FuYSkgfHwgW107IH1cblxuICAgICAgY29uc3Qge3RleHRUb0VudHJ5LCByZWFkaW5nVG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGl0ZXJhbEhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGl0ZXJhbCwgJ3JlYWRpbmcnLCBwcm9udW5jaWF0aW9uKTtcbiAgICAgIGlmIChsaXRlcmFsSGl0KSB7IHJldHVybiBsaXRlcmFsSGl0LmZ1cmlnYW5hOyB9XG4gICAgICBjb25zdCBwcm9udW5jaWF0aW9uSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBwcm9udW5jaWF0aW9uLCAndGV4dCcsIGxpdGVyYWwpO1xuICAgICAgaWYgKHByb251bmNpYXRpb25IaXQpIHsgcmV0dXJuIHByb251bmNpYXRpb25IaXQuZnVyaWdhbmE7IH1cblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHtcbiAgICAgICAgY29uc3QgZnVyaWdhbmFEaWN0OiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICAgICAgICBmb3IgKGNvbnN0IGYgb2YgbGVtbWFIaXQuZnVyaWdhbmEpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGYgPT09ICdzdHJpbmcnKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgICAgZnVyaWdhbmFEaWN0LnNldChmLnJ1YnksIGYucnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY2hhcnMgPSBsaXRlcmFsLnNwbGl0KCcnKTtcbiAgICAgICAgbGV0IGthbmppID0gY2hhcnMuZmlsdGVyKGhhc0thbmppKTtcbiAgICAgICAgY29uc3QgYW5ub3RhdGVkQ2hhcnM6IEZ1cmlnYW5hW10gPSBjaGFycy5zbGljZSgpO1xuXG4gICAgICAgIC8vIHN0YXJ0IGZyb20gYWxsIGthbmppIGNoYXJhY3RlcnMgaW4gYSBzdHJpbmcsIHNlZSBpZiB0aGF0J3MgaW4gZnVyaWdhbmFEaWN0LCBpZiBub3QsIGNob3AgbGFzdFxuICAgICAgICB3aGlsZSAoa2FuamkubGVuZ3RoKSB7XG4gICAgICAgICAgY29uc3QgaGl0ID0gdHJpdShrYW5qaSkuZmluZChrcyA9PiBmdXJpZ2FuYURpY3QuaGFzKGtzLmpvaW4oJycpKSk7XG4gICAgICAgICAgaWYgKGhpdCkge1xuICAgICAgICAgICAgY29uc3QgaGl0c3RyID0gaGl0LmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgaWR4ID0gbGl0ZXJhbC5pbmRleE9mKGhpdHN0cik7XG4gICAgICAgICAgICBhbm5vdGF0ZWRDaGFyc1tpZHhdID0ge3J1Ynk6IGhpdHN0ciwgcnQ6IGZ1cmlnYW5hRGljdC5nZXQoaGl0c3RyKSB8fCBoaXRzdHJ9O1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IGlkeCArIDE7IGkgPCBpZHggKyBoaXRzdHIubGVuZ3RoOyBpKyspIHsgYW5ub3RhdGVkQ2hhcnNbaV0gPSAnJzsgfVxuICAgICAgICAgICAga2FuamkgPSBrYW5qaS5zbGljZShoaXRzdHIubGVuZ3RoKTtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYW5ub3RhdGVkQ2hhcnM7XG4gICAgICB9XG4gICAgICAvLyBjb25zdCBsZW1tYVJlYWRpbmdIaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIGxlbW1hUmVhZGluZywgJ3RleHQnLCBsZW1tYSk7XG4gICAgICAvLyBpZiAobGVtbWFSZWFkaW5nSGl0KSB7IHJldHVybiBsZW1tYVJlYWRpbmdIaXQuZnVyaWdhbmE7IH1cbiAgICB9XG4gICAgcmV0dXJuIFtoYXNLYW5qaShsaXRlcmFsKSA/IHtydWJ5OiBsaXRlcmFsLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGl0ZXJhbF07XG4gIH0pKTtcblxuICByZXR1cm4gZnVyaWdhbmE7XG59XG5cbmZ1bmN0aW9uIHRyaXU8VD4oYXJyOiBUW10pOiBUW11bXSB7XG4gIGNvbnN0IHJldDogVFtdW10gPSBbXTtcbiAgZm9yIChsZXQgaSA9IGFyci5sZW5ndGg7IGkgPiAwOyAtLWkpIHsgcmV0LnB1c2goYXJyLnNsaWNlKDAsIGkpKTsgfVxuICByZXR1cm4gcmV0O1xufVxuXG5jb25zdCBDSE9VT05QVV9QUkVGSVhfTUFQID0gY3JlYXRlQ2hvdW9ucHVQcmVmaXhNYXAoKTtcbmNvbnN0IENIT1VPTlBVID0gJ+ODvCc7IC8vIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0NoJUM1JThEb25wdVxuZnVuY3Rpb24gY3JlYXRlQ2hvdW9ucHVQcmVmaXhNYXAoKSB7XG4gIGNvbnN0IHByZWZpeGVzID0gJ+OBguOBhOOBhuOBhOOBhic7XG4gIGNvbnN0IG1hcDogTWFwPHN0cmluZywgc3RyaW5nW10+ID0gbmV3IE1hcCgpO1xuICBg44GB44GC44GL44GM44GV44GW44Gf44Gg44Gq44Gv44Gw44Gx44G+44KD44KE44KJ44KO44KPXG7jgYPjgYTjgY3jgY7jgZfjgZjjgaHjgaLjgavjgbLjgbPjgbTjgb/jgopcbuOBheOBhuOBj+OBkOOBmeOBmuOBo+OBpOOBpeOBrOOBteOBtuOBt+OCgOOCheOChuOCi+OClFxu44GH44GI44GR44GS44Gb44Gc44Gm44Gn44Gt44G444G544G644KB44KMXG7jgYnjgYrjgZPjgZTjgZ3jgZ7jgajjganjga7jgbvjgbzjgb3jgoLjgofjgojjgo3jgpJgLnNwbGl0KCdcXG4nKVxuICAgICAgLmZvckVhY2goKGxpbmUsIGkpID0+IGxpbmUuc3BsaXQoJycpLmZvckVhY2gocyA9PiBtYXAuc2V0KHMsIFtzICsgcHJlZml4ZXNbaV1dKSkpO1xuICByZXR1cm4gbWFwO1xufVxuXG5mdW5jdGlvbiBmaW5kQWx0ZXJuYXRpdmVDaG91b25wdShrYXRha2FuYTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBoaXRzID0gW2thdGFrYW5hXTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBrYXRha2FuYS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChrYXRha2FuYVtpXSA9PT0gQ0hPVU9OUFUpIHtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50cyA9IENIT1VPTlBVX1BSRUZJWF9NQVAuZ2V0KGthdGFrYW5hW2kgLSAxXSk7XG4gICAgICBpZiAocmVwbGFjZW1lbnRzKSB7XG4gICAgICAgIGNvbnN0IHByZWZpeCA9IGthdGFrYW5hLnNsaWNlKDAsIGkgLSAxKTtcbiAgICAgICAgY29uc3QgcG9zdGZpeCA9IGthdGFrYW5hLnNsaWNlKGkgKyAxKTtcbiAgICAgICAgaGl0cy5wdXNoKC4uLnJlcGxhY2VtZW50cy5tYXAocmVwbGFjZXIgPT4gcHJlZml4ICsgcmVwbGFjZXIgKyBwb3N0Zml4KSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBoaXRzO1xufVxuZnVuY3Rpb24gc2VhcmNoKG1hcDogTWFwPHN0cmluZywgRW50cnlbXT4sIGZpcnN0OiBzdHJpbmcsIHN1YjogJ3JlYWRpbmcnfCd0ZXh0Jywgc2Vjb25kOiBzdHJpbmcpOiBFbnRyeXx1bmRlZmluZWQge1xuICBjb25zdCBoaXQgPSBtYXAuZ2V0KGZpcnN0KTtcbiAgaWYgKGhpdCkge1xuICAgIGlmIChoaXQubGVuZ3RoID09PSAxKSB7IHJldHVybiBoaXRbMF07IH1cbiAgICBjb25zdCBwb3NzaWJsZVNlY29uZHMgPSBmaW5kQWx0ZXJuYXRpdmVDaG91b25wdShrYXRhMmhpcmEoc2Vjb25kKSk7XG4gICAgY29uc3Qgc3ViaGl0ID0gaGl0LmZpbmQoZSA9PiB7XG4gICAgICBjb25zdCBkaWN0ID0ga2F0YTJoaXJhKGVbc3ViXSk7XG4gICAgICByZXR1cm4gcG9zc2libGVTZWNvbmRzLnNvbWUoc2Vjb25kID0+IHNlY29uZCA9PT0gZGljdCk7XG4gICAgfSk7XG4gICAgaWYgKHN1YmhpdCkgeyByZXR1cm4gc3ViaGl0OyB9XG4gICAgY29uc29sZS5lcnJvcihgZm91bmQgaGl0IGZvciAke2ZpcnN0fSBidXQgbm90ICR7c2Vjb25kfWAsIHtoaXQsIHBvc3NpYmxlU2Vjb25kc30pO1xuICB9XG59XG5cbi8qKlxuICogRW5zdXJlIG5lZWRsZSBpcyBmb3VuZCBpbiBoYXlzdGFjayBvbmx5IG9uY2VcbiAqIEBwYXJhbSBoYXlzdGFjayBiaWcgc3RyaW5nXG4gKiBAcGFyYW0gbmVlZGxlIGxpdHRsZSBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gYXBwZWFyc0V4YWN0bHlPbmNlKGhheXN0YWNrOiBzdHJpbmcsIG5lZWRsZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGxldCBoaXQ6IG51bWJlcjtcbiAgcmV0dXJuIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSkpID49IDAgJiYgKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlLCBoaXQgKyAxKSkgPCAwO1xufVxuLyoqXG4gKiBHaXZlbiB0aHJlZSBjb25zZWN1dGllcyBzdWJzdHJpbmdzICh0aGUgYXJndW1lbnRzKSwgcmV0dXJuIGVpdGhlclxuICogLSBgJHtsZWZ0Mn1bJHtjbG96ZX1dJHtyaWdodDJ9YCB3aGVyZSBgbGVmdDJgIGFuZCBgcmlnaHQyYCBhcmUgYXMgc2hvcnQgYXMgcG9zc2libGUgKGFuZCBvZiBlcXVhbCBsZW5ndGgsIGlmXG4gKiAgICBwb3NzaWJsZSkgc28gdGhlIHRoaXMgcmV0dXJuIHN0cmluZyAobWludXMgdGhlIGJyYWNrZXRzKSBpcyB1bmlxdWUgaW4gdGhlIGZ1bGwgc3RyaW5nLCBvclxuICogLSBgJHtjbG96ZX1gIGlmIGBsZWZ0MiA9PT0gcmlnaHQyID09PSAnJ2AgKGkuZS4sIHRoZSBhYm92ZSBidXQgd2l0aG91dCB0aGUgYnJhY2tldHMpLlxuICogQHBhcmFtIGxlZnQgbGVmdCBzdHJpbmcsIHBvc3NpYmx5IGVtcHR5XG4gKiBAcGFyYW0gY2xvemUgbWlkZGxlIHN0cmluZ1xuICogQHBhcmFtIHJpZ2h0IHJpZ2h0IHN0cmluZywgcG9zc2libGUgZW1wdHlcbiAqIEB0aHJvd3MgaW4gdGhlIHVubGlrZWx5IGV2ZW50IHRoYXQgc3VjaCBhIHJldHVybiBzdHJpbmcgY2Fubm90IGJlIGJ1aWxkIChJIGNhbm5vdCB0aGluayBvZiBhbiBleGFtcGxlIHRob3VnaClcbiAqL1xuZnVuY3Rpb24gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQ6IHN0cmluZywgY2xvemU6IHN0cmluZywgcmlnaHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHNlbnRlbmNlID0gbGVmdCArIGNsb3plICsgcmlnaHQ7XG4gIGxldCBsZWZ0Q29udGV4dCA9ICcnO1xuICBsZXQgcmlnaHRDb250ZXh0ID0gJyc7XG4gIGxldCBjb250ZXh0TGVuZ3RoID0gMDtcbiAgd2hpbGUgKCFhcHBlYXJzRXhhY3RseU9uY2Uoc2VudGVuY2UsIGxlZnRDb250ZXh0ICsgY2xvemUgKyByaWdodENvbnRleHQpKSB7XG4gICAgY29udGV4dExlbmd0aCsrO1xuICAgIGlmIChjb250ZXh0TGVuZ3RoID49IGxlZnQubGVuZ3RoICYmIGNvbnRleHRMZW5ndGggPj0gcmlnaHQubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JhbiBvdXQgb2YgY29udGV4dCB0byBidWlsZCB1bmlxdWUgY2xvemUnKTtcbiAgICB9XG4gICAgbGVmdENvbnRleHQgPSBsZWZ0LnNsaWNlKC1jb250ZXh0TGVuZ3RoKTtcbiAgICByaWdodENvbnRleHQgPSByaWdodC5zbGljZSgwLCBjb250ZXh0TGVuZ3RoKTtcbiAgfVxuICBpZiAobGVmdENvbnRleHQgPT09ICcnICYmIHJpZ2h0Q29udGV4dCA9PT0gJycpIHsgcmV0dXJuIGNsb3plOyB9XG4gIHJldHVybiBgJHtsZWZ0Q29udGV4dH1bJHtjbG96ZX1dJHtyaWdodENvbnRleHR9YDtcbn1cblxuZnVuY3Rpb24gaWRlbnRpZnlGaWxsSW5CbGFua3MoYnVuc2V0c3VzOiBNb3JwaGVtZVtdW10pIHtcbiAgLy8gRmluZCBjbG96ZXM6IHBhcnRpY2xlcyBhbmQgY29uanVnYXRlZCB2ZXJiL2FkamVjdGl2ZSBwaHJhc2VzXG4gIGxldCBsaXRlcmFsQ2xvemVzOiBNYXA8c3RyaW5nLCBNb3JwaGVtZVtdPiA9IG5ldyBNYXAoW10pO1xuICBmb3IgKGxldCBbYmlkeCwgYnVuc2V0c3VdIG9mIGVudW1lcmF0ZShidW5zZXRzdXMpKSB7XG4gICAgbGV0IGZpcnN0ID0gYnVuc2V0c3VbMF07XG4gICAgaWYgKCFmaXJzdCkgeyBjb250aW51ZTsgfVxuICAgIGNvbnN0IHBvczAgPSBmaXJzdC5wYXJ0T2ZTcGVlY2hbMF07XG4gICAgbGV0IHNlYXJjaEZvclBhcnRpY2xlcyA9IHRydWU7XG4gICAgaWYgKGJ1bnNldHN1cy5sZW5ndGggPiAxICYmIGJ1bnNldHN1Lmxlbmd0aCA+IDEgJiZcbiAgICAgICAgKHBvczAuc3RhcnRzV2l0aCgndmVyYicpIHx8IHBvczAuZW5kc1dpdGgoJ192ZXJiJykgfHwgcG9zMC5zdGFydHNXaXRoKCdhZGplY3QnKSkpIHtcbiAgICAgIGxldCBpZ25vcmVSaWdodCA9IGZpbHRlclJpZ2h0KGJ1bnNldHN1LCBtID0+ICFnb29kTW9ycGhlbWVQcmVkaWNhdGUobSkpO1xuICAgICAgbGV0IGdvb2RCdW5zZXRzdSA9IGlnbm9yZVJpZ2h0Lmxlbmd0aCA9PT0gMCA/IGJ1bnNldHN1IDogYnVuc2V0c3Uuc2xpY2UoMCwgLWlnbm9yZVJpZ2h0Lmxlbmd0aCk7XG4gICAgICBpZiAoZ29vZEJ1bnNldHN1Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgc2VhcmNoRm9yUGFydGljbGVzID0gZmFsc2U7XG4gICAgICAgIGxldCBjbG96ZSA9IGJ1bnNldHN1VG9TdHJpbmcoZ29vZEJ1bnNldHN1KTtcbiAgICAgICAgbGV0IGxlZnQgPSBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBsZXQgcmlnaHQgPSBidW5zZXRzdVRvU3RyaW5nKGlnbm9yZVJpZ2h0KSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgY2xvemUsIHJpZ2h0KSwgZ29vZEJ1bnNldHN1KTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gb25seSBhZGQgcGFydGljbGVzIGlmIHRoZXkncmUgTk9UIGluc2lkZSBjb25qdWdhdGVkIHBocmFzZXNcbiAgICBjb25zdCBwYXJ0aWNsZVByZWRpY2F0ZSA9IChwOiBNb3JwaGVtZSkgPT4gcC5wYXJ0T2ZTcGVlY2hbMF0uc3RhcnRzV2l0aCgncGFydGljbGUnKSAmJiBwLnBhcnRPZlNwZWVjaC5sZW5ndGggPiAxICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFwLnBhcnRPZlNwZWVjaFsxXS5zdGFydHNXaXRoKCdwaHJhc2VfZmluYWwnKTtcbiAgICBpZiAoc2VhcmNoRm9yUGFydGljbGVzKSB7XG4gICAgICBmb3IgKGxldCBbcGlkeCwgcGFydGljbGVdIG9mIGVudW1lcmF0ZShidW5zZXRzdSkpIHtcbiAgICAgICAgaWYgKHBhcnRpY2xlUHJlZGljYXRlKHBhcnRpY2xlKSkge1xuICAgICAgICAgIGxldCBsZWZ0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKSArIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UoMCwgcGlkeCkpO1xuICAgICAgICAgIGxldCByaWdodCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UocGlkeCArIDEpKSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBwYXJ0aWNsZS5saXRlcmFsLCByaWdodCksIFtwYXJ0aWNsZV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGxldCBleGlzdGluZ0Nsb3plczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KFtdKTtcbiAgbGV0IGJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gIGZvciAobGV0IFtjbG96ZSwgYnVuc2V0c3VdIG9mIGxpdGVyYWxDbG96ZXMpIHtcbiAgICBpZiAoIWV4aXN0aW5nQ2xvemVzLmhhcyhjbG96ZSkpIHtcbiAgICAgIGxldCBhY2NlcHRhYmxlID0gW2Nsb3plXTtcbiAgICAgIGlmIChoYXNLYW5qaShidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1KSkpIHtcbiAgICAgICAgYWNjZXB0YWJsZS5wdXNoKGthdGEyaGlyYShidW5zZXRzdS5tYXAobSA9PiBtLnByb251bmNpYXRpb24pLmpvaW4oJycpKSlcbiAgICAgIH1cbiAgICAgIGJ1bGxldHMucHVzaCgnLSBAZmlsbCAnICsgYWNjZXB0YWJsZS5qb2luKCcgQCAnKSArXG4gICAgICAgICAgICAgICAgICAgYCAgICBAcG9zICR7YnVuc2V0c3UubWFwKG0gPT4gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpKS5qb2luKCcvJyl9YCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBidWxsZXRzO1xufVxuXG5jb25zdCBVU0FHRSA9IGBVU0FHRSAxOlxuJCBub2RlIFt0aGlzLXNjcmlwdC5qc10gW21hcmtkb3duLm1kXVxuXG5VU0FHRSAyOlxuJCBjYXQgW21hcmtkb3duLm1kXSB8IG5vZGUgW3RoaXMtc2NyaXB0LmpzXVxuXG5Cb3RoIHdpbGwgcHJpbnQgYSBwYXJzZWQgdmVyc2lvbiBvZiB0aGUgaW5wdXQuYDtcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xuICBjb25zdCBwcm9taXNpZnkgPSByZXF1aXJlKCd1dGlsJykucHJvbWlzaWZ5O1xuICBjb25zdCByZWFkRmlsZSA9IHByb21pc2lmeShyZXF1aXJlKCdmcycpLnJlYWRGaWxlKTtcbiAgY29uc3QgZ2V0U3RkaW4gPSByZXF1aXJlKCdnZXQtc3RkaW4nKTtcbiAgKGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgIGNvbnN0IHRleHQgPSBwcm9jZXNzLmFyZ3ZbMl0gPyBhd2FpdCByZWFkRmlsZShwcm9jZXNzLmFyZ3ZbMl0sICd1dGY4JykgOiAoKGF3YWl0IGdldFN0ZGluKCkpIHx8IFVTQUdFKTtcbiAgICAvLyBTcGxpdCBNYXJrZG93biBhdCBoZWFkZXIgKGAjIGJsYWJsYWApXG4gICAgbGV0IGJsb2NrcyA9IHNwbGl0QXRIZWFkZXJzKHRleHQpO1xuICAgIC8vIFBhcnNlIGhlYWRlcnNcbiAgICBsZXQgY29udGVudCA9IGF3YWl0IHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrcyk7XG4gICAgLy8gUHJpbnQgcmVzdWx0XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29udGVudC5tYXAodiA9PiB2LmpvaW4oJ1xcbicpKS5qb2luKCdcXG4nKSk7XG4gIH0pKCk7XG59Il19