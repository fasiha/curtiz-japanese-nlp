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
function parseAllHeaderBlocks(blocks, concurrentLimit = 8) {
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
    if (pos.startsWith('verb-general') || pos.startsWith('noun') || pos.startsWith('pronoun') ||
        pos.startsWith('adjectiv') || pos.startsWith('adverb')) {
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
            const hasResponse = responses.length > 0;
            const hasPleaseParse = curtiz_utils_1.takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(PLEASE_PARSE_BLOCK));
            const hasFurigana = curtiz_utils_1.takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(FURIGANA_BLOCK));
            if (!hasResponse || hasPleaseParse || !hasFurigana) {
                const parsed = yield parse(line);
                if (!hasResponse) {
                    responses = [kana_1.kata2hira(curtiz_utils_1.flatten(parsed.bunsetsus)
                            .filter(m => m.partOfSpeech[0] !== 'supplementary_symbol')
                            .map(m => {
                            const hit = seen.get(m.literal);
                            return hit ? hit.reading : morphemeToReading(m);
                        })
                            .join(''))];
                    block[0] = block[0] + ' @ ' + responses[0];
                }
                if (hasPleaseParse) {
                    // add @ vocabulary lines:
                    let flashBullets = [];
                    for (let [midx, morpheme] of curtiz_utils_1.enumerate(parsed.morphemes)) {
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
                const furiganaBullets = block.filter(s => s.startsWith(FURIGANA_BLOCK));
                if (furiganaBullets.length) {
                    const furigana = jmdict_furigana_node_1.stringToFurigana(furiganaBullets[0].slice(FURIGANA_BLOCK.length));
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
    const prompt = (morpheme.partOfSpeech[1] === 'proper') ? morpheme.literal : morpheme.lemma;
    const response = (morpheme.partOfSpeech[1] === 'proper') ? kana_1.kata2hira(morpheme.pronunciation) : kana_1.kata2hira(morpheme.lemmaReading);
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
        if (bunsetsu.length > 1 && (pos0.startsWith('verb') || pos0.endsWith('_verb') || pos0.startsWith('adject'))) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBZ0c7QUFFaEcsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQXNCLEtBQUssQ0FBQyxRQUFnQjs7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxzQkFLQztBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQs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QyxDQUFDO1lBQ2xDLGdCQUFnQjtZQUNoQixJQUFJLE9BQU8sR0FBRyxNQUFNLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELGVBQWU7WUFDZixPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7S0FBQSxDQUFDLEVBQUUsQ0FBQztDQUNOIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IHthZGRKZGVwcH0gZnJvbSAnLi9qZGVwcCc7XG5pbXBvcnQge2thdGEyaGlyYX0gZnJvbSAnLi9rYW5hJztcbmltcG9ydCB7Z29vZE1vcnBoZW1lUHJlZGljYXRlLCBpbnZva2VNZWNhYiwgbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcywgTW9ycGhlbWUsIHBhcnNlTWVjYWJ9IGZyb20gJy4vbWVjYWJVbmlkaWMnO1xuaW1wb3J0IHtlbnVtZXJhdGUsIGZpbHRlclJpZ2h0LCBmbGF0dGVuLCBoYXNLYW5qaSwgcGFydGl0aW9uQnksIHRha2VXaGlsZX0gZnJvbSAnY3VydGl6LXV0aWxzJztcbmltcG9ydCB7RW50cnksIGZ1cmlnYW5hVG9TdHJpbmcsIEZ1cmlnYW5hLCBzZXR1cCwgc3RyaW5nVG9GdXJpZ2FuYX0gZnJvbSAnam1kaWN0LWZ1cmlnYW5hLW5vZGUnO1xuXG5jb25zdCBKbWRpY3RGdXJpZ2FuYSA9IHNldHVwKCk7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZShzZW50ZW5jZTogc3RyaW5nKTogUHJvbWlzZTx7bW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTt9PiB7XG4gIGxldCByYXdNZWNhYiA9IGF3YWl0IGludm9rZU1lY2FiKHNlbnRlbmNlKTtcbiAgbGV0IG1vcnBoZW1lcyA9IG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMocGFyc2VNZWNhYihzZW50ZW5jZSwgcmF3TWVjYWIpWzBdLmZpbHRlcihvID0+ICEhbykpO1xuICBsZXQgYnVuc2V0c3VzID0gYXdhaXQgYWRkSmRlcHAocmF3TWVjYWIsIG1vcnBoZW1lcyk7XG4gIHJldHVybiB7bW9ycGhlbWVzLCBidW5zZXRzdXN9O1xufVxuXG5jb25zdCBidW5zZXRzdVRvU3RyaW5nID0gKG1vcnBoZW1lczogTW9ycGhlbWVbXSkgPT4gbW9ycGhlbWVzLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdEF0SGVhZGVycyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXVtdIHtcbiAgY29uc3QgaGVhZGVyUmUgPSAvXiMrXFxzKy4rJC87XG4gIHJldHVybiBwYXJ0aXRpb25CeSh0ZXh0LnNwbGl0KCdcXG4nKSwgcyA9PiBoZWFkZXJSZS50ZXN0KHMpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrczogc3RyaW5nW11bXSwgY29uY3VycmVudExpbWl0OiBudW1iZXIgPSA4KSB7XG4gIGxldCByZXQ6IHN0cmluZ1tdW10gPSBbXTtcbiAgbGV0IHByb21pc2VzOiBQcm9taXNlPHN0cmluZ1tdPltdID0gW107XG4gIGNvbnN0IHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IG8gb2YgYmxvY2tzKSB7XG4gICAgaWYgKHByb21pc2VzLmxlbmd0aCA+PSBjb25jdXJyZW50TGltaXQpIHtcbiAgICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICAgICAgcHJvbWlzZXMgPSBbXTtcbiAgICB9XG4gICAgcHJvbWlzZXMucHVzaChwYXJzZUhlYWRlckJsb2NrKG8sIHNlZW4pKTtcbiAgfVxuICBpZiAocHJvbWlzZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgfVxuICByZXR1cm4gcmV0O1xufVxuXG5jb25zdCBQTEVBU0VfUEFSU0VfQkxPQ0sgPSAnLSBAcGxlYXNlUGFyc2UnO1xuY29uc3QgRlVSSUdBTkFfQkxPQ0sgPSAnLSBAZnVyaWdhbmEnO1xuXG5jb25zdCBmbGFzaGFibGVNb3JwaGVtZSA9IChtOiBNb3JwaGVtZSkgPT4ge1xuICBjb25zdCBwb3MgPSBtLnBhcnRPZlNwZWVjaC5qb2luKCctJyk7XG4gIGlmIChoYXNLYW5qaShtLmxpdGVyYWwpICYmICFwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAocG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIGZhbHNlOyB9XG4gIGlmIChwb3Muc3RhcnRzV2l0aCgndmVyYi1nZW5lcmFsJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ25vdW4nKSB8fCBwb3Muc3RhcnRzV2l0aCgncHJvbm91bicpIHx8XG4gICAgICBwb3Muc3RhcnRzV2l0aCgnYWRqZWN0aXYnKSB8fCBwb3Muc3RhcnRzV2l0aCgnYWR2ZXJiJykpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuZnVuY3Rpb24gbW9ycGhlbWVUb1JlYWRpbmcobTogTW9ycGhlbWUpIHtcbiAgcmV0dXJuIGhhc0thbmppKG0ubGl0ZXJhbCkgPyBrYXRhMmhpcmEobS5saXRlcmFsID09PSBtLmxlbW1hID8gbS5sZW1tYVJlYWRpbmcgOiBtLnByb251bmNpYXRpb24pIDogbS5saXRlcmFsO1xufVxudHlwZSBQYXJzZWQgPSB7XG4gIG1vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107XG59O1xudHlwZSBTZWVuID0ge1xuICBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdOyByZWFkaW5nOiBzdHJpbmc7XG59O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlSGVhZGVyQmxvY2soYmxvY2s6IHN0cmluZ1tdLCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPiA9IG5ldyBNYXAoW10pKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBjb25zdCBhdEhlYWRlclJlID0gL14jK1xccytAXFxzKy87XG4gIGNvbnN0IG1hdGNoID0gYmxvY2tbMF0ubWF0Y2goYXRIZWFkZXJSZSk7XG4gIGlmIChtYXRjaCkge1xuICAgIGNvbnN0IGxpbmUgPSBibG9ja1swXS5zbGljZShtYXRjaFswXS5sZW5ndGgpOyAvLyBtaW51cyB0aGUgZmlyc3QgQFxuXG4gICAgbGV0IFtwcm9tcHQsIC4uLnJlc3BvbnNlc10gPSBsaW5lLnNwbGl0KCdAJykubWFwKHMgPT4gcy50cmltKCkpO1xuICAgIGNvbnN0IHByZWZpeDogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIHByb2Nlc3MgbGluZSBhbmQgYmxvY2suXG4gICAgY29uc3QgaGFzUmVzcG9uc2UgPSByZXNwb25zZXMubGVuZ3RoID4gMDtcbiAgICBjb25zdCBoYXNQbGVhc2VQYXJzZSA9XG4gICAgICAgIHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgIGNvbnN0IGhhc0Z1cmlnYW5hID0gdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICBpZiAoIWhhc1Jlc3BvbnNlIHx8IGhhc1BsZWFzZVBhcnNlIHx8ICFoYXNGdXJpZ2FuYSkge1xuICAgICAgY29uc3QgcGFyc2VkOiBQYXJzZWQgPSBhd2FpdCBwYXJzZShsaW5lKTtcbiAgICAgIGlmICghaGFzUmVzcG9uc2UpIHtcbiAgICAgICAgcmVzcG9uc2VzID0gW2thdGEyaGlyYShmbGF0dGVuKHBhcnNlZC5idW5zZXRzdXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIobSA9PiBtLnBhcnRPZlNwZWVjaFswXSAhPT0gJ3N1cHBsZW1lbnRhcnlfc3ltYm9sJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChtID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChtLmxpdGVyYWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBoaXQgPyBoaXQucmVhZGluZyA6IG1vcnBoZW1lVG9SZWFkaW5nKG0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbignJykpXTtcbiAgICAgICAgYmxvY2tbMF0gPSBibG9ja1swXSArICcgQCAnICsgcmVzcG9uc2VzWzBdO1xuICAgICAgfVxuICAgICAgaWYgKGhhc1BsZWFzZVBhcnNlKSB7XG4gICAgICAgIC8vIGFkZCBAIHZvY2FidWxhcnkgbGluZXM6XG4gICAgICAgIGxldCBmbGFzaEJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAobGV0IFttaWR4LCBtb3JwaGVtZV0gb2YgZW51bWVyYXRlKHBhcnNlZC5tb3JwaGVtZXMpKSB7XG4gICAgICAgICAgaWYgKGZsYXNoYWJsZU1vcnBoZW1lKG1vcnBoZW1lKSkge1xuICAgICAgICAgICAgbGV0IHtwcm9tcHQ6IG1wcm9tcHQsIHJlc3BvbnNlOiBtcmVzcG9uc2V9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG1vcnBoZW1lKTtcblxuICAgICAgICAgICAgbGV0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBbXTtcbiAgICAgICAgICAgIGlmIChoYXNLYW5qaShtcHJvbXB0KSkgeyBmdXJpZ2FuYSA9IGF3YWl0IHZvY2FiVG9GdXJpZ2FuYShbbW9ycGhlbWVdKTsgfVxuXG4gICAgICAgICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChtcHJvbXB0KTtcbiAgICAgICAgICAgIGlmICghaGl0KSB7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKG1hdGNoWzBdICsgYCR7bXByb21wdH0gQCAke21yZXNwb25zZX1gKTtcbiAgICAgICAgICAgICAgcHJlZml4LnB1c2goRlVSSUdBTkFfQkxPQ0sgKyAnICcgKyBmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJykpO1xuICAgICAgICAgICAgICBzZWVuLnNldChtcHJvbXB0LCB7ZnVyaWdhbmEsIHJlYWRpbmc6IG1yZXNwb25zZX0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbXJlc3BvbnNlID0gaGl0LnJlYWRpbmc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGxlZnQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKDAsIG1pZHgpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UobWlkeCArIDEpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBsZXQgY2xvemUgPSBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgbW9ycGhlbWUubGl0ZXJhbCwgcmlnaHQpO1xuICAgICAgICAgICAgbGV0IGZpbmFsID0gJyc7XG4gICAgICAgICAgICBpZiAobXByb21wdCA9PT0gbW9ycGhlbWUubGl0ZXJhbCAmJiBhcHBlYXJzRXhhY3RseU9uY2UocHJvbXB0LCBtb3JwaGVtZS5saXRlcmFsKSkge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfSBAb21pdCAke2Nsb3plfWA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZsYXNoQnVsbGV0cy5wdXNoKGZpbmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmZsYXNoQnVsbGV0cyk7XG5cbiAgICAgICAgLy8gYWRkIEBmaWxsIGxpbmVzXG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5pZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIEBwbGVhc2VQYXJzZVxuICAgICAgICBibG9jayA9IGJsb2NrLmZpbHRlcihzID0+ICFzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgICB9XG4gICAgICBpZiAoIWhhc0Z1cmlnYW5hKSB7XG4gICAgICAgIGlmIChoYXNLYW5qaShwcm9tcHQpKSB7XG4gICAgICAgICAgLy8gYWRkIGZ1cmlnYW5hIGxpbmVcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IGF3YWl0IHBhcnNlZFRvRnVyaWdhbmEocGFyc2VkLm1vcnBoZW1lcywgc2Vlbik7XG4gICAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIGAke0ZVUklHQU5BX0JMT0NLfSAke2Z1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKX1gKTtcbiAgICAgICAgICBzZWVuLnNldChwcm9tcHQsIHtmdXJpZ2FuYSwgcmVhZGluZzogcmVzcG9uc2VzWzBdfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtbcmVzcG9uc2VzWzBdXV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYUJ1bGxldHMgPSBibG9jay5maWx0ZXIocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICAgICAgaWYgKGZ1cmlnYW5hQnVsbGV0cy5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IHN0cmluZ1RvRnVyaWdhbmEoZnVyaWdhbmFCdWxsZXRzWzBdLnNsaWNlKEZVUklHQU5BX0JMT0NLLmxlbmd0aCkpXG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtmdXJpZ2FuYV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZJWE1FIERSWSBzYW1lIGFzIGFib3ZlXG4gICAgICBjb25zdCBmdXJpZ2FuYUJ1bGxldHMgPSBibG9jay5maWx0ZXIocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICAgIGlmIChmdXJpZ2FuYUJ1bGxldHMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hID0gc3RyaW5nVG9GdXJpZ2FuYShmdXJpZ2FuYUJ1bGxldHNbMF0uc2xpY2UoRlVSSUdBTkFfQkxPQ0subGVuZ3RoKSlcbiAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtmdXJpZ2FuYV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgfVxuICAgIH1cbiAgICBibG9jayA9IHByZWZpeC5jb25jYXQoYmxvY2spO1xuICB9XG4gIHJldHVybiBibG9jaztcbn1cblxuZnVuY3Rpb24gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG1vcnBoZW1lOiBNb3JwaGVtZSkge1xuICBjb25zdCBwcm9tcHQgPSAobW9ycGhlbWUucGFydE9mU3BlZWNoWzFdID09PSAncHJvcGVyJykgPyBtb3JwaGVtZS5saXRlcmFsIDogbW9ycGhlbWUubGVtbWE7XG4gIGNvbnN0IHJlc3BvbnNlID1cbiAgICAgIChtb3JwaGVtZS5wYXJ0T2ZTcGVlY2hbMV0gPT09ICdwcm9wZXInKSA/IGthdGEyaGlyYShtb3JwaGVtZS5wcm9udW5jaWF0aW9uKSA6IGthdGEyaGlyYShtb3JwaGVtZS5sZW1tYVJlYWRpbmcpO1xuICByZXR1cm4ge3Byb21wdCwgcmVzcG9uc2V9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB2b2NhYlRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgcmV0dXJuIFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge3Byb21wdDogbGVtbWEsIHJlc3BvbnNlOiBsZW1tYVJlYWRpbmd9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG0pO1xuICAgIGlmIChoYXNLYW5qaShsZW1tYSkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHsgcmV0dXJuIGxlbW1hSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGVtbWEpID8ge3J1Ynk6IGxlbW1hLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGVtbWFdO1xuICB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlZFRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdLCBzZWVuOiBNYXA8c3RyaW5nLCBTZWVuPik6IFByb21pc2U8RnVyaWdhbmFbXVtdPiB7XG4gIGNvbnN0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBhd2FpdCBQcm9taXNlLmFsbChtb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgIGNvbnN0IHtsZW1tYSwgbGVtbWFSZWFkaW5nLCBsaXRlcmFsLCBwcm9udW5jaWF0aW9ufSA9IG07XG4gICAgaWYgKGhhc0thbmppKGxpdGVyYWwpKSB7XG4gICAgICBjb25zdCBoaXQgPSBzZWVuLmdldChsaXRlcmFsKTtcbiAgICAgIGlmIChoaXQpIHsgcmV0dXJuIGZsYXR0ZW4oaGl0LmZ1cmlnYW5hKSB8fCBbXTsgfVxuXG4gICAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICBjb25zdCBsaXRlcmFsSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsaXRlcmFsLCAncmVhZGluZycsIHByb251bmNpYXRpb24pO1xuICAgICAgaWYgKGxpdGVyYWxIaXQpIHsgcmV0dXJuIGxpdGVyYWxIaXQuZnVyaWdhbmE7IH1cbiAgICAgIGNvbnN0IHByb251bmNpYXRpb25IaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIHByb251bmNpYXRpb24sICd0ZXh0JywgbGl0ZXJhbCk7XG4gICAgICBpZiAocHJvbnVuY2lhdGlvbkhpdCkgeyByZXR1cm4gcHJvbnVuY2lhdGlvbkhpdC5mdXJpZ2FuYTsgfVxuXG4gICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYURpY3Q6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3QgZiBvZiBsZW1tYUhpdC5mdXJpZ2FuYSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBmdXJpZ2FuYURpY3Quc2V0KGYucnVieSwgZi5ydCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgICBsZXQga2FuamkgPSBjaGFycy5maWx0ZXIoaGFzS2FuamkpO1xuICAgICAgICBjb25zdCBhbm5vdGF0ZWRDaGFyczogRnVyaWdhbmFbXSA9IGNoYXJzLnNsaWNlKCk7XG5cbiAgICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICAgIHdoaWxlIChrYW5qaS5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBoaXQgPSB0cml1KGthbmppKS5maW5kKGtzID0+IGZ1cmlnYW5hRGljdC5oYXMoa3Muam9pbignJykpKTtcbiAgICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgICBjb25zdCBoaXRzdHIgPSBoaXQuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBsaXRlcmFsLmluZGV4T2YoaGl0c3RyKTtcbiAgICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaWR4ICsgMTsgaSA8IGlkeCArIGhpdHN0ci5sZW5ndGg7IGkrKykgeyBhbm5vdGF0ZWRDaGFyc1tpXSA9ICcnOyB9XG4gICAgICAgICAgICBrYW5qaSA9IGthbmppLnNsaWNlKGhpdHN0ci5sZW5ndGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhbm5vdGF0ZWRDaGFycztcbiAgICAgIH1cbiAgICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAgIC8vIGlmIChsZW1tYVJlYWRpbmdIaXQpIHsgcmV0dXJuIGxlbW1hUmVhZGluZ0hpdC5mdXJpZ2FuYTsgfVxuICAgIH1cbiAgICByZXR1cm4gW2hhc0thbmppKGxpdGVyYWwpID8ge3J1Ynk6IGxpdGVyYWwsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsaXRlcmFsXTtcbiAgfSkpO1xuXG4gIHJldHVybiBmdXJpZ2FuYTtcbn1cblxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIHNlYXJjaChtYXA6IE1hcDxzdHJpbmcsIEVudHJ5W10+LCBmaXJzdDogc3RyaW5nLCBzdWI6ICdyZWFkaW5nJ3wndGV4dCcsIHNlY29uZDogc3RyaW5nKTogRW50cnl8dW5kZWZpbmVkIHtcbiAgY29uc3QgaGl0ID0gbWFwLmdldChmaXJzdCk7XG4gIGlmIChoaXQpIHtcbiAgICBpZiAoaGl0Lmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gaGl0WzBdOyB9XG4gICAgY29uc3Qgc3ViaGl0ID0gaGl0LmZpbmQoZSA9PiBrYXRhMmhpcmEoZVtzdWJdKSA9PT0ga2F0YTJoaXJhKHNlY29uZCkpO1xuICAgIGlmIChzdWJoaXQpIHsgcmV0dXJuIHN1YmhpdDsgfVxuICAgIGNvbnNvbGUuZXJyb3IoYGZvdW5kIGhpdCBmb3IgJHtmaXJzdH0gYnV0IG5vdCAke3NlY29uZH1gLCB7aGl0fSk7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbmVlZGxlIGlzIGZvdW5kIGluIGhheXN0YWNrIG9ubHkgb25jZVxuICogQHBhcmFtIGhheXN0YWNrIGJpZyBzdHJpbmdcbiAqIEBwYXJhbSBuZWVkbGUgbGl0dGxlIHN0cmluZ1xuICovXG5mdW5jdGlvbiBhcHBlYXJzRXhhY3RseU9uY2UoaGF5c3RhY2s6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgbGV0IGhpdDogbnVtYmVyO1xuICByZXR1cm4gKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlKSkgPj0gMCAmJiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGhpdCArIDEpKSA8IDA7XG59XG4vKipcbiAqIEdpdmVuIHRocmVlIGNvbnNlY3V0aWVzIHN1YnN0cmluZ3MgKHRoZSBhcmd1bWVudHMpLCByZXR1cm4gZWl0aGVyXG4gKiAtIGAke2xlZnQyfVske2Nsb3plfV0ke3JpZ2h0Mn1gIHdoZXJlIGBsZWZ0MmAgYW5kIGByaWdodDJgIGFyZSBhcyBzaG9ydCBhcyBwb3NzaWJsZSAoYW5kIG9mIGVxdWFsIGxlbmd0aCwgaWZcbiAqICAgIHBvc3NpYmxlKSBzbyB0aGUgdGhpcyByZXR1cm4gc3RyaW5nIChtaW51cyB0aGUgYnJhY2tldHMpIGlzIHVuaXF1ZSBpbiB0aGUgZnVsbCBzdHJpbmcsIG9yXG4gKiAtIGAke2Nsb3plfWAgaWYgYGxlZnQyID09PSByaWdodDIgPT09ICcnYCAoaS5lLiwgdGhlIGFib3ZlIGJ1dCB3aXRob3V0IHRoZSBicmFja2V0cykuXG4gKiBAcGFyYW0gbGVmdCBsZWZ0IHN0cmluZywgcG9zc2libHkgZW1wdHlcbiAqIEBwYXJhbSBjbG96ZSBtaWRkbGUgc3RyaW5nXG4gKiBAcGFyYW0gcmlnaHQgcmlnaHQgc3RyaW5nLCBwb3NzaWJsZSBlbXB0eVxuICogQHRocm93cyBpbiB0aGUgdW5saWtlbHkgZXZlbnQgdGhhdCBzdWNoIGEgcmV0dXJuIHN0cmluZyBjYW5ub3QgYmUgYnVpbGQgKEkgY2Fubm90IHRoaW5rIG9mIGFuIGV4YW1wbGUgdGhvdWdoKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdDogc3RyaW5nLCBjbG96ZTogc3RyaW5nLCByaWdodDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VudGVuY2UgPSBsZWZ0ICsgY2xvemUgKyByaWdodDtcbiAgbGV0IGxlZnRDb250ZXh0ID0gJyc7XG4gIGxldCByaWdodENvbnRleHQgPSAnJztcbiAgbGV0IGNvbnRleHRMZW5ndGggPSAwO1xuICB3aGlsZSAoIWFwcGVhcnNFeGFjdGx5T25jZShzZW50ZW5jZSwgbGVmdENvbnRleHQgKyBjbG96ZSArIHJpZ2h0Q29udGV4dCkpIHtcbiAgICBjb250ZXh0TGVuZ3RoKys7XG4gICAgaWYgKGNvbnRleHRMZW5ndGggPj0gbGVmdC5sZW5ndGggJiYgY29udGV4dExlbmd0aCA+PSByaWdodC5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmFuIG91dCBvZiBjb250ZXh0IHRvIGJ1aWxkIHVuaXF1ZSBjbG96ZScpO1xuICAgIH1cbiAgICBsZWZ0Q29udGV4dCA9IGxlZnQuc2xpY2UoLWNvbnRleHRMZW5ndGgpO1xuICAgIHJpZ2h0Q29udGV4dCA9IHJpZ2h0LnNsaWNlKDAsIGNvbnRleHRMZW5ndGgpO1xuICB9XG4gIGlmIChsZWZ0Q29udGV4dCA9PT0gJycgJiYgcmlnaHRDb250ZXh0ID09PSAnJykgeyByZXR1cm4gY2xvemU7IH1cbiAgcmV0dXJuIGAke2xlZnRDb250ZXh0fVske2Nsb3plfV0ke3JpZ2h0Q29udGV4dH1gO1xufVxuXG5mdW5jdGlvbiBpZGVudGlmeUZpbGxJbkJsYW5rcyhidW5zZXRzdXM6IE1vcnBoZW1lW11bXSkge1xuICAvLyBGaW5kIGNsb3plczogcGFydGljbGVzIGFuZCBjb25qdWdhdGVkIHZlcmIvYWRqZWN0aXZlIHBocmFzZXNcbiAgbGV0IGxpdGVyYWxDbG96ZXM6IE1hcDxzdHJpbmcsIE1vcnBoZW1lW10+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IFtiaWR4LCBidW5zZXRzdV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1cykpIHtcbiAgICBsZXQgZmlyc3QgPSBidW5zZXRzdVswXTtcbiAgICBpZiAoIWZpcnN0KSB7IGNvbnRpbnVlOyB9XG4gICAgY29uc3QgcG9zMCA9IGZpcnN0LnBhcnRPZlNwZWVjaFswXTtcbiAgICBsZXQgc2VhcmNoRm9yUGFydGljbGVzID0gdHJ1ZTtcbiAgICBpZiAoYnVuc2V0c3UubGVuZ3RoID4gMSAmJiAocG9zMC5zdGFydHNXaXRoKCd2ZXJiJykgfHwgcG9zMC5lbmRzV2l0aCgnX3ZlcmInKSB8fCBwb3MwLnN0YXJ0c1dpdGgoJ2FkamVjdCcpKSkge1xuICAgICAgbGV0IGlnbm9yZVJpZ2h0ID0gZmlsdGVyUmlnaHQoYnVuc2V0c3UsIG0gPT4gIWdvb2RNb3JwaGVtZVByZWRpY2F0ZShtKSk7XG4gICAgICBsZXQgZ29vZEJ1bnNldHN1ID0gaWdub3JlUmlnaHQubGVuZ3RoID09PSAwID8gYnVuc2V0c3UgOiBidW5zZXRzdS5zbGljZSgwLCAtaWdub3JlUmlnaHQubGVuZ3RoKTtcbiAgICAgIGlmIChnb29kQnVuc2V0c3UubGVuZ3RoID4gMSkge1xuICAgICAgICBzZWFyY2hGb3JQYXJ0aWNsZXMgPSBmYWxzZTtcbiAgICAgICAgbGV0IGNsb3plID0gYnVuc2V0c3VUb1N0cmluZyhnb29kQnVuc2V0c3UpO1xuICAgICAgICBsZXQgbGVmdCA9IGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxldCByaWdodCA9IGJ1bnNldHN1VG9TdHJpbmcoaWdub3JlUmlnaHQpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBjbG96ZSwgcmlnaHQpLCBnb29kQnVuc2V0c3UpO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBvbmx5IGFkZCBwYXJ0aWNsZXMgaWYgdGhleSdyZSBOT1QgaW5zaWRlIGNvbmp1Z2F0ZWQgcGhyYXNlc1xuICAgIGNvbnN0IHBhcnRpY2xlUHJlZGljYXRlID0gKHA6IE1vcnBoZW1lKSA9PiBwLnBhcnRPZlNwZWVjaFswXS5zdGFydHNXaXRoKCdwYXJ0aWNsZScpICYmIHAucGFydE9mU3BlZWNoLmxlbmd0aCA+IDEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXAucGFydE9mU3BlZWNoWzFdLnN0YXJ0c1dpdGgoJ3BocmFzZV9maW5hbCcpO1xuICAgIGlmIChzZWFyY2hGb3JQYXJ0aWNsZXMpIHtcbiAgICAgIGZvciAobGV0IFtwaWR4LCBwYXJ0aWNsZV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1KSkge1xuICAgICAgICBpZiAocGFydGljbGVQcmVkaWNhdGUocGFydGljbGUpKSB7XG4gICAgICAgICAgbGV0IGxlZnQgPVxuICAgICAgICAgICAgICBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpICsgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZSgwLCBwaWR4KSk7XG4gICAgICAgICAgbGV0IHJpZ2h0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZShwaWR4ICsgMSkpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIHBhcnRpY2xlLmxpdGVyYWwsIHJpZ2h0KSwgW3BhcnRpY2xlXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgbGV0IGV4aXN0aW5nQ2xvemVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW10pO1xuICBsZXQgYnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgW2Nsb3plLCBidW5zZXRzdV0gb2YgbGl0ZXJhbENsb3plcykge1xuICAgIGlmICghZXhpc3RpbmdDbG96ZXMuaGFzKGNsb3plKSkge1xuICAgICAgbGV0IGFjY2VwdGFibGUgPSBbY2xvemVdO1xuICAgICAgaWYgKGhhc0thbmppKGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3UpKSkge1xuICAgICAgICBhY2NlcHRhYmxlLnB1c2goa2F0YTJoaXJhKGJ1bnNldHN1Lm1hcChtID0+IG0ucHJvbnVuY2lhdGlvbikuam9pbignJykpKVxuICAgICAgfVxuICAgICAgYnVsbGV0cy5wdXNoKCctIEBmaWxsICcgKyBhY2NlcHRhYmxlLmpvaW4oJyBAICcpICtcbiAgICAgICAgICAgICAgICAgICBgICAgIEBwb3MgJHtidW5zZXRzdS5tYXAobSA9PiBtLnBhcnRPZlNwZWVjaC5qb2luKCctJykpLmpvaW4oJy8nKX1gKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ1bGxldHM7XG59XG5cbmNvbnN0IFVTQUdFID0gYFVTQUdFIDE6XG4kIG5vZGUgW3RoaXMtc2NyaXB0LmpzXSBbbWFya2Rvd24ubWRdXG5cblVTQUdFIDI6XG4kIGNhdCBbbWFya2Rvd24ubWRdIHwgbm9kZSBbdGhpcy1zY3JpcHQuanNdXG5cbkJvdGggd2lsbCBwcmludCBhIHBhcnNlZCB2ZXJzaW9uIG9mIHRoZSBpbnB1dC5gO1xuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IHJlYWRGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2ZzJykucmVhZEZpbGUpO1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgY29uc3QgdGV4dCA9IHByb2Nlc3MuYXJndlsyXSA/IGF3YWl0IHJlYWRGaWxlKHByb2Nlc3MuYXJndlsyXSwgJ3V0ZjgnKSA6ICgoYXdhaXQgZ2V0U3RkaW4oKSkgfHwgVVNBR0UpO1xuICAgIC8vIFNwbGl0IE1hcmtkb3duIGF0IGhlYWRlciAoYCMgYmxhYmxhYClcbiAgICBsZXQgYmxvY2tzID0gc3BsaXRBdEhlYWRlcnModGV4dCk7XG4gICAgLy8gUGFyc2UgaGVhZGVyc1xuICAgIGxldCBjb250ZW50ID0gYXdhaXQgcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzKTtcbiAgICAvLyBQcmludCByZXN1bHRcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb250ZW50Lm1hcCh2ID0+IHYuam9pbignXFxuJykpLmpvaW4oJ1xcbicpKTtcbiAgfSkoKTtcbn0iXX0=