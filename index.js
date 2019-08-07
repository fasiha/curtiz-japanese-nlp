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
                            const mprompt = (morpheme.partOfSpeech[1] === 'proper') ? morpheme.literal : morpheme.lemma;
                            const mresponse = (morpheme.partOfSpeech[1] === 'proper') ? kana_1.kata2hira(morpheme.pronunciation)
                                : kana_1.kata2hira(morpheme.lemmaReading);
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
function vocabToFurigana(morphemes) {
    return __awaiter(this, void 0, void 0, function* () {
        return Promise.all(morphemes.map((m) => __awaiter(this, void 0, void 0, function* () {
            const { lemma, lemmaReading } = m;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBOEU7QUFFOUUsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQWUsS0FBSyxDQUFDLFFBQWdCOztRQUNuQyxJQUFJLFFBQVEsR0FBRyxNQUFNLHlCQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxTQUFTLEdBQUcsdUNBQXlCLENBQUMsd0JBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxTQUFTLEdBQUcsTUFBTSxnQkFBUSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBQyxDQUFDO0lBQ2hDLENBQUM7Q0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQsU0FBc0Isb0JBQW9C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cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IHthZGRKZGVwcH0gZnJvbSAnLi9qZGVwcCc7XG5pbXBvcnQge2thdGEyaGlyYX0gZnJvbSAnLi9rYW5hJztcbmltcG9ydCB7Z29vZE1vcnBoZW1lUHJlZGljYXRlLCBpbnZva2VNZWNhYiwgbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcywgTW9ycGhlbWUsIHBhcnNlTWVjYWJ9IGZyb20gJy4vbWVjYWJVbmlkaWMnO1xuaW1wb3J0IHtlbnVtZXJhdGUsIGZpbHRlclJpZ2h0LCBmbGF0dGVuLCBoYXNLYW5qaSwgcGFydGl0aW9uQnksIHRha2VXaGlsZX0gZnJvbSAnY3VydGl6LXV0aWxzJztcbmltcG9ydCB7RW50cnksIGZ1cmlnYW5hVG9TdHJpbmcsIEZ1cmlnYW5hLCBzZXR1cH0gZnJvbSAnam1kaWN0LWZ1cmlnYW5hLW5vZGUnO1xuXG5jb25zdCBKbWRpY3RGdXJpZ2FuYSA9IHNldHVwKCk7XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlKHNlbnRlbmNlOiBzdHJpbmcpOiBQcm9taXNlPHttb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO30+IHtcbiAgbGV0IHJhd01lY2FiID0gYXdhaXQgaW52b2tlTWVjYWIoc2VudGVuY2UpO1xuICBsZXQgbW9ycGhlbWVzID0gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyhwYXJzZU1lY2FiKHNlbnRlbmNlLCByYXdNZWNhYilbMF0uZmlsdGVyKG8gPT4gISFvKSk7XG4gIGxldCBidW5zZXRzdXMgPSBhd2FpdCBhZGRKZGVwcChyYXdNZWNhYiwgbW9ycGhlbWVzKTtcbiAgcmV0dXJuIHttb3JwaGVtZXMsIGJ1bnNldHN1c307XG59XG5cbmNvbnN0IGJ1bnNldHN1VG9TdHJpbmcgPSAobW9ycGhlbWVzOiBNb3JwaGVtZVtdKSA9PiBtb3JwaGVtZXMubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNwbGl0QXRIZWFkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdW10ge1xuICBjb25zdCBoZWFkZXJSZSA9IC9eIytcXHMrLiskLztcbiAgcmV0dXJuIHBhcnRpdGlvbkJ5KHRleHQuc3BsaXQoJ1xcbicpLCBzID0+IGhlYWRlclJlLnRlc3QocykpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzOiBzdHJpbmdbXVtdLCBjb25jdXJyZW50TGltaXQ6IG51bWJlciA9IDgpIHtcbiAgbGV0IHJldDogc3RyaW5nW11bXSA9IFtdO1xuICBsZXQgcHJvbWlzZXM6IFByb21pc2U8c3RyaW5nW10+W10gPSBbXTtcbiAgZm9yIChsZXQgbyBvZiBibG9ja3MpIHtcbiAgICBpZiAocHJvbWlzZXMubGVuZ3RoID49IGNvbmN1cnJlbnRMaW1pdCkge1xuICAgICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gICAgICBwcm9taXNlcyA9IFtdO1xuICAgIH1cbiAgICBwcm9taXNlcy5wdXNoKHBhcnNlSGVhZGVyQmxvY2sobykpO1xuICB9XG4gIGlmIChwcm9taXNlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IFBMRUFTRV9QQVJTRV9CTE9DSyA9ICctIEBwbGVhc2VQYXJzZSc7XG5jb25zdCBGVVJJR0FOQV9CTE9DSyA9ICctIEBmdXJpZ2FuYSc7XG5cbmNvbnN0IGZsYXNoYWJsZU1vcnBoZW1lID0gKG06IE1vcnBoZW1lKSA9PiB7XG4gIGNvbnN0IHBvcyA9IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKTtcbiAgaWYgKGhhc0thbmppKG0ubGl0ZXJhbCkgJiYgIXBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgaWYgKHBvcy5zdGFydHNXaXRoKCd2ZXJiLWdlbmVyYWwnKSB8fCBwb3Muc3RhcnRzV2l0aCgnbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdwcm9ub3VuJykgfHxcbiAgICAgIHBvcy5zdGFydHNXaXRoKCdhZGplY3RpdicpIHx8IHBvcy5zdGFydHNXaXRoKCdhZHZlcmInKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5mdW5jdGlvbiBtb3JwaGVtZVRvUmVhZGluZyhtOiBNb3JwaGVtZSkge1xuICByZXR1cm4gaGFzS2FuamkobS5saXRlcmFsKSA/IGthdGEyaGlyYShtLmxpdGVyYWwgPT09IG0ubGVtbWEgPyBtLmxlbW1hUmVhZGluZyA6IG0ucHJvbnVuY2lhdGlvbikgOiBtLmxpdGVyYWw7XG59XG50eXBlIFBhcnNlZCA9IHtcbiAgbW9ycGhlbWVzOiBNb3JwaGVtZVtdOyBidW5zZXRzdXM6IE1vcnBoZW1lW11bXTtcbn07XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VIZWFkZXJCbG9jayhibG9jazogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IGF0SGVhZGVyUmUgPSAvXiMrXFxzK0BcXHMrLztcbiAgY29uc3QgbWF0Y2ggPSBibG9ja1swXS5tYXRjaChhdEhlYWRlclJlKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgbGluZSA9IGJsb2NrWzBdLnNsaWNlKG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgbGV0IFtwcm9tcHQsIHJlc3BvbnNlXSA9IGxpbmUuc3BsaXQoJ0AnKS5tYXAocyA9PiBzLnRyaW0oKSk7XG5cbiAgICAvLyBwcm9jZXNzIGxpbmUgYW5kIGJsb2NrLlxuICAgIGNvbnN0IGhhc1Jlc3BvbnNlID0gISFyZXNwb25zZTtcbiAgICBjb25zdCBoYXNQbGVhc2VQYXJzZSA9XG4gICAgICAgIHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgIGNvbnN0IGhhc0Z1cmlnYW5hID0gdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICBpZiAoIWhhc1Jlc3BvbnNlIHx8IGhhc1BsZWFzZVBhcnNlIHx8ICFoYXNGdXJpZ2FuYSkge1xuICAgICAgY29uc3QgcGFyc2VkOiBQYXJzZWQgPSBhd2FpdCBwYXJzZShsaW5lKTtcbiAgICAgIGlmICghaGFzUmVzcG9uc2UpIHtcbiAgICAgICAgcmVzcG9uc2UgPSBrYXRhMmhpcmEoZmxhdHRlbihwYXJzZWQuYnVuc2V0c3VzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihtID0+IG0ucGFydE9mU3BlZWNoWzBdICE9PSAnc3VwcGxlbWVudGFyeV9zeW1ib2wnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChtb3JwaGVtZVRvUmVhZGluZylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5qb2luKCcnKSk7XG4gICAgICAgIGJsb2NrWzBdID0gYmxvY2tbMF0gKyAnIEAgJyArIHJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgaWYgKGhhc1BsZWFzZVBhcnNlKSB7XG4gICAgICAgIC8vIGFkZCBAZmxhc2ggbGluZXNcbiAgICAgICAgbGV0IGZsYXNoQnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgW21pZHgsIG1vcnBoZW1lXSBvZiBlbnVtZXJhdGUocGFyc2VkLm1vcnBoZW1lcykpIHtcbiAgICAgICAgICBpZiAoZmxhc2hhYmxlTW9ycGhlbWUobW9ycGhlbWUpKSB7XG4gICAgICAgICAgICBjb25zdCBtcHJvbXB0ID0gKG1vcnBoZW1lLnBhcnRPZlNwZWVjaFsxXSA9PT0gJ3Byb3BlcicpID8gbW9ycGhlbWUubGl0ZXJhbCA6IG1vcnBoZW1lLmxlbW1hO1xuICAgICAgICAgICAgY29uc3QgbXJlc3BvbnNlID0gKG1vcnBoZW1lLnBhcnRPZlNwZWVjaFsxXSA9PT0gJ3Byb3BlcicpID8ga2F0YTJoaXJhKG1vcnBoZW1lLnByb251bmNpYXRpb24pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBrYXRhMmhpcmEobW9ycGhlbWUubGVtbWFSZWFkaW5nKTtcblxuICAgICAgICAgICAgY29uc3QgbGVmdCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UoMCwgbWlkeCkubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IHJpZ2h0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZShtaWR4ICsgMSkubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcbiAgICAgICAgICAgIGxldCBjbG96ZSA9IGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBtb3JwaGVtZS5saXRlcmFsLCByaWdodCk7XG4gICAgICAgICAgICBsZXQgZmluYWwgPSAnJztcbiAgICAgICAgICAgIGlmIChtcHJvbXB0ID09PSBtb3JwaGVtZS5saXRlcmFsICYmIGFwcGVhcnNFeGFjdGx5T25jZShwcm9tcHQsIG1vcnBoZW1lLmxpdGVyYWwpKSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9ICAgIEBwb3MgJHttb3JwaGVtZS5wYXJ0T2ZTcGVlY2guam9pbignLScpfWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfSAgICBAcG9zICR7bW9ycGhlbWUucGFydE9mU3BlZWNoLmpvaW4oJy0nKX0gQG9taXQgJHtjbG96ZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhhc0thbmppKG1wcm9tcHQpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGZ1cmlnYW5hID0gYXdhaXQgdm9jYWJUb0Z1cmlnYW5hKFttb3JwaGVtZV0pO1xuICAgICAgICAgICAgICBmaW5hbCArPSBgIEBmdXJpZ2FuYSAke2Z1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKX1gXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZsYXNoQnVsbGV0cy5wdXNoKGZpbmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmZsYXNoQnVsbGV0cyk7XG5cbiAgICAgICAgLy8gYWRkIEBmaWxsIGxpbmVzXG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5pZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIEBwbGVhc2VQYXJzZVxuICAgICAgICBibG9jayA9IGJsb2NrLmZpbHRlcihzID0+ICFzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgICB9XG4gICAgICBpZiAoIWhhc0Z1cmlnYW5hICYmIGhhc0thbmppKHByb21wdCkpIHtcbiAgICAgICAgLy8gYWRkIGZ1cmlnYW5hIGxpbmVcbiAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCBwYXJzZWRUb0Z1cmlnYW5hKHBhcnNlZC5tb3JwaGVtZXMpO1xuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgYCR7RlVSSUdBTkFfQkxPQ0t9ICR7ZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gYmxvY2s7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHZvY2FiVG9GdXJpZ2FuYShtb3JwaGVtZXM6IE1vcnBoZW1lW10pOiBQcm9taXNlPEZ1cmlnYW5hW11bXT4ge1xuICByZXR1cm4gUHJvbWlzZS5hbGwobW9ycGhlbWVzLm1hcChhc3luYyBtID0+IHtcbiAgICBjb25zdCB7bGVtbWEsIGxlbW1hUmVhZGluZ30gPSBtO1xuICAgIGlmIChoYXNLYW5qaShsZW1tYSkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeX0gPSBhd2FpdCBKbWRpY3RGdXJpZ2FuYTtcblxuICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICBpZiAobGVtbWFIaXQpIHsgcmV0dXJuIGxlbW1hSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGVtbWEpID8ge3J1Ynk6IGxlbW1hLCBydDogbW9ycGhlbWVUb1JlYWRpbmcobSl9IDogbGVtbWFdO1xuICB9KSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlZFRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICBpZiAoaGFzS2FuamkobGl0ZXJhbCkpIHtcbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeSwgcmVhZGluZ1RvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgIGNvbnN0IGxpdGVyYWxIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxpdGVyYWwsICdyZWFkaW5nJywgcHJvbnVuY2lhdGlvbik7XG4gICAgICBpZiAobGl0ZXJhbEhpdCkgeyByZXR1cm4gbGl0ZXJhbEhpdC5mdXJpZ2FuYTsgfVxuICAgICAgY29uc3QgcHJvbnVuY2lhdGlvbkhpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgcHJvbnVuY2lhdGlvbiwgJ3RleHQnLCBsaXRlcmFsKTtcbiAgICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsZW1tYSwgJ3JlYWRpbmcnLCBsZW1tYVJlYWRpbmcpO1xuICAgICAgaWYgKGxlbW1hSGl0KSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hRGljdDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcbiAgICAgICAgZm9yIChjb25zdCBmIG9mIGxlbW1hSGl0LmZ1cmlnYW5hKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmID09PSAnc3RyaW5nJykgeyBjb250aW51ZTsgfVxuICAgICAgICAgIGZ1cmlnYW5hRGljdC5zZXQoZi5ydWJ5LCBmLnJ0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNoYXJzID0gbGl0ZXJhbC5zcGxpdCgnJyk7XG4gICAgICAgIGxldCBrYW5qaSA9IGNoYXJzLmZpbHRlcihoYXNLYW5qaSk7XG4gICAgICAgIGNvbnN0IGFubm90YXRlZENoYXJzOiBGdXJpZ2FuYVtdID0gY2hhcnMuc2xpY2UoKTtcblxuICAgICAgICAvLyBzdGFydCBmcm9tIGFsbCBrYW5qaSBjaGFyYWN0ZXJzIGluIGEgc3RyaW5nLCBzZWUgaWYgdGhhdCdzIGluIGZ1cmlnYW5hRGljdCwgaWYgbm90LCBjaG9wIGxhc3RcbiAgICAgICAgd2hpbGUgKGthbmppLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IGhpdCA9IHRyaXUoa2FuamkpLmZpbmQoa3MgPT4gZnVyaWdhbmFEaWN0Lmhhcyhrcy5qb2luKCcnKSkpO1xuICAgICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICAgIGNvbnN0IGhpdHN0ciA9IGhpdC5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpdGVyYWwuaW5kZXhPZihoaXRzdHIpO1xuICAgICAgICAgICAgYW5ub3RhdGVkQ2hhcnNbaWR4XSA9IHtydWJ5OiBoaXRzdHIsIHJ0OiBmdXJpZ2FuYURpY3QuZ2V0KGhpdHN0cikgfHwgaGl0c3RyfTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpZHggKyAxOyBpIDwgaWR4ICsgaGl0c3RyLmxlbmd0aDsgaSsrKSB7IGFubm90YXRlZENoYXJzW2ldID0gJyc7IH1cbiAgICAgICAgICAgIGthbmppID0ga2Fuamkuc2xpY2UoaGl0c3RyLmxlbmd0aCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFubm90YXRlZENoYXJzO1xuICAgICAgfVxuICAgICAgLy8gY29uc3QgbGVtbWFSZWFkaW5nSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBsZW1tYVJlYWRpbmcsICd0ZXh0JywgbGVtbWEpO1xuICAgICAgLy8gaWYgKGxlbW1hUmVhZGluZ0hpdCkgeyByZXR1cm4gbGVtbWFSZWFkaW5nSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGl0ZXJhbCkgPyB7cnVieTogbGl0ZXJhbCwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxpdGVyYWxdO1xuICB9KSk7XG5cbiAgcmV0dXJuIGZ1cmlnYW5hO1xufVxuXG5mdW5jdGlvbiB0cml1PFQ+KGFycjogVFtdKTogVFtdW10ge1xuICBjb25zdCByZXQ6IFRbXVtdID0gW107XG4gIGZvciAobGV0IGkgPSBhcnIubGVuZ3RoOyBpID4gMDsgLS1pKSB7IHJldC5wdXNoKGFyci5zbGljZSgwLCBpKSk7IH1cbiAgcmV0dXJuIHJldDtcbn1cblxuZnVuY3Rpb24gc2VhcmNoKG1hcDogTWFwPHN0cmluZywgRW50cnlbXT4sIGZpcnN0OiBzdHJpbmcsIHN1YjogJ3JlYWRpbmcnfCd0ZXh0Jywgc2Vjb25kOiBzdHJpbmcpOiBFbnRyeXx1bmRlZmluZWQge1xuICBjb25zdCBoaXQgPSBtYXAuZ2V0KGZpcnN0KTtcbiAgaWYgKGhpdCkge1xuICAgIGlmIChoaXQubGVuZ3RoID09PSAxKSB7IHJldHVybiBoaXRbMF07IH1cbiAgICBjb25zdCBzdWJoaXQgPSBoaXQuZmluZChlID0+IGthdGEyaGlyYShlW3N1Yl0pID09PSBrYXRhMmhpcmEoc2Vjb25kKSk7XG4gICAgaWYgKHN1YmhpdCkgeyByZXR1cm4gc3ViaGl0OyB9XG4gICAgY29uc29sZS5lcnJvcihgZm91bmQgaGl0IGZvciAke2ZpcnN0fSBidXQgbm90ICR7c2Vjb25kfWAsIHtoaXR9KTtcbiAgfVxufVxuXG4vKipcbiAqIEVuc3VyZSBuZWVkbGUgaXMgZm91bmQgaW4gaGF5c3RhY2sgb25seSBvbmNlXG4gKiBAcGFyYW0gaGF5c3RhY2sgYmlnIHN0cmluZ1xuICogQHBhcmFtIG5lZWRsZSBsaXR0bGUgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIGFwcGVhcnNFeGFjdGx5T25jZShoYXlzdGFjazogc3RyaW5nLCBuZWVkbGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBsZXQgaGl0OiBudW1iZXI7XG4gIHJldHVybiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpKSA+PSAwICYmIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSwgaGl0ICsgMSkpIDwgMDtcbn1cbi8qKlxuICogR2l2ZW4gdGhyZWUgY29uc2VjdXRpZXMgc3Vic3RyaW5ncyAodGhlIGFyZ3VtZW50cyksIHJldHVybiBlaXRoZXJcbiAqIC0gYCR7bGVmdDJ9WyR7Y2xvemV9XSR7cmlnaHQyfWAgd2hlcmUgYGxlZnQyYCBhbmQgYHJpZ2h0MmAgYXJlIGFzIHNob3J0IGFzIHBvc3NpYmxlIChhbmQgb2YgZXF1YWwgbGVuZ3RoLCBpZlxuICogICAgcG9zc2libGUpIHNvIHRoZSB0aGlzIHJldHVybiBzdHJpbmcgKG1pbnVzIHRoZSBicmFja2V0cykgaXMgdW5pcXVlIGluIHRoZSBmdWxsIHN0cmluZywgb3JcbiAqIC0gYCR7Y2xvemV9YCBpZiBgbGVmdDIgPT09IHJpZ2h0MiA9PT0gJydgIChpLmUuLCB0aGUgYWJvdmUgYnV0IHdpdGhvdXQgdGhlIGJyYWNrZXRzKS5cbiAqIEBwYXJhbSBsZWZ0IGxlZnQgc3RyaW5nLCBwb3NzaWJseSBlbXB0eVxuICogQHBhcmFtIGNsb3plIG1pZGRsZSBzdHJpbmdcbiAqIEBwYXJhbSByaWdodCByaWdodCBzdHJpbmcsIHBvc3NpYmxlIGVtcHR5XG4gKiBAdGhyb3dzIGluIHRoZSB1bmxpa2VseSBldmVudCB0aGF0IHN1Y2ggYSByZXR1cm4gc3RyaW5nIGNhbm5vdCBiZSBidWlsZCAoSSBjYW5ub3QgdGhpbmsgb2YgYW4gZXhhbXBsZSB0aG91Z2gpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0OiBzdHJpbmcsIGNsb3plOiBzdHJpbmcsIHJpZ2h0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBzZW50ZW5jZSA9IGxlZnQgKyBjbG96ZSArIHJpZ2h0O1xuICBsZXQgbGVmdENvbnRleHQgPSAnJztcbiAgbGV0IHJpZ2h0Q29udGV4dCA9ICcnO1xuICBsZXQgY29udGV4dExlbmd0aCA9IDA7XG4gIHdoaWxlICghYXBwZWFyc0V4YWN0bHlPbmNlKHNlbnRlbmNlLCBsZWZ0Q29udGV4dCArIGNsb3plICsgcmlnaHRDb250ZXh0KSkge1xuICAgIGNvbnRleHRMZW5ndGgrKztcbiAgICBpZiAoY29udGV4dExlbmd0aCA+PSBsZWZ0Lmxlbmd0aCAmJiBjb250ZXh0TGVuZ3RoID49IHJpZ2h0Lmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW4gb3V0IG9mIGNvbnRleHQgdG8gYnVpbGQgdW5pcXVlIGNsb3plJyk7XG4gICAgfVxuICAgIGxlZnRDb250ZXh0ID0gbGVmdC5zbGljZSgtY29udGV4dExlbmd0aCk7XG4gICAgcmlnaHRDb250ZXh0ID0gcmlnaHQuc2xpY2UoMCwgY29udGV4dExlbmd0aCk7XG4gIH1cbiAgaWYgKGxlZnRDb250ZXh0ID09PSAnJyAmJiByaWdodENvbnRleHQgPT09ICcnKSB7IHJldHVybiBjbG96ZTsgfVxuICByZXR1cm4gYCR7bGVmdENvbnRleHR9WyR7Y2xvemV9XSR7cmlnaHRDb250ZXh0fWA7XG59XG5cbmZ1bmN0aW9uIGlkZW50aWZ5RmlsbEluQmxhbmtzKGJ1bnNldHN1czogTW9ycGhlbWVbXVtdKSB7XG4gIC8vIEZpbmQgY2xvemVzOiBwYXJ0aWNsZXMgYW5kIGNvbmp1Z2F0ZWQgdmVyYi9hZGplY3RpdmUgcGhyYXNlc1xuICBsZXQgbGl0ZXJhbENsb3plczogTWFwPHN0cmluZywgTW9ycGhlbWVbXT4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgW2JpZHgsIGJ1bnNldHN1XSBvZiBlbnVtZXJhdGUoYnVuc2V0c3VzKSkge1xuICAgIGxldCBmaXJzdCA9IGJ1bnNldHN1WzBdO1xuICAgIGlmICghZmlyc3QpIHsgY29udGludWU7IH1cbiAgICBjb25zdCBwb3MwID0gZmlyc3QucGFydE9mU3BlZWNoWzBdO1xuICAgIGxldCBzZWFyY2hGb3JQYXJ0aWNsZXMgPSB0cnVlO1xuICAgIGlmIChidW5zZXRzdS5sZW5ndGggPiAxICYmIChwb3MwLnN0YXJ0c1dpdGgoJ3ZlcmInKSB8fCBwb3MwLmVuZHNXaXRoKCdfdmVyYicpIHx8IHBvczAuc3RhcnRzV2l0aCgnYWRqZWN0JykpKSB7XG4gICAgICBsZXQgaWdub3JlUmlnaHQgPSBmaWx0ZXJSaWdodChidW5zZXRzdSwgbSA9PiAhZ29vZE1vcnBoZW1lUHJlZGljYXRlKG0pKTtcbiAgICAgIGxldCBnb29kQnVuc2V0c3UgPSBpZ25vcmVSaWdodC5sZW5ndGggPT09IDAgPyBidW5zZXRzdSA6IGJ1bnNldHN1LnNsaWNlKDAsIC1pZ25vcmVSaWdodC5sZW5ndGgpO1xuICAgICAgaWYgKGdvb2RCdW5zZXRzdS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHNlYXJjaEZvclBhcnRpY2xlcyA9IGZhbHNlO1xuICAgICAgICBsZXQgY2xvemUgPSBidW5zZXRzdVRvU3RyaW5nKGdvb2RCdW5zZXRzdSk7XG4gICAgICAgIGxldCBsZWZ0ID0gYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gYnVuc2V0c3VUb1N0cmluZyhpZ25vcmVSaWdodCkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIGNsb3plLCByaWdodCksIGdvb2RCdW5zZXRzdSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIG9ubHkgYWRkIHBhcnRpY2xlcyBpZiB0aGV5J3JlIE5PVCBpbnNpZGUgY29uanVnYXRlZCBwaHJhc2VzXG4gICAgY29uc3QgcGFydGljbGVQcmVkaWNhdGUgPSAocDogTW9ycGhlbWUpID0+IHAucGFydE9mU3BlZWNoWzBdLnN0YXJ0c1dpdGgoJ3BhcnRpY2xlJykgJiYgcC5wYXJ0T2ZTcGVlY2gubGVuZ3RoID4gMSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhcC5wYXJ0T2ZTcGVlY2hbMV0uc3RhcnRzV2l0aCgncGhyYXNlX2ZpbmFsJyk7XG4gICAgaWYgKHNlYXJjaEZvclBhcnRpY2xlcykge1xuICAgICAgZm9yIChsZXQgW3BpZHgsIHBhcnRpY2xlXSBvZiBlbnVtZXJhdGUoYnVuc2V0c3UpKSB7XG4gICAgICAgIGlmIChwYXJ0aWNsZVByZWRpY2F0ZShwYXJ0aWNsZSkpIHtcbiAgICAgICAgICBsZXQgbGVmdCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJykgKyBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKDAsIHBpZHgpKTtcbiAgICAgICAgICBsZXQgcmlnaHQgPVxuICAgICAgICAgICAgICBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKHBpZHggKyAxKSkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgcGFydGljbGUubGl0ZXJhbCwgcmlnaHQpLCBbcGFydGljbGVdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBsZXQgZXhpc3RpbmdDbG96ZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldChbXSk7XG4gIGxldCBidWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGxldCBbY2xvemUsIGJ1bnNldHN1XSBvZiBsaXRlcmFsQ2xvemVzKSB7XG4gICAgaWYgKCFleGlzdGluZ0Nsb3plcy5oYXMoY2xvemUpKSB7XG4gICAgICBsZXQgYWNjZXB0YWJsZSA9IFtjbG96ZV07XG4gICAgICBpZiAoaGFzS2FuamkoYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdSkpKSB7XG4gICAgICAgIGFjY2VwdGFibGUucHVzaChrYXRhMmhpcmEoYnVuc2V0c3UubWFwKG0gPT4gbS5wcm9udW5jaWF0aW9uKS5qb2luKCcnKSkpXG4gICAgICB9XG4gICAgICBidWxsZXRzLnB1c2goJy0gQGZpbGwgJyArIGFjY2VwdGFibGUuam9pbignIEAgJykgK1xuICAgICAgICAgICAgICAgICAgIGAgICAgQHBvcyAke2J1bnNldHN1Lm1hcChtID0+IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKSkuam9pbignLycpfWApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYnVsbGV0cztcbn1cblxuY29uc3QgVVNBR0UgPSBgVVNBR0UgMTpcbiQgbm9kZSBbdGhpcy1zY3JpcHQuanNdIFttYXJrZG93bi5tZF1cblxuVVNBR0UgMjpcbiQgY2F0IFttYXJrZG93bi5tZF0gfCBub2RlIFt0aGlzLXNjcmlwdC5qc11cblxuQm90aCB3aWxsIHByaW50IGEgcGFyc2VkIHZlcnNpb24gb2YgdGhlIGlucHV0LmA7XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcHJvbWlzaWZ5ID0gcmVxdWlyZSgndXRpbCcpLnByb21pc2lmeTtcbiAgY29uc3QgcmVhZEZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnZnMnKS5yZWFkRmlsZSk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBjb25zdCB0ZXh0ID0gcHJvY2Vzcy5hcmd2WzJdID8gYXdhaXQgcmVhZEZpbGUocHJvY2Vzcy5hcmd2WzJdLCAndXRmOCcpIDogKChhd2FpdCBnZXRTdGRpbigpKSB8fCBVU0FHRSk7XG4gICAgLy8gU3BsaXQgTWFya2Rvd24gYXQgaGVhZGVyIChgIyBibGFibGFgKVxuICAgIGxldCBibG9ja3MgPSBzcGxpdEF0SGVhZGVycyh0ZXh0KTtcbiAgICAvLyBQYXJzZSBoZWFkZXJzXG4gICAgbGV0IGNvbnRlbnQgPSBhd2FpdCBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3MpO1xuICAgIC8vIFByaW50IHJlc3VsdFxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbnRlbnQubWFwKHYgPT4gdi5qb2luKCdcXG4nKSkuam9pbignXFxuJykpO1xuICB9KSgpO1xufSJdfQ==