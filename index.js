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
        for (let o of blocks) {
            if (promises.length >= concurrentLimit) {
                const thisRet = yield Promise.all(promises);
                for (const o of thisRet) {
                    ret.push(o);
                }
                promises = [];
            }
            promises.push(parseHeaderBlock(o));
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
function parseHeaderBlock(block) {
    return __awaiter(this, void 0, void 0, function* () {
        const atHeaderRe = /^#+\s+@\s+/;
        const match = block[0].match(atHeaderRe);
        if (match) {
            const line = block[0].slice(match[0].length);
            let [prompt, response] = line.split('@').map(s => s.trim());
            // process line and block.
            const hasResponse = !!response;
            const hasPleaseParse = curtiz_utils_1.takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(PLEASE_PARSE_BLOCK));
            const hasFurigana = curtiz_utils_1.takeWhile(block.slice(1), s => s.startsWith('- @')).some(s => s.startsWith(FURIGANA_BLOCK));
            if (!hasResponse || hasPleaseParse || !hasFurigana) {
                const parsed = yield parse(line);
                if (!hasResponse) {
                    response = kana_1.kata2hira(curtiz_utils_1.flatten(parsed.bunsetsus)
                        .filter(m => m.partOfSpeech[0] !== 'supplementary_symbol')
                        .map(morphemeToReading)
                        .join(''));
                    block[0] = block[0] + ' @ ' + response;
                }
                if (hasPleaseParse) {
                    // add @flash lines
                    let flashBullets = [];
                    for (let [midx, morpheme] of curtiz_utils_1.enumerate(parsed.morphemes)) {
                        if (flashableMorpheme(morpheme)) {
                            const { prompt: mprompt, response: mresponse } = morphemeToPromptResponse(morpheme);
                            const left = parsed.morphemes.slice(0, midx).map(m => m.literal).join('');
                            const right = parsed.morphemes.slice(midx + 1).map(m => m.literal).join('');
                            let cloze = generateContextClozed(left, morpheme.literal, right);
                            let final = '';
                            if (mprompt === morpheme.literal && appearsExactlyOnce(prompt, morpheme.literal)) {
                                final = `- @ ${mprompt} @ ${mresponse}    @pos ${morpheme.partOfSpeech.join('-')}`;
                            }
                            else {
                                final = `- @ ${mprompt} @ ${mresponse}    @pos ${morpheme.partOfSpeech.join('-')} @omit ${cloze}`;
                            }
                            if (curtiz_utils_1.hasKanji(mprompt)) {
                                const furigana = yield vocabToFurigana([morpheme]);
                                final += ` @furigana ${furigana.map(jmdict_furigana_node_1.furiganaToString).join('')}`;
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
                if (!hasFurigana && curtiz_utils_1.hasKanji(prompt)) {
                    // add furigana line
                    const furigana = yield parsedToFurigana(parsed.morphemes);
                    block.splice(1, 0, `${FURIGANA_BLOCK} ${furigana.map(jmdict_furigana_node_1.furiganaToString).join('')}`);
                }
            }
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
function parsedToFurigana(morphemes) {
    return __awaiter(this, void 0, void 0, function* () {
        const furigana = yield Promise.all(morphemes.map((m) => __awaiter(this, void 0, void 0, function* () {
            const { lemma, lemmaReading, literal, pronunciation } = m;
            if (curtiz_utils_1.hasKanji(literal)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBOEU7QUFFOUUsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQWUsS0FBSyxDQUFDLFFBQWdCOztRQUNuQyxJQUFJLFFBQVEsR0FBRyxNQUFNLHlCQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxTQUFTLEdBQUcsdUNBQXlCLENBQUMsd0JBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxTQUFTLEdBQUcsTUFBTSxnQkFBUSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBQyxDQUFDO0lBQ2hDLENBQUM7Q0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQsU0FBc0Isb0JBQW9C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Q0FBQztZQUNqRCxlQUFlO1lBQ2YsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNsRSxDQUFDO0tBQUEsQ0FBQyxFQUFFLENBQUM7Q0FDTiIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCB7YWRkSmRlcHB9IGZyb20gJy4vamRlcHAnO1xuaW1wb3J0IHtrYXRhMmhpcmF9IGZyb20gJy4va2FuYSc7XG5pbXBvcnQge2dvb2RNb3JwaGVtZVByZWRpY2F0ZSwgaW52b2tlTWVjYWIsIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMsIE1vcnBoZW1lLCBwYXJzZU1lY2FifSBmcm9tICcuL21lY2FiVW5pZGljJztcbmltcG9ydCB7ZW51bWVyYXRlLCBmaWx0ZXJSaWdodCwgZmxhdHRlbiwgaGFzS2FuamksIHBhcnRpdGlvbkJ5LCB0YWtlV2hpbGV9IGZyb20gJ2N1cnRpei11dGlscyc7XG5pbXBvcnQge0VudHJ5LCBmdXJpZ2FuYVRvU3RyaW5nLCBGdXJpZ2FuYSwgc2V0dXB9IGZyb20gJ2ptZGljdC1mdXJpZ2FuYS1ub2RlJztcblxuY29uc3QgSm1kaWN0RnVyaWdhbmEgPSBzZXR1cCgpO1xuXG5hc3luYyBmdW5jdGlvbiBwYXJzZShzZW50ZW5jZTogc3RyaW5nKTogUHJvbWlzZTx7bW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTt9PiB7XG4gIGxldCByYXdNZWNhYiA9IGF3YWl0IGludm9rZU1lY2FiKHNlbnRlbmNlKTtcbiAgbGV0IG1vcnBoZW1lcyA9IG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMocGFyc2VNZWNhYihzZW50ZW5jZSwgcmF3TWVjYWIpWzBdLmZpbHRlcihvID0+ICEhbykpO1xuICBsZXQgYnVuc2V0c3VzID0gYXdhaXQgYWRkSmRlcHAocmF3TWVjYWIsIG1vcnBoZW1lcyk7XG4gIHJldHVybiB7bW9ycGhlbWVzLCBidW5zZXRzdXN9O1xufVxuXG5jb25zdCBidW5zZXRzdVRvU3RyaW5nID0gKG1vcnBoZW1lczogTW9ycGhlbWVbXSkgPT4gbW9ycGhlbWVzLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBzcGxpdEF0SGVhZGVycyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXVtdIHtcbiAgY29uc3QgaGVhZGVyUmUgPSAvXiMrXFxzKy4rJC87XG4gIHJldHVybiBwYXJ0aXRpb25CeSh0ZXh0LnNwbGl0KCdcXG4nKSwgcyA9PiBoZWFkZXJSZS50ZXN0KHMpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrczogc3RyaW5nW11bXSwgY29uY3VycmVudExpbWl0OiBudW1iZXIgPSA4KSB7XG4gIGxldCByZXQ6IHN0cmluZ1tdW10gPSBbXTtcbiAgbGV0IHByb21pc2VzOiBQcm9taXNlPHN0cmluZ1tdPltdID0gW107XG4gIGZvciAobGV0IG8gb2YgYmxvY2tzKSB7XG4gICAgaWYgKHByb21pc2VzLmxlbmd0aCA+PSBjb25jdXJyZW50TGltaXQpIHtcbiAgICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICAgICAgcHJvbWlzZXMgPSBbXTtcbiAgICB9XG4gICAgcHJvbWlzZXMucHVzaChwYXJzZUhlYWRlckJsb2NrKG8pKTtcbiAgfVxuICBpZiAocHJvbWlzZXMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IHRoaXNSZXQgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgfVxuICByZXR1cm4gcmV0O1xufVxuXG5jb25zdCBQTEVBU0VfUEFSU0VfQkxPQ0sgPSAnLSBAcGxlYXNlUGFyc2UnO1xuY29uc3QgRlVSSUdBTkFfQkxPQ0sgPSAnLSBAZnVyaWdhbmEnO1xuXG5jb25zdCBmbGFzaGFibGVNb3JwaGVtZSA9IChtOiBNb3JwaGVtZSkgPT4ge1xuICBjb25zdCBwb3MgPSBtLnBhcnRPZlNwZWVjaC5qb2luKCctJyk7XG4gIGlmIChoYXNLYW5qaShtLmxpdGVyYWwpICYmICFwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gdHJ1ZTsgfVxuICBpZiAocG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIGZhbHNlOyB9XG4gIGlmIChwb3Muc3RhcnRzV2l0aCgndmVyYi1nZW5lcmFsJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ25vdW4nKSB8fCBwb3Muc3RhcnRzV2l0aCgncHJvbm91bicpIHx8XG4gICAgICBwb3Muc3RhcnRzV2l0aCgnYWRqZWN0aXYnKSB8fCBwb3Muc3RhcnRzV2l0aCgnYWR2ZXJiJykpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuZnVuY3Rpb24gbW9ycGhlbWVUb1JlYWRpbmcobTogTW9ycGhlbWUpIHtcbiAgcmV0dXJuIGhhc0thbmppKG0ubGl0ZXJhbCkgPyBrYXRhMmhpcmEobS5saXRlcmFsID09PSBtLmxlbW1hID8gbS5sZW1tYVJlYWRpbmcgOiBtLnByb251bmNpYXRpb24pIDogbS5saXRlcmFsO1xufVxudHlwZSBQYXJzZWQgPSB7XG4gIG1vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107XG59O1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlSGVhZGVyQmxvY2soYmxvY2s6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICBjb25zdCBhdEhlYWRlclJlID0gL14jK1xccytAXFxzKy87XG4gIGNvbnN0IG1hdGNoID0gYmxvY2tbMF0ubWF0Y2goYXRIZWFkZXJSZSk7XG4gIGlmIChtYXRjaCkge1xuICAgIGNvbnN0IGxpbmUgPSBibG9ja1swXS5zbGljZShtYXRjaFswXS5sZW5ndGgpO1xuICAgIGxldCBbcHJvbXB0LCByZXNwb25zZV0gPSBsaW5lLnNwbGl0KCdAJykubWFwKHMgPT4gcy50cmltKCkpO1xuXG4gICAgLy8gcHJvY2VzcyBsaW5lIGFuZCBibG9jay5cbiAgICBjb25zdCBoYXNSZXNwb25zZSA9ICEhcmVzcG9uc2U7XG4gICAgY29uc3QgaGFzUGxlYXNlUGFyc2UgPVxuICAgICAgICB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChQTEVBU0VfUEFSU0VfQkxPQ0spKTtcbiAgICBjb25zdCBoYXNGdXJpZ2FuYSA9IHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgaWYgKCFoYXNSZXNwb25zZSB8fCBoYXNQbGVhc2VQYXJzZSB8fCAhaGFzRnVyaWdhbmEpIHtcbiAgICAgIGNvbnN0IHBhcnNlZDogUGFyc2VkID0gYXdhaXQgcGFyc2UobGluZSk7XG4gICAgICBpZiAoIWhhc1Jlc3BvbnNlKSB7XG4gICAgICAgIHJlc3BvbnNlID0ga2F0YTJoaXJhKGZsYXR0ZW4ocGFyc2VkLmJ1bnNldHN1cylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIobSA9PiBtLnBhcnRPZlNwZWVjaFswXSAhPT0gJ3N1cHBsZW1lbnRhcnlfc3ltYm9sJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAobW9ycGhlbWVUb1JlYWRpbmcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbignJykpO1xuICAgICAgICBibG9ja1swXSA9IGJsb2NrWzBdICsgJyBAICcgKyByZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNQbGVhc2VQYXJzZSkge1xuICAgICAgICAvLyBhZGQgQGZsYXNoIGxpbmVzXG4gICAgICAgIGxldCBmbGFzaEJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAobGV0IFttaWR4LCBtb3JwaGVtZV0gb2YgZW51bWVyYXRlKHBhcnNlZC5tb3JwaGVtZXMpKSB7XG4gICAgICAgICAgaWYgKGZsYXNoYWJsZU1vcnBoZW1lKG1vcnBoZW1lKSkge1xuICAgICAgICAgICAgY29uc3Qge3Byb21wdDogbXByb21wdCwgcmVzcG9uc2U6IG1yZXNwb25zZX0gPSBtb3JwaGVtZVRvUHJvbXB0UmVzcG9uc2UobW9ycGhlbWUpO1xuXG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZSgwLCBtaWR4KS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgcmlnaHQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKG1pZHggKyAxKS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgbGV0IGNsb3plID0gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIG1vcnBoZW1lLmxpdGVyYWwsIHJpZ2h0KTtcbiAgICAgICAgICAgIGxldCBmaW5hbCA9ICcnO1xuICAgICAgICAgICAgaWYgKG1wcm9tcHQgPT09IG1vcnBoZW1lLmxpdGVyYWwgJiYgYXBwZWFyc0V4YWN0bHlPbmNlKHByb21wdCwgbW9ycGhlbWUubGl0ZXJhbCkpIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gICAgQHBvcyAke21vcnBoZW1lLnBhcnRPZlNwZWVjaC5qb2luKCctJyl9YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9ICAgIEBwb3MgJHttb3JwaGVtZS5wYXJ0T2ZTcGVlY2guam9pbignLScpfSBAb21pdCAke2Nsb3plfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzS2FuamkobXByb21wdCkpIHtcbiAgICAgICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCB2b2NhYlRvRnVyaWdhbmEoW21vcnBoZW1lXSk7XG4gICAgICAgICAgICAgIGZpbmFsICs9IGAgQGZ1cmlnYW5hICR7ZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpfWBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZmxhc2hCdWxsZXRzLnB1c2goZmluYWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uZmxhc2hCdWxsZXRzKTtcblxuICAgICAgICAvLyBhZGQgQGZpbGwgbGluZXNcbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmlkZW50aWZ5RmlsbEluQmxhbmtzKHBhcnNlZC5idW5zZXRzdXMpKTtcblxuICAgICAgICAvLyByZW1vdmUgQHBsZWFzZVBhcnNlXG4gICAgICAgIGJsb2NrID0gYmxvY2suZmlsdGVyKHMgPT4gIXMuc3RhcnRzV2l0aChQTEVBU0VfUEFSU0VfQkxPQ0spKTtcbiAgICAgIH1cbiAgICAgIGlmICghaGFzRnVyaWdhbmEgJiYgaGFzS2FuamkocHJvbXB0KSkge1xuICAgICAgICAvLyBhZGQgZnVyaWdhbmEgbGluZVxuICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IGF3YWl0IHBhcnNlZFRvRnVyaWdhbmEocGFyc2VkLm1vcnBoZW1lcyk7XG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCBgJHtGVVJJR0FOQV9CTE9DS30gJHtmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJyl9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBibG9jaztcbn1cblxuZnVuY3Rpb24gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG1vcnBoZW1lOiBNb3JwaGVtZSkge1xuICBjb25zdCBwcm9tcHQgPSAobW9ycGhlbWUucGFydE9mU3BlZWNoWzFdID09PSAncHJvcGVyJykgPyBtb3JwaGVtZS5saXRlcmFsIDogbW9ycGhlbWUubGVtbWE7XG4gIGNvbnN0IHJlc3BvbnNlID1cbiAgICAgIChtb3JwaGVtZS5wYXJ0T2ZTcGVlY2hbMV0gPT09ICdwcm9wZXInKSA/IGthdGEyaGlyYShtb3JwaGVtZS5wcm9udW5jaWF0aW9uKSA6IGthdGEyaGlyYShtb3JwaGVtZS5sZW1tYVJlYWRpbmcpO1xuICByZXR1cm4ge3Byb21wdCwgcmVzcG9uc2V9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB2b2NhYlRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgcmV0dXJuIFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge3Byb21wdDogbGVtbWEsIHJlc3BvbnNlOiBsZW1tYVJlYWRpbmd9ID0gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG0pO1xuICAgIGlmIChoYXNLYW5qaShsZW1tYSkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHsgcmV0dXJuIGxlbW1hSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGVtbWEpID8ge3J1Ynk6IGxlbW1hLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGVtbWFdO1xuICB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlZFRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICBpZiAoaGFzS2FuamkobGl0ZXJhbCkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeSwgcmVhZGluZ1RvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgIGNvbnN0IGxpdGVyYWxIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxpdGVyYWwsICdyZWFkaW5nJywgcHJvbnVuY2lhdGlvbik7XG4gICAgICBpZiAobGl0ZXJhbEhpdCkgeyByZXR1cm4gbGl0ZXJhbEhpdC5mdXJpZ2FuYTsgfVxuICAgICAgY29uc3QgcHJvbnVuY2lhdGlvbkhpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgcHJvbnVuY2lhdGlvbiwgJ3RleHQnLCBsaXRlcmFsKTtcbiAgICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsZW1tYSwgJ3JlYWRpbmcnLCBsZW1tYVJlYWRpbmcpO1xuICAgICAgaWYgKGxlbW1hSGl0KSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hRGljdDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcbiAgICAgICAgZm9yIChjb25zdCBmIG9mIGxlbW1hSGl0LmZ1cmlnYW5hKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmID09PSAnc3RyaW5nJykgeyBjb250aW51ZTsgfVxuICAgICAgICAgIGZ1cmlnYW5hRGljdC5zZXQoZi5ydWJ5LCBmLnJ0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNoYXJzID0gbGl0ZXJhbC5zcGxpdCgnJyk7XG4gICAgICAgIGxldCBrYW5qaSA9IGNoYXJzLmZpbHRlcihoYXNLYW5qaSk7XG4gICAgICAgIGNvbnN0IGFubm90YXRlZENoYXJzOiBGdXJpZ2FuYVtdID0gY2hhcnMuc2xpY2UoKTtcblxuICAgICAgICAvLyBzdGFydCBmcm9tIGFsbCBrYW5qaSBjaGFyYWN0ZXJzIGluIGEgc3RyaW5nLCBzZWUgaWYgdGhhdCdzIGluIGZ1cmlnYW5hRGljdCwgaWYgbm90LCBjaG9wIGxhc3RcbiAgICAgICAgd2hpbGUgKGthbmppLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IGhpdCA9IHRyaXUoa2FuamkpLmZpbmQoa3MgPT4gZnVyaWdhbmFEaWN0Lmhhcyhrcy5qb2luKCcnKSkpO1xuICAgICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICAgIGNvbnN0IGhpdHN0ciA9IGhpdC5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpdGVyYWwuaW5kZXhPZihoaXRzdHIpO1xuICAgICAgICAgICAgYW5ub3RhdGVkQ2hhcnNbaWR4XSA9IHtydWJ5OiBoaXRzdHIsIHJ0OiBmdXJpZ2FuYURpY3QuZ2V0KGhpdHN0cikgfHwgaGl0c3RyfTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpZHggKyAxOyBpIDwgaWR4ICsgaGl0c3RyLmxlbmd0aDsgaSsrKSB7IGFubm90YXRlZENoYXJzW2ldID0gJyc7IH1cbiAgICAgICAgICAgIGthbmppID0ga2Fuamkuc2xpY2UoaGl0c3RyLmxlbmd0aCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFubm90YXRlZENoYXJzO1xuICAgICAgfVxuICAgICAgLy8gY29uc3QgbGVtbWFSZWFkaW5nSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBsZW1tYVJlYWRpbmcsICd0ZXh0JywgbGVtbWEpO1xuICAgICAgLy8gaWYgKGxlbW1hUmVhZGluZ0hpdCkgeyByZXR1cm4gbGVtbWFSZWFkaW5nSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGl0ZXJhbCkgPyB7cnVieTogbGl0ZXJhbCwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxpdGVyYWxdO1xuICB9KSk7XG5cbiAgcmV0dXJuIGZ1cmlnYW5hO1xufVxuXG5mdW5jdGlvbiB0cml1PFQ+KGFycjogVFtdKTogVFtdW10ge1xuICBjb25zdCByZXQ6IFRbXVtdID0gW107XG4gIGZvciAobGV0IGkgPSBhcnIubGVuZ3RoOyBpID4gMDsgLS1pKSB7IHJldC5wdXNoKGFyci5zbGljZSgwLCBpKSk7IH1cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gc2VhcmNoKG1hcDogTWFwPHN0cmluZywgRW50cnlbXT4sIGZpcnN0OiBzdHJpbmcsIHN1YjogJ3JlYWRpbmcnfCd0ZXh0Jywgc2Vjb25kOiBzdHJpbmcpOiBFbnRyeXx1bmRlZmluZWQge1xuICBjb25zdCBoaXQgPSBtYXAuZ2V0KGZpcnN0KTtcbiAgaWYgKGhpdCkge1xuICAgIGlmIChoaXQubGVuZ3RoID09PSAxKSB7IHJldHVybiBoaXRbMF07IH1cbiAgICBjb25zdCBzdWJoaXQgPSBoaXQuZmluZChlID0+IGthdGEyaGlyYShlW3N1Yl0pID09PSBrYXRhMmhpcmEoc2Vjb25kKSk7XG4gICAgaWYgKHN1YmhpdCkgeyByZXR1cm4gc3ViaGl0OyB9XG4gICAgY29uc29sZS5lcnJvcihgZm91bmQgaGl0IGZvciAke2ZpcnN0fSBidXQgbm90ICR7c2Vjb25kfWAsIHtoaXR9KTtcbiAgfVxufVxuXG4vKipcbiAqIEVuc3VyZSBuZWVkbGUgaXMgZm91bmQgaW4gaGF5c3RhY2sgb25seSBvbmNlXG4gKiBAcGFyYW0gaGF5c3RhY2sgYmlnIHN0cmluZ1xuICogQHBhcmFtIG5lZWRsZSBsaXR0bGUgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIGFwcGVhcnNFeGFjdGx5T25jZShoYXlzdGFjazogc3RyaW5nLCBuZWVkbGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBsZXQgaGl0OiBudW1iZXI7XG4gIHJldHVybiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpKSA+PSAwICYmIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSwgaGl0ICsgMSkpIDwgMDtcbn1cbi8qKlxuICogR2l2ZW4gdGhyZWUgY29uc2VjdXRpZXMgc3Vic3RyaW5ncyAodGhlIGFyZ3VtZW50cyksIHJldHVybiBlaXRoZXJcbiAqIC0gYCR7bGVmdDJ9WyR7Y2xvemV9XSR7cmlnaHQyfWAgd2hlcmUgYGxlZnQyYCBhbmQgYHJpZ2h0MmAgYXJlIGFzIHNob3J0IGFzIHBvc3NpYmxlIChhbmQgb2YgZXF1YWwgbGVuZ3RoLCBpZlxuICogICAgcG9zc2libGUpIHNvIHRoZSB0aGlzIHJldHVybiBzdHJpbmcgKG1pbnVzIHRoZSBicmFja2V0cykgaXMgdW5pcXVlIGluIHRoZSBmdWxsIHN0cmluZywgb3JcbiAqIC0gYCR7Y2xvemV9YCBpZiBgbGVmdDIgPT09IHJpZ2h0MiA9PT0gJydgIChpLmUuLCB0aGUgYWJvdmUgYnV0IHdpdGhvdXQgdGhlIGJyYWNrZXRzKS5cbiAqIEBwYXJhbSBsZWZ0IGxlZnQgc3RyaW5nLCBwb3NzaWJseSBlbXB0eVxuICogQHBhcmFtIGNsb3plIG1pZGRsZSBzdHJpbmdcbiAqIEBwYXJhbSByaWdodCByaWdodCBzdHJpbmcsIHBvc3NpYmxlIGVtcHR5XG4gKiBAdGhyb3dzIGluIHRoZSB1bmxpa2VseSBldmVudCB0aGF0IHN1Y2ggYSByZXR1cm4gc3RyaW5nIGNhbm5vdCBiZSBidWlsZCAoSSBjYW5ub3QgdGhpbmsgb2YgYW4gZXhhbXBsZSB0aG91Z2gpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0OiBzdHJpbmcsIGNsb3plOiBzdHJpbmcsIHJpZ2h0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBzZW50ZW5jZSA9IGxlZnQgKyBjbG96ZSArIHJpZ2h0O1xuICBsZXQgbGVmdENvbnRleHQgPSAnJztcbiAgbGV0IHJpZ2h0Q29udGV4dCA9ICcnO1xuICBsZXQgY29udGV4dExlbmd0aCA9IDA7XG4gIHdoaWxlICghYXBwZWFyc0V4YWN0bHlPbmNlKHNlbnRlbmNlLCBsZWZ0Q29udGV4dCArIGNsb3plICsgcmlnaHRDb250ZXh0KSkge1xuICAgIGNvbnRleHRMZW5ndGgrKztcbiAgICBpZiAoY29udGV4dExlbmd0aCA+PSBsZWZ0Lmxlbmd0aCAmJiBjb250ZXh0TGVuZ3RoID49IHJpZ2h0Lmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW4gb3V0IG9mIGNvbnRleHQgdG8gYnVpbGQgdW5pcXVlIGNsb3plJyk7XG4gICAgfVxuICAgIGxlZnRDb250ZXh0ID0gbGVmdC5zbGljZSgtY29udGV4dExlbmd0aCk7XG4gICAgcmlnaHRDb250ZXh0ID0gcmlnaHQuc2xpY2UoMCwgY29udGV4dExlbmd0aCk7XG4gIH1cbiAgaWYgKGxlZnRDb250ZXh0ID09PSAnJyAmJiByaWdodENvbnRleHQgPT09ICcnKSB7IHJldHVybiBjbG96ZTsgfVxuICByZXR1cm4gYCR7bGVmdENvbnRleHR9WyR7Y2xvemV9XSR7cmlnaHRDb250ZXh0fWA7XG59XG5cbmZ1bmN0aW9uIGlkZW50aWZ5RmlsbEluQmxhbmtzKGJ1bnNldHN1czogTW9ycGhlbWVbXVtdKSB7XG4gIC8vIEZpbmQgY2xvemVzOiBwYXJ0aWNsZXMgYW5kIGNvbmp1Z2F0ZWQgdmVyYi9hZGplY3RpdmUgcGhyYXNlc1xuICBsZXQgbGl0ZXJhbENsb3plczogTWFwPHN0cmluZywgTW9ycGhlbWVbXT4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgW2JpZHgsIGJ1bnNldHN1XSBvZiBlbnVtZXJhdGUoYnVuc2V0c3VzKSkge1xuICAgIGxldCBmaXJzdCA9IGJ1bnNldHN1WzBdO1xuICAgIGlmICghZmlyc3QpIHsgY29udGludWU7IH1cbiAgICBjb25zdCBwb3MwID0gZmlyc3QucGFydE9mU3BlZWNoWzBdO1xuICAgIGxldCBzZWFyY2hGb3JQYXJ0aWNsZXMgPSB0cnVlO1xuICAgIGlmIChidW5zZXRzdS5sZW5ndGggPiAxICYmIChwb3MwLnN0YXJ0c1dpdGgoJ3ZlcmInKSB8fCBwb3MwLmVuZHNXaXRoKCdfdmVyYicpIHx8IHBvczAuc3RhcnRzV2l0aCgnYWRqZWN0JykpKSB7XG4gICAgICBsZXQgaWdub3JlUmlnaHQgPSBmaWx0ZXJSaWdodChidW5zZXRzdSwgbSA9PiAhZ29vZE1vcnBoZW1lUHJlZGljYXRlKG0pKTtcbiAgICAgIGxldCBnb29kQnVuc2V0c3UgPSBpZ25vcmVSaWdodC5sZW5ndGggPT09IDAgPyBidW5zZXRzdSA6IGJ1bnNldHN1LnNsaWNlKDAsIC1pZ25vcmVSaWdodC5sZW5ndGgpO1xuICAgICAgaWYgKGdvb2RCdW5zZXRzdS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHNlYXJjaEZvclBhcnRpY2xlcyA9IGZhbHNlO1xuICAgICAgICBsZXQgY2xvemUgPSBidW5zZXRzdVRvU3RyaW5nKGdvb2RCdW5zZXRzdSk7XG4gICAgICAgIGxldCBsZWZ0ID0gYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gYnVuc2V0c3VUb1N0cmluZyhpZ25vcmVSaWdodCkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIGNsb3plLCByaWdodCksIGdvb2RCdW5zZXRzdSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIG9ubHkgYWRkIHBhcnRpY2xlcyBpZiB0aGV5J3JlIE5PVCBpbnNpZGUgY29uanVnYXRlZCBwaHJhc2VzXG4gICAgY29uc3QgcGFydGljbGVQcmVkaWNhdGUgPSAocDogTW9ycGhlbWUpID0+IHAucGFydE9mU3BlZWNoWzBdLnN0YXJ0c1dpdGgoJ3BhcnRpY2xlJykgJiYgcC5wYXJ0T2ZTcGVlY2gubGVuZ3RoID4gMSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhcC5wYXJ0T2ZTcGVlY2hbMV0uc3RhcnRzV2l0aCgncGhyYXNlX2ZpbmFsJyk7XG4gICAgaWYgKHNlYXJjaEZvclBhcnRpY2xlcykge1xuICAgICAgZm9yIChsZXQgW3BpZHgsIHBhcnRpY2xlXSBvZiBlbnVtZXJhdGUoYnVuc2V0c3UpKSB7XG4gICAgICAgIGlmIChwYXJ0aWNsZVByZWRpY2F0ZShwYXJ0aWNsZSkpIHtcbiAgICAgICAgICBsZXQgbGVmdCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJykgKyBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKDAsIHBpZHgpKTtcbiAgICAgICAgICBsZXQgcmlnaHQgPVxuICAgICAgICAgICAgICBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKHBpZHggKyAxKSkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgcGFydGljbGUubGl0ZXJhbCwgcmlnaHQpLCBbcGFydGljbGVdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBsZXQgZXhpc3RpbmdDbG96ZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldChbXSk7XG4gIGxldCBidWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGxldCBbY2xvemUsIGJ1bnNldHN1XSBvZiBsaXRlcmFsQ2xvemVzKSB7XG4gICAgaWYgKCFleGlzdGluZ0Nsb3plcy5oYXMoY2xvemUpKSB7XG4gICAgICBsZXQgYWNjZXB0YWJsZSA9IFtjbG96ZV07XG4gICAgICBpZiAoaGFzS2FuamkoYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdSkpKSB7XG4gICAgICAgIGFjY2VwdGFibGUucHVzaChrYXRhMmhpcmEoYnVuc2V0c3UubWFwKG0gPT4gbS5wcm9udW5jaWF0aW9uKS5qb2luKCcnKSkpXG4gICAgICB9XG4gICAgICBidWxsZXRzLnB1c2goJy0gQGZpbGwgJyArIGFjY2VwdGFibGUuam9pbignIEAgJykgK1xuICAgICAgICAgICAgICAgICAgIGAgICAgQHBvcyAke2J1bnNldHN1Lm1hcChtID0+IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKSkuam9pbignLycpfWApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYnVsbGV0cztcbn1cblxuY29uc3QgVVNBR0UgPSBgVVNBR0UgMTpcbiQgbm9kZSBbdGhpcy1zY3JpcHQuanNdIFttYXJrZG93bi5tZF1cblxuVVNBR0UgMjpcbiQgY2F0IFttYXJrZG93bi5tZF0gfCBub2RlIFt0aGlzLXNjcmlwdC5qc11cblxuQm90aCB3aWxsIHByaW50IGEgcGFyc2VkIHZlcnNpb24gb2YgdGhlIGlucHV0LmA7XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcHJvbWlzaWZ5ID0gcmVxdWlyZSgndXRpbCcpLnByb21pc2lmeTtcbiAgY29uc3QgcmVhZEZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnZnMnKS5yZWFkRmlsZSk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBjb25zdCB0ZXh0ID0gcHJvY2Vzcy5hcmd2WzJdID8gYXdhaXQgcmVhZEZpbGUocHJvY2Vzcy5hcmd2WzJdLCAndXRmOCcpIDogKChhd2FpdCBnZXRTdGRpbigpKSB8fCBVU0FHRSk7XG4gICAgLy8gU3BsaXQgTWFya2Rvd24gYXQgaGVhZGVyIChgIyBibGFibGFgKVxuICAgIGxldCBibG9ja3MgPSBzcGxpdEF0SGVhZGVycyh0ZXh0KTtcbiAgICAvLyBQYXJzZSBoZWFkZXJzXG4gICAgbGV0IGNvbnRlbnQgPSBhd2FpdCBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3MpO1xuICAgIC8vIFByaW50IHJlc3VsdFxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbnRlbnQubWFwKHYgPT4gdi5qb2luKCdcXG4nKSkuam9pbignXFxuJykpO1xuICB9KSgpO1xufSJdfQ==