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
                    // add furigana line
                    if (curtiz_utils_1.hasKanji(prompt)) {
                        const furigana = yield Promise.all(parsed.morphemes.map((m) => __awaiter(this, void 0, void 0, function* () {
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
                        block.splice(1, 0, `${FURIGANA_BLOCK} ${furigana.map(jmdict_furigana_node_1.furiganaToString).join('')}`);
                    }
                }
            }
        }
        return block;
    });
}
exports.parseHeaderBlock = parseHeaderBlock;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBOEU7QUFFOUUsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQWUsS0FBSyxDQUFDLFFBQWdCOztRQUNuQyxJQUFJLFFBQVEsR0FBRyxNQUFNLHlCQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxTQUFTLEdBQUcsdUNBQXlCLENBQUMsd0JBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxTQUFTLEdBQUcsTUFBTSxnQkFBUSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBQyxDQUFDO0lBQ2hDLENBQUM7Q0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQsU0FBc0Isb0JBQW9C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QUFDO1FBQ2xFLENBQUM7S0FBQSxDQUFDLEVBQUUsQ0FBQztDQUNOIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IHthZGRKZGVwcH0gZnJvbSAnLi9qZGVwcCc7XG5pbXBvcnQge2thdGEyaGlyYX0gZnJvbSAnLi9rYW5hJztcbmltcG9ydCB7Z29vZE1vcnBoZW1lUHJlZGljYXRlLCBpbnZva2VNZWNhYiwgbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcywgTW9ycGhlbWUsIHBhcnNlTWVjYWJ9IGZyb20gJy4vbWVjYWJVbmlkaWMnO1xuaW1wb3J0IHtlbnVtZXJhdGUsIGZpbHRlclJpZ2h0LCBmbGF0dGVuLCBoYXNLYW5qaSwgcGFydGl0aW9uQnksIHRha2VXaGlsZX0gZnJvbSAnY3VydGl6LXV0aWxzJztcbmltcG9ydCB7RW50cnksIGZ1cmlnYW5hVG9TdHJpbmcsIEZ1cmlnYW5hLCBzZXR1cH0gZnJvbSAnam1kaWN0LWZ1cmlnYW5hLW5vZGUnO1xuXG5jb25zdCBKbWRpY3RGdXJpZ2FuYSA9IHNldHVwKCk7XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlKHNlbnRlbmNlOiBzdHJpbmcpOiBQcm9taXNlPHttb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO30+IHtcbiAgbGV0IHJhd01lY2FiID0gYXdhaXQgaW52b2tlTWVjYWIoc2VudGVuY2UpO1xuICBsZXQgbW9ycGhlbWVzID0gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyhwYXJzZU1lY2FiKHNlbnRlbmNlLCByYXdNZWNhYilbMF0uZmlsdGVyKG8gPT4gISFvKSk7XG4gIGxldCBidW5zZXRzdXMgPSBhd2FpdCBhZGRKZGVwcChyYXdNZWNhYiwgbW9ycGhlbWVzKTtcbiAgcmV0dXJuIHttb3JwaGVtZXMsIGJ1bnNldHN1c307XG59XG5cbmNvbnN0IGJ1bnNldHN1VG9TdHJpbmcgPSAobW9ycGhlbWVzOiBNb3JwaGVtZVtdKSA9PiBtb3JwaGVtZXMubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNwbGl0QXRIZWFkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdW10ge1xuICBjb25zdCBoZWFkZXJSZSA9IC9eIytcXHMrLiskLztcbiAgcmV0dXJuIHBhcnRpdGlvbkJ5KHRleHQuc3BsaXQoJ1xcbicpLCBzID0+IGhlYWRlclJlLnRlc3QocykpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzOiBzdHJpbmdbXVtdLCBjb25jdXJyZW50TGltaXQ6IG51bWJlciA9IDgpIHtcbiAgbGV0IHJldDogc3RyaW5nW11bXSA9IFtdO1xuICBsZXQgcHJvbWlzZXM6IFByb21pc2U8c3RyaW5nW10+W10gPSBbXTtcbiAgZm9yIChsZXQgbyBvZiBibG9ja3MpIHtcbiAgICBpZiAocHJvbWlzZXMubGVuZ3RoID49IGNvbmN1cnJlbnRMaW1pdCkge1xuICAgICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gICAgICBwcm9taXNlcyA9IFtdO1xuICAgIH1cbiAgICBwcm9taXNlcy5wdXNoKHBhcnNlSGVhZGVyQmxvY2sobykpO1xuICB9XG4gIGlmIChwcm9taXNlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IFBMRUFTRV9QQVJTRV9CTE9DSyA9ICctIEBwbGVhc2VQYXJzZSc7XG5jb25zdCBGVVJJR0FOQV9CTE9DSyA9ICctIEBmdXJpZ2FuYSc7XG5cbmNvbnN0IGZsYXNoYWJsZU1vcnBoZW1lID0gKG06IE1vcnBoZW1lKSA9PiB7XG4gIGNvbnN0IHBvcyA9IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKTtcbiAgaWYgKGhhc0thbmppKG0ubGl0ZXJhbCkgJiYgIXBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgaWYgKHBvcy5zdGFydHNXaXRoKCd2ZXJiLWdlbmVyYWwnKSB8fCBwb3Muc3RhcnRzV2l0aCgnbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdwcm9ub3VuJykgfHxcbiAgICAgIHBvcy5zdGFydHNXaXRoKCdhZGplY3RpdicpIHx8IHBvcy5zdGFydHNXaXRoKCdhZHZlcmInKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5mdW5jdGlvbiBtb3JwaGVtZVRvUmVhZGluZyhtOiBNb3JwaGVtZSkge1xuICByZXR1cm4gaGFzS2FuamkobS5saXRlcmFsKSA/IGthdGEyaGlyYShtLmxpdGVyYWwgPT09IG0ubGVtbWEgPyBtLmxlbW1hUmVhZGluZyA6IG0ucHJvbnVuY2lhdGlvbikgOiBtLmxpdGVyYWw7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VIZWFkZXJCbG9jayhibG9jazogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IGF0SGVhZGVyUmUgPSAvXiMrXFxzK0BcXHMrLztcbiAgY29uc3QgbWF0Y2ggPSBibG9ja1swXS5tYXRjaChhdEhlYWRlclJlKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgbGluZSA9IGJsb2NrWzBdLnNsaWNlKG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgbGV0IFtwcm9tcHQsIHJlc3BvbnNlXSA9IGxpbmUuc3BsaXQoJ0AnKS5tYXAocyA9PiBzLnRyaW0oKSk7XG5cbiAgICAvLyBwcm9jZXNzIGxpbmUgYW5kIGJsb2NrLlxuICAgIGNvbnN0IGhhc1Jlc3BvbnNlID0gISFyZXNwb25zZTtcbiAgICBjb25zdCBoYXNQbGVhc2VQYXJzZSA9XG4gICAgICAgIHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgIGNvbnN0IGhhc0Z1cmlnYW5hID0gdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICBpZiAoIWhhc1Jlc3BvbnNlIHx8IGhhc1BsZWFzZVBhcnNlIHx8ICFoYXNGdXJpZ2FuYSkge1xuICAgICAgY29uc3QgcGFyc2VkID0gYXdhaXQgcGFyc2UobGluZSk7XG4gICAgICBpZiAoIWhhc1Jlc3BvbnNlKSB7XG4gICAgICAgIHJlc3BvbnNlID0ga2F0YTJoaXJhKGZsYXR0ZW4ocGFyc2VkLmJ1bnNldHN1cylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5maWx0ZXIobSA9PiBtLnBhcnRPZlNwZWVjaFswXSAhPT0gJ3N1cHBsZW1lbnRhcnlfc3ltYm9sJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5tYXAobW9ycGhlbWVUb1JlYWRpbmcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuam9pbignJykpO1xuICAgICAgICBibG9ja1swXSA9IGJsb2NrWzBdICsgJyBAICcgKyByZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIGlmIChoYXNQbGVhc2VQYXJzZSkge1xuICAgICAgICAvLyBhZGQgQGZsYXNoIGxpbmVzXG4gICAgICAgIGxldCBmbGFzaEJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGZvciAobGV0IFttaWR4LCBtb3JwaGVtZV0gb2YgZW51bWVyYXRlKHBhcnNlZC5tb3JwaGVtZXMpKSB7XG4gICAgICAgICAgaWYgKGZsYXNoYWJsZU1vcnBoZW1lKG1vcnBoZW1lKSkge1xuICAgICAgICAgICAgY29uc3QgbXByb21wdCA9IChtb3JwaGVtZS5wYXJ0T2ZTcGVlY2hbMV0gPT09ICdwcm9wZXInKSA/IG1vcnBoZW1lLmxpdGVyYWwgOiBtb3JwaGVtZS5sZW1tYTtcbiAgICAgICAgICAgIGNvbnN0IG1yZXNwb25zZSA9IChtb3JwaGVtZS5wYXJ0T2ZTcGVlY2hbMV0gPT09ICdwcm9wZXInKSA/IGthdGEyaGlyYShtb3JwaGVtZS5wcm9udW5jaWF0aW9uKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDoga2F0YTJoaXJhKG1vcnBoZW1lLmxlbW1hUmVhZGluZyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGxlZnQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKDAsIG1pZHgpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UobWlkeCArIDEpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBsZXQgY2xvemUgPSBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgbW9ycGhlbWUubGl0ZXJhbCwgcmlnaHQpO1xuICAgICAgICAgICAgbGV0IGZpbmFsID0gJyc7XG4gICAgICAgICAgICBpZiAobXByb21wdCA9PT0gbW9ycGhlbWUubGl0ZXJhbCAmJiBhcHBlYXJzRXhhY3RseU9uY2UocHJvbXB0LCBtb3JwaGVtZS5saXRlcmFsKSkge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfSAgICBAcG9zICR7bW9ycGhlbWUucGFydE9mU3BlZWNoLmpvaW4oJy0nKX1gO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gICAgQHBvcyAke21vcnBoZW1lLnBhcnRPZlNwZWVjaC5qb2luKCctJyl9IEBvbWl0ICR7Y2xvemV9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZsYXNoQnVsbGV0cy5wdXNoKGZpbmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmZsYXNoQnVsbGV0cyk7XG5cbiAgICAgICAgLy8gYWRkIEBmaWxsIGxpbmVzXG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5pZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIEBwbGVhc2VQYXJzZVxuICAgICAgICBibG9jayA9IGJsb2NrLmZpbHRlcihzID0+ICFzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgICB9XG4gICAgICBpZiAoIWhhc0Z1cmlnYW5hKSB7XG4gICAgICAgIC8vIGFkZCBmdXJpZ2FuYSBsaW5lXG4gICAgICAgIGlmIChoYXNLYW5qaShwcm9tcHQpKSB7XG4gICAgICAgICAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKHBhcnNlZC5tb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgICAgICAgICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICAgICAgICAgIGlmIChoYXNLYW5qaShsaXRlcmFsKSkge1xuICAgICAgICAgICAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICAgICAgICAgIGNvbnN0IGxpdGVyYWxIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxpdGVyYWwsICdyZWFkaW5nJywgcHJvbnVuY2lhdGlvbik7XG4gICAgICAgICAgICAgIGlmIChsaXRlcmFsSGl0KSB7IHJldHVybiBsaXRlcmFsSGl0LmZ1cmlnYW5hOyB9XG4gICAgICAgICAgICAgIGNvbnN0IHByb251bmNpYXRpb25IaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIHByb251bmNpYXRpb24sICd0ZXh0JywgbGl0ZXJhbCk7XG4gICAgICAgICAgICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAgICAgICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICAgICAgICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZ1cmlnYW5hRGljdDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGYgb2YgbGVtbWFIaXQuZnVyaWdhbmEpIHtcbiAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgICAgICAgICAgIGZ1cmlnYW5hRGljdC5zZXQoZi5ydWJ5LCBmLnJ0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgICAgICAgICAgIGxldCBrYW5qaSA9IGNoYXJzLmZpbHRlcihoYXNLYW5qaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYW5ub3RhdGVkQ2hhcnM6IEZ1cmlnYW5hW10gPSBjaGFycy5zbGljZSgpO1xuXG4gICAgICAgICAgICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICAgICAgICAgICAgd2hpbGUgKGthbmppLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgY29uc3QgaGl0ID0gdHJpdShrYW5qaSkuZmluZChrcyA9PiBmdXJpZ2FuYURpY3QuaGFzKGtzLmpvaW4oJycpKSk7XG4gICAgICAgICAgICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhpdHN0ciA9IGhpdC5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gbGl0ZXJhbC5pbmRleE9mKGhpdHN0cik7XG4gICAgICAgICAgICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpZHggKyAxOyBpIDwgaWR4ICsgaGl0c3RyLmxlbmd0aDsgaSsrKSB7IGFubm90YXRlZENoYXJzW2ldID0gJyc7IH1cbiAgICAgICAgICAgICAgICAgICAga2FuamkgPSBrYW5qaS5zbGljZShoaXRzdHIubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFubm90YXRlZENoYXJzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAgICAgICAgICAgLy8gaWYgKGxlbW1hUmVhZGluZ0hpdCkgeyByZXR1cm4gbGVtbWFSZWFkaW5nSGl0LmZ1cmlnYW5hOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW2hhc0thbmppKGxpdGVyYWwpID8ge3J1Ynk6IGxpdGVyYWwsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsaXRlcmFsXTtcbiAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgYCR7RlVSSUdBTkFfQkxPQ0t9ICR7ZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpfWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBibG9jaztcbn1cblxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIHNlYXJjaChtYXA6IE1hcDxzdHJpbmcsIEVudHJ5W10+LCBmaXJzdDogc3RyaW5nLCBzdWI6ICdyZWFkaW5nJ3wndGV4dCcsIHNlY29uZDogc3RyaW5nKTogRW50cnl8dW5kZWZpbmVkIHtcbiAgY29uc3QgaGl0ID0gbWFwLmdldChmaXJzdCk7XG4gIGlmIChoaXQpIHtcbiAgICBpZiAoaGl0Lmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gaGl0WzBdOyB9XG4gICAgY29uc3Qgc3ViaGl0ID0gaGl0LmZpbmQoZSA9PiBrYXRhMmhpcmEoZVtzdWJdKSA9PT0ga2F0YTJoaXJhKHNlY29uZCkpO1xuICAgIGlmIChzdWJoaXQpIHsgcmV0dXJuIHN1YmhpdDsgfVxuICAgIGNvbnNvbGUuZXJyb3IoYGZvdW5kIGhpdCBmb3IgJHtmaXJzdH0gYnV0IG5vdCAke3NlY29uZH1gLCB7aGl0fSk7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbmVlZGxlIGlzIGZvdW5kIGluIGhheXN0YWNrIG9ubHkgb25jZVxuICogQHBhcmFtIGhheXN0YWNrIGJpZyBzdHJpbmdcbiAqIEBwYXJhbSBuZWVkbGUgbGl0dGxlIHN0cmluZ1xuICovXG5mdW5jdGlvbiBhcHBlYXJzRXhhY3RseU9uY2UoaGF5c3RhY2s6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgbGV0IGhpdDogbnVtYmVyO1xuICByZXR1cm4gKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlKSkgPj0gMCAmJiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGhpdCArIDEpKSA8IDA7XG59XG4vKipcbiAqIEdpdmVuIHRocmVlIGNvbnNlY3V0aWVzIHN1YnN0cmluZ3MgKHRoZSBhcmd1bWVudHMpLCByZXR1cm4gZWl0aGVyXG4gKiAtIGAke2xlZnQyfVske2Nsb3plfV0ke3JpZ2h0Mn1gIHdoZXJlIGBsZWZ0MmAgYW5kIGByaWdodDJgIGFyZSBhcyBzaG9ydCBhcyBwb3NzaWJsZSAoYW5kIG9mIGVxdWFsIGxlbmd0aCwgaWZcbiAqICAgIHBvc3NpYmxlKSBzbyB0aGUgdGhpcyByZXR1cm4gc3RyaW5nIChtaW51cyB0aGUgYnJhY2tldHMpIGlzIHVuaXF1ZSBpbiB0aGUgZnVsbCBzdHJpbmcsIG9yXG4gKiAtIGAke2Nsb3plfWAgaWYgYGxlZnQyID09PSByaWdodDIgPT09ICcnYCAoaS5lLiwgdGhlIGFib3ZlIGJ1dCB3aXRob3V0IHRoZSBicmFja2V0cykuXG4gKiBAcGFyYW0gbGVmdCBsZWZ0IHN0cmluZywgcG9zc2libHkgZW1wdHlcbiAqIEBwYXJhbSBjbG96ZSBtaWRkbGUgc3RyaW5nXG4gKiBAcGFyYW0gcmlnaHQgcmlnaHQgc3RyaW5nLCBwb3NzaWJsZSBlbXB0eVxuICogQHRocm93cyBpbiB0aGUgdW5saWtlbHkgZXZlbnQgdGhhdCBzdWNoIGEgcmV0dXJuIHN0cmluZyBjYW5ub3QgYmUgYnVpbGQgKEkgY2Fubm90IHRoaW5rIG9mIGFuIGV4YW1wbGUgdGhvdWdoKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdDogc3RyaW5nLCBjbG96ZTogc3RyaW5nLCByaWdodDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VudGVuY2UgPSBsZWZ0ICsgY2xvemUgKyByaWdodDtcbiAgbGV0IGxlZnRDb250ZXh0ID0gJyc7XG4gIGxldCByaWdodENvbnRleHQgPSAnJztcbiAgbGV0IGNvbnRleHRMZW5ndGggPSAwO1xuICB3aGlsZSAoIWFwcGVhcnNFeGFjdGx5T25jZShzZW50ZW5jZSwgbGVmdENvbnRleHQgKyBjbG96ZSArIHJpZ2h0Q29udGV4dCkpIHtcbiAgICBjb250ZXh0TGVuZ3RoKys7XG4gICAgaWYgKGNvbnRleHRMZW5ndGggPj0gbGVmdC5sZW5ndGggJiYgY29udGV4dExlbmd0aCA+PSByaWdodC5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmFuIG91dCBvZiBjb250ZXh0IHRvIGJ1aWxkIHVuaXF1ZSBjbG96ZScpO1xuICAgIH1cbiAgICBsZWZ0Q29udGV4dCA9IGxlZnQuc2xpY2UoLWNvbnRleHRMZW5ndGgpO1xuICAgIHJpZ2h0Q29udGV4dCA9IHJpZ2h0LnNsaWNlKDAsIGNvbnRleHRMZW5ndGgpO1xuICB9XG4gIGlmIChsZWZ0Q29udGV4dCA9PT0gJycgJiYgcmlnaHRDb250ZXh0ID09PSAnJykgeyByZXR1cm4gY2xvemU7IH1cbiAgcmV0dXJuIGAke2xlZnRDb250ZXh0fVske2Nsb3plfV0ke3JpZ2h0Q29udGV4dH1gO1xufVxuXG5mdW5jdGlvbiBpZGVudGlmeUZpbGxJbkJsYW5rcyhidW5zZXRzdXM6IE1vcnBoZW1lW11bXSkge1xuICAvLyBGaW5kIGNsb3plczogcGFydGljbGVzIGFuZCBjb25qdWdhdGVkIHZlcmIvYWRqZWN0aXZlIHBocmFzZXNcbiAgbGV0IGxpdGVyYWxDbG96ZXM6IE1hcDxzdHJpbmcsIE1vcnBoZW1lW10+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IFtiaWR4LCBidW5zZXRzdV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1cykpIHtcbiAgICBsZXQgZmlyc3QgPSBidW5zZXRzdVswXTtcbiAgICBpZiAoIWZpcnN0KSB7IGNvbnRpbnVlOyB9XG4gICAgY29uc3QgcG9zMCA9IGZpcnN0LnBhcnRPZlNwZWVjaFswXTtcbiAgICBsZXQgc2VhcmNoRm9yUGFydGljbGVzID0gdHJ1ZTtcbiAgICBpZiAoYnVuc2V0c3UubGVuZ3RoID4gMSAmJiAocG9zMC5zdGFydHNXaXRoKCd2ZXJiJykgfHwgcG9zMC5lbmRzV2l0aCgnX3ZlcmInKSB8fCBwb3MwLnN0YXJ0c1dpdGgoJ2FkamVjdCcpKSkge1xuICAgICAgbGV0IGlnbm9yZVJpZ2h0ID0gZmlsdGVyUmlnaHQoYnVuc2V0c3UsIG0gPT4gIWdvb2RNb3JwaGVtZVByZWRpY2F0ZShtKSk7XG4gICAgICBsZXQgZ29vZEJ1bnNldHN1ID0gaWdub3JlUmlnaHQubGVuZ3RoID09PSAwID8gYnVuc2V0c3UgOiBidW5zZXRzdS5zbGljZSgwLCAtaWdub3JlUmlnaHQubGVuZ3RoKTtcbiAgICAgIGlmIChnb29kQnVuc2V0c3UubGVuZ3RoID4gMSkge1xuICAgICAgICBzZWFyY2hGb3JQYXJ0aWNsZXMgPSBmYWxzZTtcbiAgICAgICAgbGV0IGNsb3plID0gYnVuc2V0c3VUb1N0cmluZyhnb29kQnVuc2V0c3UpO1xuICAgICAgICBsZXQgbGVmdCA9IGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxldCByaWdodCA9IGJ1bnNldHN1VG9TdHJpbmcoaWdub3JlUmlnaHQpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBjbG96ZSwgcmlnaHQpLCBnb29kQnVuc2V0c3UpO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBvbmx5IGFkZCBwYXJ0aWNsZXMgaWYgdGhleSdyZSBOT1QgaW5zaWRlIGNvbmp1Z2F0ZWQgcGhyYXNlc1xuICAgIGNvbnN0IHBhcnRpY2xlUHJlZGljYXRlID0gKHA6IE1vcnBoZW1lKSA9PiBwLnBhcnRPZlNwZWVjaFswXS5zdGFydHNXaXRoKCdwYXJ0aWNsZScpICYmIHAucGFydE9mU3BlZWNoLmxlbmd0aCA+IDEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXAucGFydE9mU3BlZWNoWzFdLnN0YXJ0c1dpdGgoJ3BocmFzZV9maW5hbCcpO1xuICAgIGlmIChzZWFyY2hGb3JQYXJ0aWNsZXMpIHtcbiAgICAgIGZvciAobGV0IFtwaWR4LCBwYXJ0aWNsZV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1KSkge1xuICAgICAgICBpZiAocGFydGljbGVQcmVkaWNhdGUocGFydGljbGUpKSB7XG4gICAgICAgICAgbGV0IGxlZnQgPVxuICAgICAgICAgICAgICBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpICsgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZSgwLCBwaWR4KSk7XG4gICAgICAgICAgbGV0IHJpZ2h0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZShwaWR4ICsgMSkpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIHBhcnRpY2xlLmxpdGVyYWwsIHJpZ2h0KSwgW3BhcnRpY2xlXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgbGV0IGV4aXN0aW5nQ2xvemVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW10pO1xuICBsZXQgYnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgW2Nsb3plLCBidW5zZXRzdV0gb2YgbGl0ZXJhbENsb3plcykge1xuICAgIGlmICghZXhpc3RpbmdDbG96ZXMuaGFzKGNsb3plKSkge1xuICAgICAgbGV0IGFjY2VwdGFibGUgPSBbY2xvemVdO1xuICAgICAgaWYgKGhhc0thbmppKGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3UpKSkge1xuICAgICAgICBhY2NlcHRhYmxlLnB1c2goa2F0YTJoaXJhKGJ1bnNldHN1Lm1hcChtID0+IG0ucHJvbnVuY2lhdGlvbikuam9pbignJykpKVxuICAgICAgfVxuICAgICAgYnVsbGV0cy5wdXNoKCctIEBmaWxsICcgKyBhY2NlcHRhYmxlLmpvaW4oJyBAICcpICtcbiAgICAgICAgICAgICAgICAgICBgICAgIEBwb3MgJHtidW5zZXRzdS5tYXAobSA9PiBtLnBhcnRPZlNwZWVjaC5qb2luKCctJykpLmpvaW4oJy8nKX1gKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ1bGxldHM7XG59XG5cbmNvbnN0IFVTQUdFID0gYFVTQUdFIDE6XG4kIG5vZGUgW3RoaXMtc2NyaXB0LmpzXSBbbWFya2Rvd24ubWRdXG5cblVTQUdFIDI6XG4kIGNhdCBbbWFya2Rvd24ubWRdIHwgbm9kZSBbdGhpcy1zY3JpcHQuanNdXG5cbkJvdGggd2lsbCBwcmludCBhIHBhcnNlZCB2ZXJzaW9uIG9mIHRoZSBpbnB1dC5gO1xuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IHJlYWRGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2ZzJykucmVhZEZpbGUpO1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgY29uc3QgdGV4dCA9IHByb2Nlc3MuYXJndlsyXSA/IGF3YWl0IHJlYWRGaWxlKHByb2Nlc3MuYXJndlsyXSwgJ3V0ZjgnKSA6ICgoYXdhaXQgZ2V0U3RkaW4oKSkgfHwgVVNBR0UpO1xuICAgIC8vIFNwbGl0IE1hcmtkb3duIGF0IGhlYWRlciAoYCMgYmxhYmxhYClcbiAgICBsZXQgYmxvY2tzID0gc3BsaXRBdEhlYWRlcnModGV4dCk7XG4gICAgLy8gUGFyc2UgaGVhZGVyc1xuICAgIGxldCBjb250ZW50ID0gYXdhaXQgcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzKTtcbiAgICAvLyBQcmludCByZXN1bHRcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb250ZW50Lm1hcCh2ID0+IHYuam9pbignXFxuJykpLmpvaW4oJ1xcbicpKTtcbiAgfSkoKTtcbn0iXX0=