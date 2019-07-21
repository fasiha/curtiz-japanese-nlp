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
                        block.splice(1, 0, `${FURIGANA_BLOCK} ${furigana.map(furiganaToString).join('')}`);
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
            process.stdout.write(content.map(v => v.join('\n')).join('\n'));
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUFvRztBQUNwRywrREFBa0U7QUFFbEUsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQWUsS0FBSyxDQUFDLFFBQWdCOztRQUNuQyxJQUFJLFFBQVEsR0FBRyxNQUFNLHlCQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxTQUFTLEdBQUcsdUNBQXlCLENBQUMsd0JBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxTQUFTLEdBQUcsTUFBTSxnQkFBUSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBQyxDQUFDO0lBQ2hDLENBQUM7Q0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQsU0FBc0Isb0JBQW9C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QUFDLElBQUksQ0FBQyxDQUFDO1lBQ2xDLGdCQUFnQjtZQUNoQixJQUFJLE9BQU8sR0FBRyxNQUFNLG9CQUFvQixDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ2pELGVBQWU7WUFDZixPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLENBQUM7S0FBQSxDQUFDLEVBQUUsQ0FBQztDQUNOIiwic291cmNlc0NvbnRlbnQiOlsiIyEvdXNyL2Jpbi9lbnYgbm9kZVxuaW1wb3J0IHthZGRKZGVwcH0gZnJvbSAnLi9qZGVwcCc7XG5pbXBvcnQge2thdGEyaGlyYX0gZnJvbSAnLi9rYW5hJztcbmltcG9ydCB7Z29vZE1vcnBoZW1lUHJlZGljYXRlLCBpbnZva2VNZWNhYiwgbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcywgTW9ycGhlbWUsIHBhcnNlTWVjYWJ9IGZyb20gJy4vbWVjYWJVbmlkaWMnO1xuaW1wb3J0IHtlbnVtZXJhdGUsIGZpbHRlclJpZ2h0LCBmbGF0dGVuLCBoYXNLYW5qaSwgcGFydGl0aW9uQnksIHRha2VXaGlsZSwgemlwfSBmcm9tICdjdXJ0aXotdXRpbHMnO1xuaW1wb3J0IHtFbnRyeSwgUnVieSwgRnVyaWdhbmEsIHNldHVwfSBmcm9tICdqbWRpY3QtZnVyaWdhbmEtbm9kZSc7XG5cbmNvbnN0IEptZGljdEZ1cmlnYW5hID0gc2V0dXAoKTtcblxuYXN5bmMgZnVuY3Rpb24gcGFyc2Uoc2VudGVuY2U6IHN0cmluZyk6IFByb21pc2U8e21vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107fT4ge1xuICBsZXQgcmF3TWVjYWIgPSBhd2FpdCBpbnZva2VNZWNhYihzZW50ZW5jZSk7XG4gIGxldCBtb3JwaGVtZXMgPSBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzKHBhcnNlTWVjYWIoc2VudGVuY2UsIHJhd01lY2FiKVswXS5maWx0ZXIobyA9PiAhIW8pKTtcbiAgbGV0IGJ1bnNldHN1cyA9IGF3YWl0IGFkZEpkZXBwKHJhd01lY2FiLCBtb3JwaGVtZXMpO1xuICByZXR1cm4ge21vcnBoZW1lcywgYnVuc2V0c3VzfTtcbn1cblxuY29uc3QgYnVuc2V0c3VUb1N0cmluZyA9IChtb3JwaGVtZXM6IE1vcnBoZW1lW10pID0+IG1vcnBoZW1lcy5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuXG5leHBvcnQgZnVuY3Rpb24gc3BsaXRBdEhlYWRlcnModGV4dDogc3RyaW5nKTogc3RyaW5nW11bXSB7XG4gIGNvbnN0IGhlYWRlclJlID0gL14jK1xccysuKyQvO1xuICByZXR1cm4gcGFydGl0aW9uQnkodGV4dC5zcGxpdCgnXFxuJyksIHMgPT4gaGVhZGVyUmUudGVzdChzKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3M6IHN0cmluZ1tdW10sIGNvbmN1cnJlbnRMaW1pdDogbnVtYmVyID0gOCkge1xuICBsZXQgcmV0OiBzdHJpbmdbXVtdID0gW107XG4gIGxldCBwcm9taXNlczogUHJvbWlzZTxzdHJpbmdbXT5bXSA9IFtdO1xuICBmb3IgKGxldCBvIG9mIGJsb2Nrcykge1xuICAgIGlmIChwcm9taXNlcy5sZW5ndGggPj0gY29uY3VycmVudExpbWl0KSB7XG4gICAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgICAgIHByb21pc2VzID0gW107XG4gICAgfVxuICAgIHByb21pc2VzLnB1c2gocGFyc2VIZWFkZXJCbG9jayhvKSk7XG4gIH1cbiAgaWYgKHByb21pc2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gIH1cbiAgcmV0dXJuIHJldDtcbn1cblxuY29uc3QgUExFQVNFX1BBUlNFX0JMT0NLID0gJy0gQHBsZWFzZVBhcnNlJztcbmNvbnN0IEZVUklHQU5BX0JMT0NLID0gJy0gQGZ1cmlnYW5hJztcblxuY29uc3QgZmxhc2hhYmxlTW9ycGhlbWUgPSAobTogTW9ycGhlbWUpID0+IHtcbiAgY29uc3QgcG9zID0gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpO1xuICBpZiAoaGFzS2FuamkobS5saXRlcmFsKSAmJiAhcG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAocG9zLnN0YXJ0c1dpdGgoJ3ZlcmItZ2VuZXJhbCcpIHx8IHBvcy5zdGFydHNXaXRoKCdub3VuJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ3Byb25vdW4nKSB8fFxuICAgICAgcG9zLnN0YXJ0c1dpdGgoJ2FkamVjdGl2JykgfHwgcG9zLnN0YXJ0c1dpdGgoJ2FkdmVyYicpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcbmZ1bmN0aW9uIG1vcnBoZW1lVG9SZWFkaW5nKG06IE1vcnBoZW1lKSB7XG4gIHJldHVybiBoYXNLYW5qaShtLmxpdGVyYWwpID8ga2F0YTJoaXJhKG0ubGl0ZXJhbCA9PT0gbS5sZW1tYSA/IG0ubGVtbWFSZWFkaW5nIDogbS5wcm9udW5jaWF0aW9uKSA6IG0ubGl0ZXJhbDtcbn1cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUhlYWRlckJsb2NrKGJsb2NrOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3QgYXRIZWFkZXJSZSA9IC9eIytcXHMrQFxccysvO1xuICBjb25zdCBtYXRjaCA9IGJsb2NrWzBdLm1hdGNoKGF0SGVhZGVyUmUpO1xuICBpZiAobWF0Y2gpIHtcbiAgICBjb25zdCBsaW5lID0gYmxvY2tbMF0uc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICBsZXQgW3Byb21wdCwgcmVzcG9uc2VdID0gbGluZS5zcGxpdCgnQCcpLm1hcChzID0+IHMudHJpbSgpKTtcblxuICAgIC8vIHByb2Nlc3MgbGluZSBhbmQgYmxvY2suXG4gICAgY29uc3QgaGFzUmVzcG9uc2UgPSAhIXJlc3BvbnNlO1xuICAgIGNvbnN0IGhhc1BsZWFzZVBhcnNlID1cbiAgICAgICAgdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgY29uc3QgaGFzRnVyaWdhbmEgPSB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChGVVJJR0FOQV9CTE9DSykpO1xuICAgIGlmICghaGFzUmVzcG9uc2UgfHwgaGFzUGxlYXNlUGFyc2UgfHwgIWhhc0Z1cmlnYW5hKSB7XG4gICAgICBjb25zdCBwYXJzZWQgPSBhd2FpdCBwYXJzZShsaW5lKTtcbiAgICAgIGlmICghaGFzUmVzcG9uc2UpIHtcbiAgICAgICAgcmVzcG9uc2UgPSBrYXRhMmhpcmEoZmxhdHRlbihwYXJzZWQuYnVuc2V0c3VzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihtID0+IG0ucGFydE9mU3BlZWNoWzBdICE9PSAnc3VwcGxlbWVudGFyeV9zeW1ib2wnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLm1hcChtb3JwaGVtZVRvUmVhZGluZylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5qb2luKCcnKSk7XG4gICAgICAgIGJsb2NrWzBdID0gYmxvY2tbMF0gKyAnIEAgJyArIHJlc3BvbnNlO1xuICAgICAgfVxuICAgICAgaWYgKGhhc1BsZWFzZVBhcnNlKSB7XG4gICAgICAgIC8vIGFkZCBAZmxhc2ggbGluZXNcbiAgICAgICAgbGV0IGZsYXNoQnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgW21pZHgsIG1vcnBoZW1lXSBvZiBlbnVtZXJhdGUocGFyc2VkLm1vcnBoZW1lcykpIHtcbiAgICAgICAgICBpZiAoZmxhc2hhYmxlTW9ycGhlbWUobW9ycGhlbWUpKSB7XG4gICAgICAgICAgICBjb25zdCBtcHJvbXB0ID0gKG1vcnBoZW1lLnBhcnRPZlNwZWVjaFsxXSA9PT0gJ3Byb3BlcicpID8gbW9ycGhlbWUubGl0ZXJhbCA6IG1vcnBoZW1lLmxlbW1hO1xuICAgICAgICAgICAgY29uc3QgbXJlc3BvbnNlID0gKG1vcnBoZW1lLnBhcnRPZlNwZWVjaFsxXSA9PT0gJ3Byb3BlcicpID8ga2F0YTJoaXJhKG1vcnBoZW1lLnByb251bmNpYXRpb24pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBrYXRhMmhpcmEobW9ycGhlbWUubGVtbWFSZWFkaW5nKTtcblxuICAgICAgICAgICAgY29uc3QgbGVmdCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UoMCwgbWlkeCkubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IHJpZ2h0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZShtaWR4ICsgMSkubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcbiAgICAgICAgICAgIGxldCBjbG96ZSA9IGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBtb3JwaGVtZS5saXRlcmFsLCByaWdodCk7XG4gICAgICAgICAgICBsZXQgZmluYWwgPSAnJztcbiAgICAgICAgICAgIGlmIChtcHJvbXB0ID09PSBtb3JwaGVtZS5saXRlcmFsICYmIGFwcGVhcnNFeGFjdGx5T25jZShwcm9tcHQsIG1vcnBoZW1lLmxpdGVyYWwpKSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9ICAgIEBwb3MgJHttb3JwaGVtZS5wYXJ0T2ZTcGVlY2guam9pbignLScpfWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfSAgICBAcG9zICR7bW9ycGhlbWUucGFydE9mU3BlZWNoLmpvaW4oJy0nKX0gQG9taXQgJHtjbG96ZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZmxhc2hCdWxsZXRzLnB1c2goZmluYWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgLi4uZmxhc2hCdWxsZXRzKTtcblxuICAgICAgICAvLyBhZGQgQGZpbGwgbGluZXNcbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmlkZW50aWZ5RmlsbEluQmxhbmtzKHBhcnNlZC5idW5zZXRzdXMpKTtcblxuICAgICAgICAvLyByZW1vdmUgQHBsZWFzZVBhcnNlXG4gICAgICAgIGJsb2NrID0gYmxvY2suZmlsdGVyKHMgPT4gIXMuc3RhcnRzV2l0aChQTEVBU0VfUEFSU0VfQkxPQ0spKTtcbiAgICAgIH1cbiAgICAgIGlmICghaGFzRnVyaWdhbmEpIHtcbiAgICAgICAgLy8gYWRkIGZ1cmlnYW5hIGxpbmVcbiAgICAgICAgaWYgKGhhc0thbmppKHByb21wdCkpIHtcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYTogRnVyaWdhbmFbXVtdID0gYXdhaXQgUHJvbWlzZS5hbGwocGFyc2VkLm1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgICAgICAgICBjb25zdCB7bGVtbWEsIGxlbW1hUmVhZGluZywgbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbn0gPSBtO1xuICAgICAgICAgICAgaWYgKGhhc0thbmppKGxpdGVyYWwpKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeSwgcmVhZGluZ1RvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgICAgICAgICAgY29uc3QgbGl0ZXJhbEhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGl0ZXJhbCwgJ3JlYWRpbmcnLCBwcm9udW5jaWF0aW9uKTtcbiAgICAgICAgICAgICAgaWYgKGxpdGVyYWxIaXQpIHsgcmV0dXJuIGxpdGVyYWxIaXQuZnVyaWdhbmE7IH1cbiAgICAgICAgICAgICAgY29uc3QgcHJvbnVuY2lhdGlvbkhpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgcHJvbnVuY2lhdGlvbiwgJ3RleHQnLCBsaXRlcmFsKTtcbiAgICAgICAgICAgICAgaWYgKHByb251bmNpYXRpb25IaXQpIHsgcmV0dXJuIHByb251bmNpYXRpb25IaXQuZnVyaWdhbmE7IH1cblxuICAgICAgICAgICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgICAgICAgICAgaWYgKGxlbW1hSGl0KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZnVyaWdhbmFEaWN0OiBNYXA8c3RyaW5nLCBzdHJpbmc+ID0gbmV3IE1hcCgpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgZiBvZiBsZW1tYUhpdC5mdXJpZ2FuYSkge1xuICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBmID09PSAnc3RyaW5nJykgeyBjb250aW51ZTsgfVxuICAgICAgICAgICAgICAgICAgZnVyaWdhbmFEaWN0LnNldChmLnJ1YnksIGYucnQpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGNvbnN0IGNoYXJzID0gbGl0ZXJhbC5zcGxpdCgnJyk7XG4gICAgICAgICAgICAgICAgbGV0IGthbmppID0gY2hhcnMuZmlsdGVyKGhhc0thbmppKTtcbiAgICAgICAgICAgICAgICBjb25zdCBhbm5vdGF0ZWRDaGFyczogRnVyaWdhbmFbXSA9IGNoYXJzLnNsaWNlKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBzdGFydCBmcm9tIGFsbCBrYW5qaSBjaGFyYWN0ZXJzIGluIGEgc3RyaW5nLCBzZWUgaWYgdGhhdCdzIGluIGZ1cmlnYW5hRGljdCwgaWYgbm90LCBjaG9wIGxhc3RcbiAgICAgICAgICAgICAgICB3aGlsZSAoa2FuamkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICBjb25zdCBoaXQgPSB0cml1KGthbmppKS5maW5kKGtzID0+IGZ1cmlnYW5hRGljdC5oYXMoa3Muam9pbignJykpKTtcbiAgICAgICAgICAgICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGl0c3RyID0gaGl0LmpvaW4oJycpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpZHggPSBsaXRlcmFsLmluZGV4T2YoaGl0c3RyKTtcbiAgICAgICAgICAgICAgICAgICAgYW5ub3RhdGVkQ2hhcnNbaWR4XSA9IHtydWJ5OiBoaXRzdHIsIHJ0OiBmdXJpZ2FuYURpY3QuZ2V0KGhpdHN0cikgfHwgaGl0c3RyfTtcbiAgICAgICAgICAgICAgICAgICAgZm9yIChsZXQgaSA9IGlkeCArIDE7IGkgPCBpZHggKyBoaXRzdHIubGVuZ3RoOyBpKyspIHsgYW5ub3RhdGVkQ2hhcnNbaV0gPSAnJzsgfVxuICAgICAgICAgICAgICAgICAgICBrYW5qaSA9IGthbmppLnNsaWNlKGhpdHN0ci5sZW5ndGgpO1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZXR1cm4gYW5ub3RhdGVkQ2hhcnM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gY29uc3QgbGVtbWFSZWFkaW5nSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBsZW1tYVJlYWRpbmcsICd0ZXh0JywgbGVtbWEpO1xuICAgICAgICAgICAgICAvLyBpZiAobGVtbWFSZWFkaW5nSGl0KSB7IHJldHVybiBsZW1tYVJlYWRpbmdIaXQuZnVyaWdhbmE7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBbaGFzS2FuamkobGl0ZXJhbCkgPyB7cnVieTogbGl0ZXJhbCwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxpdGVyYWxdO1xuICAgICAgICAgIH0pKTtcblxuICAgICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCBgJHtGVVJJR0FOQV9CTE9DS30gJHtmdXJpZ2FuYS5tYXAoZnVyaWdhbmFUb1N0cmluZykuam9pbignJyl9YCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJsb2NrO1xufVxuXG5mdW5jdGlvbiB0cml1PFQ+KGFycjogVFtdKTogVFtdW10ge1xuICBjb25zdCByZXQ6IFRbXVtdID0gW107XG4gIGZvciAobGV0IGkgPSBhcnIubGVuZ3RoOyBpID4gMDsgLS1pKSB7IHJldC5wdXNoKGFyci5zbGljZSgwLCBpKSk7IH1cbiAgcmV0dXJuIHJldDtcbn1cbmZ1bmN0aW9uIGZ1cmlnYW5hVG9TdHJpbmcoZnM6IEZ1cmlnYW5hW10pIHtcbiAgLy8gY29uc3QgcGFkID0gKHM6IHN0cmluZykgPT4gcy5sZW5ndGggPT09IDEgPyBzIDogYHske3N9fWA7XG4gIHJldHVybiBmcy5tYXAoZiA9PiB0eXBlb2YgZiA9PT0gJ3N0cmluZycgPyBmIDogYHske2YucnVieX19Xnske2YucnR9fWApLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBzZWFyY2gobWFwOiBNYXA8c3RyaW5nLCBFbnRyeVtdPiwgZmlyc3Q6IHN0cmluZywgc3ViOiAncmVhZGluZyd8J3RleHQnLCBzZWNvbmQ6IHN0cmluZyk6IEVudHJ5fHVuZGVmaW5lZCB7XG4gIGNvbnN0IGhpdCA9IG1hcC5nZXQoZmlyc3QpO1xuICBpZiAoaGl0KSB7XG4gICAgaWYgKGhpdC5sZW5ndGggPT09IDEpIHsgcmV0dXJuIGhpdFswXTsgfVxuICAgIGNvbnN0IHN1YmhpdCA9IGhpdC5maW5kKGUgPT4ga2F0YTJoaXJhKGVbc3ViXSkgPT09IGthdGEyaGlyYShzZWNvbmQpKTtcbiAgICBpZiAoc3ViaGl0KSB7IHJldHVybiBzdWJoaXQ7IH1cbiAgICBjb25zb2xlLmVycm9yKGBmb3VuZCBoaXQgZm9yICR7Zmlyc3R9IGJ1dCBub3QgJHtzZWNvbmR9YCwge2hpdH0pO1xuICB9XG59XG5cbi8qKlxuICogRW5zdXJlIG5lZWRsZSBpcyBmb3VuZCBpbiBoYXlzdGFjayBvbmx5IG9uY2VcbiAqIEBwYXJhbSBoYXlzdGFjayBiaWcgc3RyaW5nXG4gKiBAcGFyYW0gbmVlZGxlIGxpdHRsZSBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gYXBwZWFyc0V4YWN0bHlPbmNlKGhheXN0YWNrOiBzdHJpbmcsIG5lZWRsZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGxldCBoaXQ6IG51bWJlcjtcbiAgcmV0dXJuIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSkpID49IDAgJiYgKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlLCBoaXQgKyAxKSkgPCAwO1xufVxuLyoqXG4gKiBHaXZlbiB0aHJlZSBjb25zZWN1dGllcyBzdWJzdHJpbmdzICh0aGUgYXJndW1lbnRzKSwgcmV0dXJuIGVpdGhlclxuICogLSBgJHtsZWZ0Mn1bJHtjbG96ZX1dJHtyaWdodDJ9YCB3aGVyZSBgbGVmdDJgIGFuZCBgcmlnaHQyYCBhcmUgYXMgc2hvcnQgYXMgcG9zc2libGUgKGFuZCBvZiBlcXVhbCBsZW5ndGgsIGlmXG4gKiAgICBwb3NzaWJsZSkgc28gdGhlIHRoaXMgcmV0dXJuIHN0cmluZyAobWludXMgdGhlIGJyYWNrZXRzKSBpcyB1bmlxdWUgaW4gdGhlIGZ1bGwgc3RyaW5nLCBvclxuICogLSBgJHtjbG96ZX1gIGlmIGBsZWZ0MiA9PT0gcmlnaHQyID09PSAnJ2AgKGkuZS4sIHRoZSBhYm92ZSBidXQgd2l0aG91dCB0aGUgYnJhY2tldHMpLlxuICogQHBhcmFtIGxlZnQgbGVmdCBzdHJpbmcsIHBvc3NpYmx5IGVtcHR5XG4gKiBAcGFyYW0gY2xvemUgbWlkZGxlIHN0cmluZ1xuICogQHBhcmFtIHJpZ2h0IHJpZ2h0IHN0cmluZywgcG9zc2libGUgZW1wdHlcbiAqIEB0aHJvd3MgaW4gdGhlIHVubGlrZWx5IGV2ZW50IHRoYXQgc3VjaCBhIHJldHVybiBzdHJpbmcgY2Fubm90IGJlIGJ1aWxkIChJIGNhbm5vdCB0aGluayBvZiBhbiBleGFtcGxlIHRob3VnaClcbiAqL1xuZnVuY3Rpb24gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQ6IHN0cmluZywgY2xvemU6IHN0cmluZywgcmlnaHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIGNvbnN0IHNlbnRlbmNlID0gbGVmdCArIGNsb3plICsgcmlnaHQ7XG4gIGxldCBsZWZ0Q29udGV4dCA9ICcnO1xuICBsZXQgcmlnaHRDb250ZXh0ID0gJyc7XG4gIGxldCBjb250ZXh0TGVuZ3RoID0gMDtcbiAgd2hpbGUgKCFhcHBlYXJzRXhhY3RseU9uY2Uoc2VudGVuY2UsIGxlZnRDb250ZXh0ICsgY2xvemUgKyByaWdodENvbnRleHQpKSB7XG4gICAgY29udGV4dExlbmd0aCsrO1xuICAgIGlmIChjb250ZXh0TGVuZ3RoID49IGxlZnQubGVuZ3RoICYmIGNvbnRleHRMZW5ndGggPj0gcmlnaHQubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1JhbiBvdXQgb2YgY29udGV4dCB0byBidWlsZCB1bmlxdWUgY2xvemUnKTtcbiAgICB9XG4gICAgbGVmdENvbnRleHQgPSBsZWZ0LnNsaWNlKC1jb250ZXh0TGVuZ3RoKTtcbiAgICByaWdodENvbnRleHQgPSByaWdodC5zbGljZSgwLCBjb250ZXh0TGVuZ3RoKTtcbiAgfVxuICBpZiAobGVmdENvbnRleHQgPT09ICcnICYmIHJpZ2h0Q29udGV4dCA9PT0gJycpIHsgcmV0dXJuIGNsb3plOyB9XG4gIHJldHVybiBgJHtsZWZ0Q29udGV4dH1bJHtjbG96ZX1dJHtyaWdodENvbnRleHR9YDtcbn1cblxuZnVuY3Rpb24gaWRlbnRpZnlGaWxsSW5CbGFua3MoYnVuc2V0c3VzOiBNb3JwaGVtZVtdW10pIHtcbiAgLy8gRmluZCBjbG96ZXM6IHBhcnRpY2xlcyBhbmQgY29uanVnYXRlZCB2ZXJiL2FkamVjdGl2ZSBwaHJhc2VzXG4gIGxldCBsaXRlcmFsQ2xvemVzOiBNYXA8c3RyaW5nLCBNb3JwaGVtZVtdPiA9IG5ldyBNYXAoW10pO1xuICBmb3IgKGxldCBbYmlkeCwgYnVuc2V0c3VdIG9mIGVudW1lcmF0ZShidW5zZXRzdXMpKSB7XG4gICAgbGV0IGZpcnN0ID0gYnVuc2V0c3VbMF07XG4gICAgaWYgKCFmaXJzdCkgeyBjb250aW51ZTsgfVxuICAgIGNvbnN0IHBvczAgPSBmaXJzdC5wYXJ0T2ZTcGVlY2hbMF07XG4gICAgbGV0IHNlYXJjaEZvclBhcnRpY2xlcyA9IHRydWU7XG4gICAgaWYgKGJ1bnNldHN1Lmxlbmd0aCA+IDEgJiYgKHBvczAuc3RhcnRzV2l0aCgndmVyYicpIHx8IHBvczAuZW5kc1dpdGgoJ192ZXJiJykgfHwgcG9zMC5zdGFydHNXaXRoKCdhZGplY3QnKSkpIHtcbiAgICAgIGxldCBpZ25vcmVSaWdodCA9IGZpbHRlclJpZ2h0KGJ1bnNldHN1LCBtID0+ICFnb29kTW9ycGhlbWVQcmVkaWNhdGUobSkpO1xuICAgICAgbGV0IGdvb2RCdW5zZXRzdSA9IGlnbm9yZVJpZ2h0Lmxlbmd0aCA9PT0gMCA/IGJ1bnNldHN1IDogYnVuc2V0c3Uuc2xpY2UoMCwgLWlnbm9yZVJpZ2h0Lmxlbmd0aCk7XG4gICAgICBpZiAoZ29vZEJ1bnNldHN1Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgc2VhcmNoRm9yUGFydGljbGVzID0gZmFsc2U7XG4gICAgICAgIGxldCBjbG96ZSA9IGJ1bnNldHN1VG9TdHJpbmcoZ29vZEJ1bnNldHN1KTtcbiAgICAgICAgbGV0IGxlZnQgPSBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBsZXQgcmlnaHQgPSBidW5zZXRzdVRvU3RyaW5nKGlnbm9yZVJpZ2h0KSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgY2xvemUsIHJpZ2h0KSwgZ29vZEJ1bnNldHN1KTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gb25seSBhZGQgcGFydGljbGVzIGlmIHRoZXkncmUgTk9UIGluc2lkZSBjb25qdWdhdGVkIHBocmFzZXNcbiAgICBjb25zdCBwYXJ0aWNsZVByZWRpY2F0ZSA9IChwOiBNb3JwaGVtZSkgPT4gcC5wYXJ0T2ZTcGVlY2hbMF0uc3RhcnRzV2l0aCgncGFydGljbGUnKSAmJiBwLnBhcnRPZlNwZWVjaC5sZW5ndGggPiAxICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICFwLnBhcnRPZlNwZWVjaFsxXS5zdGFydHNXaXRoKCdwaHJhc2VfZmluYWwnKTtcbiAgICBpZiAoc2VhcmNoRm9yUGFydGljbGVzKSB7XG4gICAgICBmb3IgKGxldCBbcGlkeCwgcGFydGljbGVdIG9mIGVudW1lcmF0ZShidW5zZXRzdSkpIHtcbiAgICAgICAgaWYgKHBhcnRpY2xlUHJlZGljYXRlKHBhcnRpY2xlKSkge1xuICAgICAgICAgIGxldCBsZWZ0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKSArIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UoMCwgcGlkeCkpO1xuICAgICAgICAgIGxldCByaWdodCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3Uuc2xpY2UocGlkeCArIDEpKSArIGJ1bnNldHN1cy5zbGljZShiaWR4ICsgMSkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpO1xuICAgICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBwYXJ0aWNsZS5saXRlcmFsLCByaWdodCksIFtwYXJ0aWNsZV0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGxldCBleGlzdGluZ0Nsb3plczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KFtdKTtcbiAgbGV0IGJ1bGxldHM6IHN0cmluZ1tdID0gW107XG4gIGZvciAobGV0IFtjbG96ZSwgYnVuc2V0c3VdIG9mIGxpdGVyYWxDbG96ZXMpIHtcbiAgICBpZiAoIWV4aXN0aW5nQ2xvemVzLmhhcyhjbG96ZSkpIHtcbiAgICAgIGxldCBhY2NlcHRhYmxlID0gW2Nsb3plXTtcbiAgICAgIGlmIChoYXNLYW5qaShidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1KSkpIHtcbiAgICAgICAgYWNjZXB0YWJsZS5wdXNoKGthdGEyaGlyYShidW5zZXRzdS5tYXAobSA9PiBtLnByb251bmNpYXRpb24pLmpvaW4oJycpKSlcbiAgICAgIH1cbiAgICAgIGJ1bGxldHMucHVzaCgnLSBAZmlsbCAnICsgYWNjZXB0YWJsZS5qb2luKCcgQCAnKSArXG4gICAgICAgICAgICAgICAgICAgYCAgICBAcG9zICR7YnVuc2V0c3UubWFwKG0gPT4gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpKS5qb2luKCcvJyl9YCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBidWxsZXRzO1xufVxuXG5jb25zdCBVU0FHRSA9IGBVU0FHRSAxOlxuJCBub2RlIFt0aGlzLXNjcmlwdC5qc10gW21hcmtkb3duLm1kXVxuXG5VU0FHRSAyOlxuJCBjYXQgW21hcmtkb3duLm1kXSB8IG5vZGUgW3RoaXMtc2NyaXB0LmpzXVxuXG5Cb3RoIHdpbGwgcHJpbnQgYSBwYXJzZWQgdmVyc2lvbiBvZiB0aGUgaW5wdXQuYDtcbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xuICBjb25zdCBwcm9taXNpZnkgPSByZXF1aXJlKCd1dGlsJykucHJvbWlzaWZ5O1xuICBjb25zdCByZWFkRmlsZSA9IHByb21pc2lmeShyZXF1aXJlKCdmcycpLnJlYWRGaWxlKTtcbiAgY29uc3QgZ2V0U3RkaW4gPSByZXF1aXJlKCdnZXQtc3RkaW4nKTtcbiAgKGFzeW5jIGZ1bmN0aW9uKCkge1xuICAgIGNvbnN0IHRleHQgPSBwcm9jZXNzLmFyZ3ZbMl0gPyBhd2FpdCByZWFkRmlsZShwcm9jZXNzLmFyZ3ZbMl0sICd1dGY4JykgOiAoKGF3YWl0IGdldFN0ZGluKCkpIHx8IFVTQUdFKTtcbiAgICAvLyBTcGxpdCBNYXJrZG93biBhdCBoZWFkZXIgKGAjIGJsYWJsYWApXG4gICAgbGV0IGJsb2NrcyA9IHNwbGl0QXRIZWFkZXJzKHRleHQpO1xuICAgIC8vIFBhcnNlIGhlYWRlcnNcbiAgICBsZXQgY29udGVudCA9IGF3YWl0IHBhcnNlQWxsSGVhZGVyQmxvY2tzKGJsb2Nrcyk7XG4gICAgLy8gUHJpbnQgcmVzdWx0XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoY29udGVudC5tYXAodiA9PiB2LmpvaW4oJ1xcbicpKS5qb2luKCdcXG4nKSk7XG4gIH0pKCk7XG59Il19