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
            if (!hasResponse || hasPleaseParse) {
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
                        block.splice(1, 0, `- @furigana ${furigana.map(furiganaToString).join('')}`);
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
function furiganaToString(fs) {
    // const pad = (s: string) => s.length === 1 ? s : `{${s}}`;
    return fs.map(f => typeof f === 'string' ? f : `{${f.ruby}}^{${f.rt}}`).join('');
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
            console.log(content.map(v => v.join('\n')).join('\n'));
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUFvRztBQUNwRywrREFBa0U7QUFFbEUsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQWUsS0FBSyxDQUFDLFFBQWdCOztRQUNuQyxJQUFJLFFBQVEsR0FBRyxNQUFNLHlCQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxTQUFTLEdBQUcsdUNBQXlCLENBQUMsd0JBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxTQUFTLEdBQUcsTUFBTSxnQkFBUSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBQyxDQUFDO0lBQ2hDLENBQUM7Q0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQsU0FBc0Isb0JBQW9C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IiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCB7YWRkSmRlcHB9IGZyb20gJy4vamRlcHAnO1xuaW1wb3J0IHtrYXRhMmhpcmF9IGZyb20gJy4va2FuYSc7XG5pbXBvcnQge2dvb2RNb3JwaGVtZVByZWRpY2F0ZSwgaW52b2tlTWVjYWIsIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXMsIE1vcnBoZW1lLCBwYXJzZU1lY2FifSBmcm9tICcuL21lY2FiVW5pZGljJztcbmltcG9ydCB7ZW51bWVyYXRlLCBmaWx0ZXJSaWdodCwgZmxhdHRlbiwgaGFzS2FuamksIHBhcnRpdGlvbkJ5LCB0YWtlV2hpbGUsIHppcH0gZnJvbSAnY3VydGl6LXV0aWxzJztcbmltcG9ydCB7RW50cnksIFJ1YnksIEZ1cmlnYW5hLCBzZXR1cH0gZnJvbSAnam1kaWN0LWZ1cmlnYW5hLW5vZGUnO1xuXG5jb25zdCBKbWRpY3RGdXJpZ2FuYSA9IHNldHVwKCk7XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlKHNlbnRlbmNlOiBzdHJpbmcpOiBQcm9taXNlPHttb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO30+IHtcbiAgbGV0IHJhd01lY2FiID0gYXdhaXQgaW52b2tlTWVjYWIoc2VudGVuY2UpO1xuICBsZXQgbW9ycGhlbWVzID0gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyhwYXJzZU1lY2FiKHNlbnRlbmNlLCByYXdNZWNhYilbMF0uZmlsdGVyKG8gPT4gISFvKSk7XG4gIGxldCBidW5zZXRzdXMgPSBhd2FpdCBhZGRKZGVwcChyYXdNZWNhYiwgbW9ycGhlbWVzKTtcbiAgcmV0dXJuIHttb3JwaGVtZXMsIGJ1bnNldHN1c307XG59XG5cbmNvbnN0IGJ1bnNldHN1VG9TdHJpbmcgPSAobW9ycGhlbWVzOiBNb3JwaGVtZVtdKSA9PiBtb3JwaGVtZXMubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNwbGl0QXRIZWFkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdW10ge1xuICBjb25zdCBoZWFkZXJSZSA9IC9eIytcXHMrLiskLztcbiAgcmV0dXJuIHBhcnRpdGlvbkJ5KHRleHQuc3BsaXQoJ1xcbicpLCBzID0+IGhlYWRlclJlLnRlc3QocykpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzOiBzdHJpbmdbXVtdLCBjb25jdXJyZW50TGltaXQ6IG51bWJlciA9IDgpIHtcbiAgbGV0IHJldDogc3RyaW5nW11bXSA9IFtdO1xuICBsZXQgcHJvbWlzZXM6IFByb21pc2U8c3RyaW5nW10+W10gPSBbXTtcbiAgZm9yIChsZXQgbyBvZiBibG9ja3MpIHtcbiAgICBpZiAocHJvbWlzZXMubGVuZ3RoID49IGNvbmN1cnJlbnRMaW1pdCkge1xuICAgICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gICAgICBwcm9taXNlcyA9IFtdO1xuICAgIH1cbiAgICBwcm9taXNlcy5wdXNoKHBhcnNlSGVhZGVyQmxvY2sobykpO1xuICB9XG4gIGlmIChwcm9taXNlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IFBMRUFTRV9QQVJTRV9CTE9DSyA9ICctIEBwbGVhc2VQYXJzZSc7XG5cbmNvbnN0IGZsYXNoYWJsZU1vcnBoZW1lID0gKG06IE1vcnBoZW1lKSA9PiB7XG4gIGNvbnN0IHBvcyA9IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKTtcbiAgaWYgKGhhc0thbmppKG0ubGl0ZXJhbCkgJiYgIXBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgaWYgKHBvcy5zdGFydHNXaXRoKCd2ZXJiLWdlbmVyYWwnKSB8fCBwb3Muc3RhcnRzV2l0aCgnbm91bicpIHx8IHBvcy5zdGFydHNXaXRoKCdwcm9ub3VuJykgfHxcbiAgICAgIHBvcy5zdGFydHNXaXRoKCdhZGplY3RpdicpIHx8IHBvcy5zdGFydHNXaXRoKCdhZHZlcmInKSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5mdW5jdGlvbiBtb3JwaGVtZVRvUmVhZGluZyhtOiBNb3JwaGVtZSkge1xuICByZXR1cm4gaGFzS2FuamkobS5saXRlcmFsKSA/IGthdGEyaGlyYShtLmxpdGVyYWwgPT09IG0ubGVtbWEgPyBtLmxlbW1hUmVhZGluZyA6IG0ucHJvbnVuY2lhdGlvbikgOiBtLmxpdGVyYWw7XG59XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VIZWFkZXJCbG9jayhibG9jazogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPiB7XG4gIGNvbnN0IGF0SGVhZGVyUmUgPSAvXiMrXFxzK0BcXHMrLztcbiAgY29uc3QgbWF0Y2ggPSBibG9ja1swXS5tYXRjaChhdEhlYWRlclJlKTtcbiAgaWYgKG1hdGNoKSB7XG4gICAgY29uc3QgbGluZSA9IGJsb2NrWzBdLnNsaWNlKG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgbGV0IFtwcm9tcHQsIHJlc3BvbnNlXSA9IGxpbmUuc3BsaXQoJ0AnKS5tYXAocyA9PiBzLnRyaW0oKSk7XG5cbiAgICAvLyBwcm9jZXNzIGxpbmUgYW5kIGJsb2NrLlxuICAgIGNvbnN0IGhhc1Jlc3BvbnNlID0gISFyZXNwb25zZTtcbiAgICBjb25zdCBoYXNQbGVhc2VQYXJzZSA9XG4gICAgICAgIHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuICAgIGlmICghaGFzUmVzcG9uc2UgfHwgaGFzUGxlYXNlUGFyc2UpIHtcbiAgICAgIGNvbnN0IHBhcnNlZCA9IGF3YWl0IHBhcnNlKGxpbmUpO1xuICAgICAgaWYgKCFoYXNSZXNwb25zZSkge1xuICAgICAgICByZXNwb25zZSA9IGthdGEyaGlyYShmbGF0dGVuKHBhcnNlZC5idW5zZXRzdXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKG0gPT4gbS5wYXJ0T2ZTcGVlY2hbMF0gIT09ICdzdXBwbGVtZW50YXJ5X3N5bWJvbCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKG1vcnBoZW1lVG9SZWFkaW5nKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmpvaW4oJycpKTtcbiAgICAgICAgYmxvY2tbMF0gPSBibG9ja1swXSArICcgQCAnICsgcmVzcG9uc2U7XG4gICAgICB9XG4gICAgICBpZiAoaGFzUGxlYXNlUGFyc2UpIHtcbiAgICAgICAgLy8gYWRkIEBmbGFzaCBsaW5lc1xuICAgICAgICBsZXQgZmxhc2hCdWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBbbWlkeCwgbW9ycGhlbWVdIG9mIGVudW1lcmF0ZShwYXJzZWQubW9ycGhlbWVzKSkge1xuICAgICAgICAgIGlmIChmbGFzaGFibGVNb3JwaGVtZShtb3JwaGVtZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IG1wcm9tcHQgPSAobW9ycGhlbWUucGFydE9mU3BlZWNoWzFdID09PSAncHJvcGVyJykgPyBtb3JwaGVtZS5saXRlcmFsIDogbW9ycGhlbWUubGVtbWE7XG4gICAgICAgICAgICBjb25zdCBtcmVzcG9uc2UgPSAobW9ycGhlbWUucGFydE9mU3BlZWNoWzFdID09PSAncHJvcGVyJykgPyBrYXRhMmhpcmEobW9ycGhlbWUucHJvbnVuY2lhdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGthdGEyaGlyYShtb3JwaGVtZS5sZW1tYVJlYWRpbmcpO1xuXG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZSgwLCBtaWR4KS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgcmlnaHQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKG1pZHggKyAxKS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgbGV0IGNsb3plID0gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIG1vcnBoZW1lLmxpdGVyYWwsIHJpZ2h0KTtcbiAgICAgICAgICAgIGxldCBmaW5hbCA9ICcnO1xuICAgICAgICAgICAgaWYgKG1wcm9tcHQgPT09IG1vcnBoZW1lLmxpdGVyYWwgJiYgYXBwZWFyc0V4YWN0bHlPbmNlKHByb21wdCwgbW9ycGhlbWUubGl0ZXJhbCkpIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gICAgQHBvcyAke21vcnBoZW1lLnBhcnRPZlNwZWVjaC5qb2luKCctJyl9YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9ICAgIEBwb3MgJHttb3JwaGVtZS5wYXJ0T2ZTcGVlY2guam9pbignLScpfSBAb21pdCAke2Nsb3plfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmbGFzaEJ1bGxldHMucHVzaChmaW5hbCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5mbGFzaEJ1bGxldHMpO1xuXG4gICAgICAgIC8vIGFkZCBAZmlsbCBsaW5lc1xuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uaWRlbnRpZnlGaWxsSW5CbGFua3MocGFyc2VkLmJ1bnNldHN1cykpO1xuXG4gICAgICAgIC8vIHJlbW92ZSBAcGxlYXNlUGFyc2VcbiAgICAgICAgYmxvY2sgPSBibG9jay5maWx0ZXIocyA9PiAhcy5zdGFydHNXaXRoKFBMRUFTRV9QQVJTRV9CTE9DSykpO1xuXG4gICAgICAgIC8vIGFkZCBmdXJpZ2FuYSBsaW5lXG4gICAgICAgIGlmIChoYXNLYW5qaShwcm9tcHQpKSB7XG4gICAgICAgICAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKHBhcnNlZC5tb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgICAgICAgICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICAgICAgICAgIGlmIChoYXNLYW5qaShsaXRlcmFsKSkge1xuICAgICAgICAgICAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICAgICAgICAgIGNvbnN0IGxpdGVyYWxIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxpdGVyYWwsICdyZWFkaW5nJywgcHJvbnVuY2lhdGlvbik7XG4gICAgICAgICAgICAgIGlmIChsaXRlcmFsSGl0KSB7IHJldHVybiBsaXRlcmFsSGl0LmZ1cmlnYW5hOyB9XG4gICAgICAgICAgICAgIGNvbnN0IHByb251bmNpYXRpb25IaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIHByb251bmNpYXRpb24sICd0ZXh0JywgbGl0ZXJhbCk7XG4gICAgICAgICAgICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAgICAgICAgICAgY29uc3QgbGVtbWFIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxlbW1hLCAncmVhZGluZycsIGxlbW1hUmVhZGluZyk7XG4gICAgICAgICAgICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZ1cmlnYW5hRGljdDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGYgb2YgbGVtbWFIaXQuZnVyaWdhbmEpIHtcbiAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgICAgICAgICAgIGZ1cmlnYW5hRGljdC5zZXQoZi5ydWJ5LCBmLnJ0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgICAgICAgICAgIGxldCBrYW5qaSA9IGNoYXJzLmZpbHRlcihoYXNLYW5qaSk7XG4gICAgICAgICAgICAgICAgY29uc3QgYW5ub3RhdGVkQ2hhcnM6IEZ1cmlnYW5hW10gPSBjaGFycy5zbGljZSgpO1xuXG4gICAgICAgICAgICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICAgICAgICAgICAgd2hpbGUgKGthbmppLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgY29uc3QgaGl0ID0gdHJpdShrYW5qaSkuZmluZChrcyA9PiBmdXJpZ2FuYURpY3QuaGFzKGtzLmpvaW4oJycpKSk7XG4gICAgICAgICAgICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhpdHN0ciA9IGhpdC5qb2luKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaWR4ID0gbGl0ZXJhbC5pbmRleE9mKGhpdHN0cik7XG4gICAgICAgICAgICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgICAgICAgICAgIGZvciAobGV0IGkgPSBpZHggKyAxOyBpIDwgaWR4ICsgaGl0c3RyLmxlbmd0aDsgaSsrKSB7IGFubm90YXRlZENoYXJzW2ldID0gJyc7IH1cbiAgICAgICAgICAgICAgICAgICAga2FuamkgPSBrYW5qaS5zbGljZShoaXRzdHIubGVuZ3RoKTtcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGFubm90YXRlZENoYXJzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAgICAgICAgICAgLy8gaWYgKGxlbW1hUmVhZGluZ0hpdCkgeyByZXR1cm4gbGVtbWFSZWFkaW5nSGl0LmZ1cmlnYW5hOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gW2hhc0thbmppKGxpdGVyYWwpID8ge3J1Ynk6IGxpdGVyYWwsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsaXRlcmFsXTtcbiAgICAgICAgICB9KSk7XG5cbiAgICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgYC0gQGZ1cmlnYW5hICR7ZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpfWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBibG9jaztcbn1cblxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5mdW5jdGlvbiBmdXJpZ2FuYVRvU3RyaW5nKGZzOiBGdXJpZ2FuYVtdKSB7XG4gIC8vIGNvbnN0IHBhZCA9IChzOiBzdHJpbmcpID0+IHMubGVuZ3RoID09PSAxID8gcyA6IGB7JHtzfX1gO1xuICByZXR1cm4gZnMubWFwKGYgPT4gdHlwZW9mIGYgPT09ICdzdHJpbmcnID8gZiA6IGB7JHtmLnJ1Ynl9fV57JHtmLnJ0fX1gKS5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gc2VhcmNoKG1hcDogTWFwPHN0cmluZywgRW50cnlbXT4sIGZpcnN0OiBzdHJpbmcsIHN1YjogJ3JlYWRpbmcnfCd0ZXh0Jywgc2Vjb25kOiBzdHJpbmcpOiBFbnRyeXx1bmRlZmluZWQge1xuICBjb25zdCBoaXQgPSBtYXAuZ2V0KGZpcnN0KTtcbiAgaWYgKGhpdCkge1xuICAgIGlmIChoaXQubGVuZ3RoID09PSAxKSB7IHJldHVybiBoaXRbMF07IH1cbiAgICBjb25zdCBzdWJoaXQgPSBoaXQuZmluZChlID0+IGthdGEyaGlyYShlW3N1Yl0pID09PSBrYXRhMmhpcmEoc2Vjb25kKSk7XG4gICAgaWYgKHN1YmhpdCkgeyByZXR1cm4gc3ViaGl0OyB9XG4gICAgY29uc29sZS5lcnJvcihgZm91bmQgaGl0IGZvciAke2ZpcnN0fSBidXQgbm90ICR7c2Vjb25kfWAsIHtoaXR9KTtcbiAgfVxufVxuXG4vKipcbiAqIEVuc3VyZSBuZWVkbGUgaXMgZm91bmQgaW4gaGF5c3RhY2sgb25seSBvbmNlXG4gKiBAcGFyYW0gaGF5c3RhY2sgYmlnIHN0cmluZ1xuICogQHBhcmFtIG5lZWRsZSBsaXR0bGUgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIGFwcGVhcnNFeGFjdGx5T25jZShoYXlzdGFjazogc3RyaW5nLCBuZWVkbGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBsZXQgaGl0OiBudW1iZXI7XG4gIHJldHVybiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpKSA+PSAwICYmIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSwgaGl0ICsgMSkpIDwgMDtcbn1cbi8qKlxuICogR2l2ZW4gdGhyZWUgY29uc2VjdXRpZXMgc3Vic3RyaW5ncyAodGhlIGFyZ3VtZW50cyksIHJldHVybiBlaXRoZXJcbiAqIC0gYCR7bGVmdDJ9WyR7Y2xvemV9XSR7cmlnaHQyfWAgd2hlcmUgYGxlZnQyYCBhbmQgYHJpZ2h0MmAgYXJlIGFzIHNob3J0IGFzIHBvc3NpYmxlIChhbmQgb2YgZXF1YWwgbGVuZ3RoLCBpZlxuICogICAgcG9zc2libGUpIHNvIHRoZSB0aGlzIHJldHVybiBzdHJpbmcgKG1pbnVzIHRoZSBicmFja2V0cykgaXMgdW5pcXVlIGluIHRoZSBmdWxsIHN0cmluZywgb3JcbiAqIC0gYCR7Y2xvemV9YCBpZiBgbGVmdDIgPT09IHJpZ2h0MiA9PT0gJydgIChpLmUuLCB0aGUgYWJvdmUgYnV0IHdpdGhvdXQgdGhlIGJyYWNrZXRzKS5cbiAqIEBwYXJhbSBsZWZ0IGxlZnQgc3RyaW5nLCBwb3NzaWJseSBlbXB0eVxuICogQHBhcmFtIGNsb3plIG1pZGRsZSBzdHJpbmdcbiAqIEBwYXJhbSByaWdodCByaWdodCBzdHJpbmcsIHBvc3NpYmxlIGVtcHR5XG4gKiBAdGhyb3dzIGluIHRoZSB1bmxpa2VseSBldmVudCB0aGF0IHN1Y2ggYSByZXR1cm4gc3RyaW5nIGNhbm5vdCBiZSBidWlsZCAoSSBjYW5ub3QgdGhpbmsgb2YgYW4gZXhhbXBsZSB0aG91Z2gpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0OiBzdHJpbmcsIGNsb3plOiBzdHJpbmcsIHJpZ2h0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBzZW50ZW5jZSA9IGxlZnQgKyBjbG96ZSArIHJpZ2h0O1xuICBsZXQgbGVmdENvbnRleHQgPSAnJztcbiAgbGV0IHJpZ2h0Q29udGV4dCA9ICcnO1xuICBsZXQgY29udGV4dExlbmd0aCA9IDA7XG4gIHdoaWxlICghYXBwZWFyc0V4YWN0bHlPbmNlKHNlbnRlbmNlLCBsZWZ0Q29udGV4dCArIGNsb3plICsgcmlnaHRDb250ZXh0KSkge1xuICAgIGNvbnRleHRMZW5ndGgrKztcbiAgICBpZiAoY29udGV4dExlbmd0aCA+PSBsZWZ0Lmxlbmd0aCAmJiBjb250ZXh0TGVuZ3RoID49IHJpZ2h0Lmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW4gb3V0IG9mIGNvbnRleHQgdG8gYnVpbGQgdW5pcXVlIGNsb3plJyk7XG4gICAgfVxuICAgIGxlZnRDb250ZXh0ID0gbGVmdC5zbGljZSgtY29udGV4dExlbmd0aCk7XG4gICAgcmlnaHRDb250ZXh0ID0gcmlnaHQuc2xpY2UoMCwgY29udGV4dExlbmd0aCk7XG4gIH1cbiAgaWYgKGxlZnRDb250ZXh0ID09PSAnJyAmJiByaWdodENvbnRleHQgPT09ICcnKSB7IHJldHVybiBjbG96ZTsgfVxuICByZXR1cm4gYCR7bGVmdENvbnRleHR9WyR7Y2xvemV9XSR7cmlnaHRDb250ZXh0fWA7XG59XG5cbmZ1bmN0aW9uIGlkZW50aWZ5RmlsbEluQmxhbmtzKGJ1bnNldHN1czogTW9ycGhlbWVbXVtdKSB7XG4gIC8vIEZpbmQgY2xvemVzOiBwYXJ0aWNsZXMgYW5kIGNvbmp1Z2F0ZWQgdmVyYi9hZGplY3RpdmUgcGhyYXNlc1xuICBsZXQgbGl0ZXJhbENsb3plczogTWFwPHN0cmluZywgTW9ycGhlbWVbXT4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgW2JpZHgsIGJ1bnNldHN1XSBvZiBlbnVtZXJhdGUoYnVuc2V0c3VzKSkge1xuICAgIGxldCBmaXJzdCA9IGJ1bnNldHN1WzBdO1xuICAgIGlmICghZmlyc3QpIHsgY29udGludWU7IH1cbiAgICBjb25zdCBwb3MwID0gZmlyc3QucGFydE9mU3BlZWNoWzBdO1xuICAgIGxldCBzZWFyY2hGb3JQYXJ0aWNsZXMgPSB0cnVlO1xuICAgIGlmIChidW5zZXRzdS5sZW5ndGggPiAxICYmIChwb3MwLnN0YXJ0c1dpdGgoJ3ZlcmInKSB8fCBwb3MwLmVuZHNXaXRoKCdfdmVyYicpIHx8IHBvczAuc3RhcnRzV2l0aCgnYWRqZWN0JykpKSB7XG4gICAgICBsZXQgaWdub3JlUmlnaHQgPSBmaWx0ZXJSaWdodChidW5zZXRzdSwgbSA9PiAhZ29vZE1vcnBoZW1lUHJlZGljYXRlKG0pKTtcbiAgICAgIGxldCBnb29kQnVuc2V0c3UgPSBpZ25vcmVSaWdodC5sZW5ndGggPT09IDAgPyBidW5zZXRzdSA6IGJ1bnNldHN1LnNsaWNlKDAsIC1pZ25vcmVSaWdodC5sZW5ndGgpO1xuICAgICAgaWYgKGdvb2RCdW5zZXRzdS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHNlYXJjaEZvclBhcnRpY2xlcyA9IGZhbHNlO1xuICAgICAgICBsZXQgY2xvemUgPSBidW5zZXRzdVRvU3RyaW5nKGdvb2RCdW5zZXRzdSk7XG4gICAgICAgIGxldCBsZWZ0ID0gYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gYnVuc2V0c3VUb1N0cmluZyhpZ25vcmVSaWdodCkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIGNsb3plLCByaWdodCksIGdvb2RCdW5zZXRzdSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIG9ubHkgYWRkIHBhcnRpY2xlcyBpZiB0aGV5J3JlIE5PVCBpbnNpZGUgY29uanVnYXRlZCBwaHJhc2VzXG4gICAgY29uc3QgcGFydGljbGVQcmVkaWNhdGUgPSAocDogTW9ycGhlbWUpID0+IHAucGFydE9mU3BlZWNoWzBdLnN0YXJ0c1dpdGgoJ3BhcnRpY2xlJykgJiYgcC5wYXJ0T2ZTcGVlY2gubGVuZ3RoID4gMSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhcC5wYXJ0T2ZTcGVlY2hbMV0uc3RhcnRzV2l0aCgncGhyYXNlX2ZpbmFsJyk7XG4gICAgaWYgKHNlYXJjaEZvclBhcnRpY2xlcykge1xuICAgICAgZm9yIChsZXQgW3BpZHgsIHBhcnRpY2xlXSBvZiBlbnVtZXJhdGUoYnVuc2V0c3UpKSB7XG4gICAgICAgIGlmIChwYXJ0aWNsZVByZWRpY2F0ZShwYXJ0aWNsZSkpIHtcbiAgICAgICAgICBsZXQgbGVmdCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJykgKyBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKDAsIHBpZHgpKTtcbiAgICAgICAgICBsZXQgcmlnaHQgPVxuICAgICAgICAgICAgICBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKHBpZHggKyAxKSkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgcGFydGljbGUubGl0ZXJhbCwgcmlnaHQpLCBbcGFydGljbGVdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBsZXQgZXhpc3RpbmdDbG96ZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldChbXSk7XG4gIGxldCBidWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGxldCBbY2xvemUsIGJ1bnNldHN1XSBvZiBsaXRlcmFsQ2xvemVzKSB7XG4gICAgaWYgKCFleGlzdGluZ0Nsb3plcy5oYXMoY2xvemUpKSB7XG4gICAgICBsZXQgYWNjZXB0YWJsZSA9IFtjbG96ZV07XG4gICAgICBpZiAoaGFzS2FuamkoYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdSkpKSB7XG4gICAgICAgIGFjY2VwdGFibGUucHVzaChrYXRhMmhpcmEoYnVuc2V0c3UubWFwKG0gPT4gbS5wcm9udW5jaWF0aW9uKS5qb2luKCcnKSkpXG4gICAgICB9XG4gICAgICBidWxsZXRzLnB1c2goJy0gQGZpbGwgJyArIGFjY2VwdGFibGUuam9pbignIEAgJykgK1xuICAgICAgICAgICAgICAgICAgIGAgICAgQHBvcyAke2J1bnNldHN1Lm1hcChtID0+IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKSkuam9pbignLycpfWApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYnVsbGV0cztcbn1cblxuY29uc3QgVVNBR0UgPSBgVVNBR0UgMTpcbiQgbm9kZSBbdGhpcy1zY3JpcHQuanNdIFttYXJrZG93bi5tZF1cblxuVVNBR0UgMjpcbiQgY2F0IFttYXJrZG93bi5tZF0gfCBub2RlIFt0aGlzLXNjcmlwdC5qc11cblxuQm90aCB3aWxsIHByaW50IGEgcGFyc2VkIHZlcnNpb24gb2YgdGhlIGlucHV0LmA7XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcHJvbWlzaWZ5ID0gcmVxdWlyZSgndXRpbCcpLnByb21pc2lmeTtcbiAgY29uc3QgcmVhZEZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnZnMnKS5yZWFkRmlsZSk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBjb25zdCB0ZXh0ID0gcHJvY2Vzcy5hcmd2WzJdID8gYXdhaXQgcmVhZEZpbGUocHJvY2Vzcy5hcmd2WzJdLCAndXRmOCcpIDogKChhd2FpdCBnZXRTdGRpbigpKSB8fCBVU0FHRSk7XG4gICAgLy8gU3BsaXQgTWFya2Rvd24gYXQgaGVhZGVyIChgIyBibGFibGFgKVxuICAgIGxldCBibG9ja3MgPSBzcGxpdEF0SGVhZGVycyh0ZXh0KTtcbiAgICAvLyBQYXJzZSBoZWFkZXJzXG4gICAgbGV0IGNvbnRlbnQgPSBhd2FpdCBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3MpO1xuICAgIC8vIFByaW50IHJlc3VsdFxuICAgIGNvbnNvbGUubG9nKGNvbnRlbnQubWFwKHYgPT4gdi5qb2luKCdcXG4nKSkuam9pbignXFxuJykpO1xuICB9KSgpO1xufSJdfQ==