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
                                const furigana = yield parsedToFurigana([morpheme]);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBOEU7QUFFOUUsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQWUsS0FBSyxDQUFDLFFBQWdCOztRQUNuQyxJQUFJLFFBQVEsR0FBRyxNQUFNLHlCQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0MsSUFBSSxTQUFTLEdBQUcsdUNBQXlCLENBQUMsd0JBQVUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDOUYsSUFBSSxTQUFTLEdBQUcsTUFBTSxnQkFBUSxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNwRCxPQUFPLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBQyxDQUFDO0lBQ2hDLENBQUM7Q0FBQTtBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQsU0FBc0Isb0JBQW9C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LEtBQUssQ0FBQyxDQUFDO1lBQ3ZHLHdDQUF3QztZQUN4QyxJQUFJLE1BQU0sR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEMsZ0JBQWdCO1lBQ2hCLElBQUksT0FBTyxHQUFHLE1BQU0sb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsZUFBZTtZQUNmLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbEUsQ0FBQztLQUFBLENBQUMsRUFBRSxDQUFDO0NBQ04iLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQge2FkZEpkZXBwfSBmcm9tICcuL2pkZXBwJztcbmltcG9ydCB7a2F0YTJoaXJhfSBmcm9tICcuL2thbmEnO1xuaW1wb3J0IHtnb29kTW9ycGhlbWVQcmVkaWNhdGUsIGludm9rZU1lY2FiLCBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzLCBNb3JwaGVtZSwgcGFyc2VNZWNhYn0gZnJvbSAnLi9tZWNhYlVuaWRpYyc7XG5pbXBvcnQge2VudW1lcmF0ZSwgZmlsdGVyUmlnaHQsIGZsYXR0ZW4sIGhhc0thbmppLCBwYXJ0aXRpb25CeSwgdGFrZVdoaWxlfSBmcm9tICdjdXJ0aXotdXRpbHMnO1xuaW1wb3J0IHtFbnRyeSwgZnVyaWdhbmFUb1N0cmluZywgRnVyaWdhbmEsIHNldHVwfSBmcm9tICdqbWRpY3QtZnVyaWdhbmEtbm9kZSc7XG5cbmNvbnN0IEptZGljdEZ1cmlnYW5hID0gc2V0dXAoKTtcblxuYXN5bmMgZnVuY3Rpb24gcGFyc2Uoc2VudGVuY2U6IHN0cmluZyk6IFByb21pc2U8e21vcnBoZW1lczogTW9ycGhlbWVbXTsgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW107fT4ge1xuICBsZXQgcmF3TWVjYWIgPSBhd2FpdCBpbnZva2VNZWNhYihzZW50ZW5jZSk7XG4gIGxldCBtb3JwaGVtZXMgPSBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzKHBhcnNlTWVjYWIoc2VudGVuY2UsIHJhd01lY2FiKVswXS5maWx0ZXIobyA9PiAhIW8pKTtcbiAgbGV0IGJ1bnNldHN1cyA9IGF3YWl0IGFkZEpkZXBwKHJhd01lY2FiLCBtb3JwaGVtZXMpO1xuICByZXR1cm4ge21vcnBoZW1lcywgYnVuc2V0c3VzfTtcbn1cblxuY29uc3QgYnVuc2V0c3VUb1N0cmluZyA9IChtb3JwaGVtZXM6IE1vcnBoZW1lW10pID0+IG1vcnBoZW1lcy5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuXG5leHBvcnQgZnVuY3Rpb24gc3BsaXRBdEhlYWRlcnModGV4dDogc3RyaW5nKTogc3RyaW5nW11bXSB7XG4gIGNvbnN0IGhlYWRlclJlID0gL14jK1xccysuKyQvO1xuICByZXR1cm4gcGFydGl0aW9uQnkodGV4dC5zcGxpdCgnXFxuJyksIHMgPT4gaGVhZGVyUmUudGVzdChzKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3M6IHN0cmluZ1tdW10sIGNvbmN1cnJlbnRMaW1pdDogbnVtYmVyID0gOCkge1xuICBsZXQgcmV0OiBzdHJpbmdbXVtdID0gW107XG4gIGxldCBwcm9taXNlczogUHJvbWlzZTxzdHJpbmdbXT5bXSA9IFtdO1xuICBmb3IgKGxldCBvIG9mIGJsb2Nrcykge1xuICAgIGlmIChwcm9taXNlcy5sZW5ndGggPj0gY29uY3VycmVudExpbWl0KSB7XG4gICAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgZm9yIChjb25zdCBvIG9mIHRoaXNSZXQpIHsgcmV0LnB1c2gobyk7IH1cbiAgICAgIHByb21pc2VzID0gW107XG4gICAgfVxuICAgIHByb21pc2VzLnB1c2gocGFyc2VIZWFkZXJCbG9jayhvKSk7XG4gIH1cbiAgaWYgKHByb21pc2VzLmxlbmd0aCA+IDApIHtcbiAgICBjb25zdCB0aGlzUmV0ID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gIH1cbiAgcmV0dXJuIHJldDtcbn1cblxuY29uc3QgUExFQVNFX1BBUlNFX0JMT0NLID0gJy0gQHBsZWFzZVBhcnNlJztcbmNvbnN0IEZVUklHQU5BX0JMT0NLID0gJy0gQGZ1cmlnYW5hJztcblxuY29uc3QgZmxhc2hhYmxlTW9ycGhlbWUgPSAobTogTW9ycGhlbWUpID0+IHtcbiAgY29uc3QgcG9zID0gbS5wYXJ0T2ZTcGVlY2guam9pbignLScpO1xuICBpZiAoaGFzS2FuamkobS5saXRlcmFsKSAmJiAhcG9zLmVuZHNXaXRoKCdudW1lcmFsJykpIHsgcmV0dXJuIHRydWU7IH1cbiAgaWYgKHBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiBmYWxzZTsgfVxuICBpZiAocG9zLnN0YXJ0c1dpdGgoJ3ZlcmItZ2VuZXJhbCcpIHx8IHBvcy5zdGFydHNXaXRoKCdub3VuJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ3Byb25vdW4nKSB8fFxuICAgICAgcG9zLnN0YXJ0c1dpdGgoJ2FkamVjdGl2JykgfHwgcG9zLnN0YXJ0c1dpdGgoJ2FkdmVyYicpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcbmZ1bmN0aW9uIG1vcnBoZW1lVG9SZWFkaW5nKG06IE1vcnBoZW1lKSB7XG4gIHJldHVybiBoYXNLYW5qaShtLmxpdGVyYWwpID8ga2F0YTJoaXJhKG0ubGl0ZXJhbCA9PT0gbS5sZW1tYSA/IG0ubGVtbWFSZWFkaW5nIDogbS5wcm9udW5jaWF0aW9uKSA6IG0ubGl0ZXJhbDtcbn1cbnR5cGUgUGFyc2VkID0ge1xuICBtb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO1xufTtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUhlYWRlckJsb2NrKGJsb2NrOiBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3QgYXRIZWFkZXJSZSA9IC9eIytcXHMrQFxccysvO1xuICBjb25zdCBtYXRjaCA9IGJsb2NrWzBdLm1hdGNoKGF0SGVhZGVyUmUpO1xuICBpZiAobWF0Y2gpIHtcbiAgICBjb25zdCBsaW5lID0gYmxvY2tbMF0uc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICBsZXQgW3Byb21wdCwgcmVzcG9uc2VdID0gbGluZS5zcGxpdCgnQCcpLm1hcChzID0+IHMudHJpbSgpKTtcblxuICAgIC8vIHByb2Nlc3MgbGluZSBhbmQgYmxvY2suXG4gICAgY29uc3QgaGFzUmVzcG9uc2UgPSAhIXJlc3BvbnNlO1xuICAgIGNvbnN0IGhhc1BsZWFzZVBhcnNlID1cbiAgICAgICAgdGFrZVdoaWxlKGJsb2NrLnNsaWNlKDEpLCBzID0+IHMuc3RhcnRzV2l0aCgnLSBAJykpLnNvbWUocyA9PiBzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgY29uc3QgaGFzRnVyaWdhbmEgPSB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChGVVJJR0FOQV9CTE9DSykpO1xuICAgIGlmICghaGFzUmVzcG9uc2UgfHwgaGFzUGxlYXNlUGFyc2UgfHwgIWhhc0Z1cmlnYW5hKSB7XG4gICAgICBjb25zdCBwYXJzZWQ6IFBhcnNlZCA9IGF3YWl0IHBhcnNlKGxpbmUpO1xuICAgICAgaWYgKCFoYXNSZXNwb25zZSkge1xuICAgICAgICByZXNwb25zZSA9IGthdGEyaGlyYShmbGF0dGVuKHBhcnNlZC5idW5zZXRzdXMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAuZmlsdGVyKG0gPT4gbS5wYXJ0T2ZTcGVlY2hbMF0gIT09ICdzdXBwbGVtZW50YXJ5X3N5bWJvbCcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKG1vcnBoZW1lVG9SZWFkaW5nKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmpvaW4oJycpKTtcbiAgICAgICAgYmxvY2tbMF0gPSBibG9ja1swXSArICcgQCAnICsgcmVzcG9uc2U7XG4gICAgICB9XG4gICAgICBpZiAoaGFzUGxlYXNlUGFyc2UpIHtcbiAgICAgICAgLy8gYWRkIEBmbGFzaCBsaW5lc1xuICAgICAgICBsZXQgZmxhc2hCdWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBmb3IgKGxldCBbbWlkeCwgbW9ycGhlbWVdIG9mIGVudW1lcmF0ZShwYXJzZWQubW9ycGhlbWVzKSkge1xuICAgICAgICAgIGlmIChmbGFzaGFibGVNb3JwaGVtZShtb3JwaGVtZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IG1wcm9tcHQgPSAobW9ycGhlbWUucGFydE9mU3BlZWNoWzFdID09PSAncHJvcGVyJykgPyBtb3JwaGVtZS5saXRlcmFsIDogbW9ycGhlbWUubGVtbWE7XG4gICAgICAgICAgICBjb25zdCBtcmVzcG9uc2UgPSAobW9ycGhlbWUucGFydE9mU3BlZWNoWzFdID09PSAncHJvcGVyJykgPyBrYXRhMmhpcmEobW9ycGhlbWUucHJvbnVuY2lhdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGthdGEyaGlyYShtb3JwaGVtZS5sZW1tYVJlYWRpbmcpO1xuXG4gICAgICAgICAgICBjb25zdCBsZWZ0ID0gcGFyc2VkLm1vcnBoZW1lcy5zbGljZSgwLCBtaWR4KS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgY29uc3QgcmlnaHQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKG1pZHggKyAxKS5tYXAobSA9PiBtLmxpdGVyYWwpLmpvaW4oJycpO1xuICAgICAgICAgICAgbGV0IGNsb3plID0gZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIG1vcnBoZW1lLmxpdGVyYWwsIHJpZ2h0KTtcbiAgICAgICAgICAgIGxldCBmaW5hbCA9ICcnO1xuICAgICAgICAgICAgaWYgKG1wcm9tcHQgPT09IG1vcnBoZW1lLmxpdGVyYWwgJiYgYXBwZWFyc0V4YWN0bHlPbmNlKHByb21wdCwgbW9ycGhlbWUubGl0ZXJhbCkpIHtcbiAgICAgICAgICAgICAgZmluYWwgPSBgLSBAICR7bXByb21wdH0gQCAke21yZXNwb25zZX0gICAgQHBvcyAke21vcnBoZW1lLnBhcnRPZlNwZWVjaC5qb2luKCctJyl9YDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGZpbmFsID0gYC0gQCAke21wcm9tcHR9IEAgJHttcmVzcG9uc2V9ICAgIEBwb3MgJHttb3JwaGVtZS5wYXJ0T2ZTcGVlY2guam9pbignLScpfSBAb21pdCAke2Nsb3plfWA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaGFzS2FuamkobXByb21wdCkpIHtcbiAgICAgICAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCBwYXJzZWRUb0Z1cmlnYW5hKFttb3JwaGVtZV0pO1xuICAgICAgICAgICAgICBmaW5hbCArPSBgIEBmdXJpZ2FuYSAke2Z1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKX1gXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZsYXNoQnVsbGV0cy5wdXNoKGZpbmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmZsYXNoQnVsbGV0cyk7XG5cbiAgICAgICAgLy8gYWRkIEBmaWxsIGxpbmVzXG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5pZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIEBwbGVhc2VQYXJzZVxuICAgICAgICBibG9jayA9IGJsb2NrLmZpbHRlcihzID0+ICFzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgICB9XG4gICAgICBpZiAoIWhhc0Z1cmlnYW5hICYmIGhhc0thbmppKHByb21wdCkpIHtcbiAgICAgICAgLy8gYWRkIGZ1cmlnYW5hIGxpbmVcbiAgICAgICAgY29uc3QgZnVyaWdhbmEgPSBhd2FpdCBwYXJzZWRUb0Z1cmlnYW5hKHBhcnNlZC5tb3JwaGVtZXMpO1xuICAgICAgICBibG9jay5zcGxpY2UoMSwgMCwgYCR7RlVSSUdBTkFfQkxPQ0t9ICR7ZnVyaWdhbmEubWFwKGZ1cmlnYW5hVG9TdHJpbmcpLmpvaW4oJycpfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gYmxvY2s7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHBhcnNlZFRvRnVyaWdhbmEobW9ycGhlbWVzOiBNb3JwaGVtZVtdKSB7XG4gIGNvbnN0IGZ1cmlnYW5hOiBGdXJpZ2FuYVtdW10gPSBhd2FpdCBQcm9taXNlLmFsbChtb3JwaGVtZXMubWFwKGFzeW5jIG0gPT4ge1xuICAgIGNvbnN0IHtsZW1tYSwgbGVtbWFSZWFkaW5nLCBsaXRlcmFsLCBwcm9udW5jaWF0aW9ufSA9IG07XG4gICAgaWYgKGhhc0thbmppKGxpdGVyYWwpKSB7XG4gICAgICBjb25zdCB7dGV4dFRvRW50cnksIHJlYWRpbmdUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICBjb25zdCBsaXRlcmFsSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsaXRlcmFsLCAncmVhZGluZycsIHByb251bmNpYXRpb24pO1xuICAgICAgaWYgKGxpdGVyYWxIaXQpIHsgcmV0dXJuIGxpdGVyYWxIaXQuZnVyaWdhbmE7IH1cbiAgICAgIGNvbnN0IHByb251bmNpYXRpb25IaXQgPSBzZWFyY2gocmVhZGluZ1RvRW50cnksIHByb251bmNpYXRpb24sICd0ZXh0JywgbGl0ZXJhbCk7XG4gICAgICBpZiAocHJvbnVuY2lhdGlvbkhpdCkgeyByZXR1cm4gcHJvbnVuY2lhdGlvbkhpdC5mdXJpZ2FuYTsgfVxuXG4gICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgIGlmIChsZW1tYUhpdCkge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYURpY3Q6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG4gICAgICAgIGZvciAoY29uc3QgZiBvZiBsZW1tYUhpdC5mdXJpZ2FuYSkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZiA9PT0gJ3N0cmluZycpIHsgY29udGludWU7IH1cbiAgICAgICAgICBmdXJpZ2FuYURpY3Quc2V0KGYucnVieSwgZi5ydCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjaGFycyA9IGxpdGVyYWwuc3BsaXQoJycpO1xuICAgICAgICBsZXQga2FuamkgPSBjaGFycy5maWx0ZXIoaGFzS2FuamkpO1xuICAgICAgICBjb25zdCBhbm5vdGF0ZWRDaGFyczogRnVyaWdhbmFbXSA9IGNoYXJzLnNsaWNlKCk7XG5cbiAgICAgICAgLy8gc3RhcnQgZnJvbSBhbGwga2FuamkgY2hhcmFjdGVycyBpbiBhIHN0cmluZywgc2VlIGlmIHRoYXQncyBpbiBmdXJpZ2FuYURpY3QsIGlmIG5vdCwgY2hvcCBsYXN0XG4gICAgICAgIHdoaWxlIChrYW5qaS5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBoaXQgPSB0cml1KGthbmppKS5maW5kKGtzID0+IGZ1cmlnYW5hRGljdC5oYXMoa3Muam9pbignJykpKTtcbiAgICAgICAgICBpZiAoaGl0KSB7XG4gICAgICAgICAgICBjb25zdCBoaXRzdHIgPSBoaXQuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCBpZHggPSBsaXRlcmFsLmluZGV4T2YoaGl0c3RyKTtcbiAgICAgICAgICAgIGFubm90YXRlZENoYXJzW2lkeF0gPSB7cnVieTogaGl0c3RyLCBydDogZnVyaWdhbmFEaWN0LmdldChoaXRzdHIpIHx8IGhpdHN0cn07XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gaWR4ICsgMTsgaSA8IGlkeCArIGhpdHN0ci5sZW5ndGg7IGkrKykgeyBhbm5vdGF0ZWRDaGFyc1tpXSA9ICcnOyB9XG4gICAgICAgICAgICBrYW5qaSA9IGthbmppLnNsaWNlKGhpdHN0ci5sZW5ndGgpO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhbm5vdGF0ZWRDaGFycztcbiAgICAgIH1cbiAgICAgIC8vIGNvbnN0IGxlbW1hUmVhZGluZ0hpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgbGVtbWFSZWFkaW5nLCAndGV4dCcsIGxlbW1hKTtcbiAgICAgIC8vIGlmIChsZW1tYVJlYWRpbmdIaXQpIHsgcmV0dXJuIGxlbW1hUmVhZGluZ0hpdC5mdXJpZ2FuYTsgfVxuICAgIH1cbiAgICByZXR1cm4gW2hhc0thbmppKGxpdGVyYWwpID8ge3J1Ynk6IGxpdGVyYWwsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsaXRlcmFsXTtcbiAgfSkpO1xuXG4gIHJldHVybiBmdXJpZ2FuYTtcbn1cblxuZnVuY3Rpb24gdHJpdTxUPihhcnI6IFRbXSk6IFRbXVtdIHtcbiAgY29uc3QgcmV0OiBUW11bXSA9IFtdO1xuICBmb3IgKGxldCBpID0gYXJyLmxlbmd0aDsgaSA+IDA7IC0taSkgeyByZXQucHVzaChhcnIuc2xpY2UoMCwgaSkpOyB9XG4gIHJldHVybiByZXQ7XG59XG5cbmZ1bmN0aW9uIHNlYXJjaChtYXA6IE1hcDxzdHJpbmcsIEVudHJ5W10+LCBmaXJzdDogc3RyaW5nLCBzdWI6ICdyZWFkaW5nJ3wndGV4dCcsIHNlY29uZDogc3RyaW5nKTogRW50cnl8dW5kZWZpbmVkIHtcbiAgY29uc3QgaGl0ID0gbWFwLmdldChmaXJzdCk7XG4gIGlmIChoaXQpIHtcbiAgICBpZiAoaGl0Lmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gaGl0WzBdOyB9XG4gICAgY29uc3Qgc3ViaGl0ID0gaGl0LmZpbmQoZSA9PiBrYXRhMmhpcmEoZVtzdWJdKSA9PT0ga2F0YTJoaXJhKHNlY29uZCkpO1xuICAgIGlmIChzdWJoaXQpIHsgcmV0dXJuIHN1YmhpdDsgfVxuICAgIGNvbnNvbGUuZXJyb3IoYGZvdW5kIGhpdCBmb3IgJHtmaXJzdH0gYnV0IG5vdCAke3NlY29uZH1gLCB7aGl0fSk7XG4gIH1cbn1cblxuLyoqXG4gKiBFbnN1cmUgbmVlZGxlIGlzIGZvdW5kIGluIGhheXN0YWNrIG9ubHkgb25jZVxuICogQHBhcmFtIGhheXN0YWNrIGJpZyBzdHJpbmdcbiAqIEBwYXJhbSBuZWVkbGUgbGl0dGxlIHN0cmluZ1xuICovXG5mdW5jdGlvbiBhcHBlYXJzRXhhY3RseU9uY2UoaGF5c3RhY2s6IHN0cmluZywgbmVlZGxlOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgbGV0IGhpdDogbnVtYmVyO1xuICByZXR1cm4gKGhpdCA9IGhheXN0YWNrLmluZGV4T2YobmVlZGxlKSkgPj0gMCAmJiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUsIGhpdCArIDEpKSA8IDA7XG59XG4vKipcbiAqIEdpdmVuIHRocmVlIGNvbnNlY3V0aWVzIHN1YnN0cmluZ3MgKHRoZSBhcmd1bWVudHMpLCByZXR1cm4gZWl0aGVyXG4gKiAtIGAke2xlZnQyfVske2Nsb3plfV0ke3JpZ2h0Mn1gIHdoZXJlIGBsZWZ0MmAgYW5kIGByaWdodDJgIGFyZSBhcyBzaG9ydCBhcyBwb3NzaWJsZSAoYW5kIG9mIGVxdWFsIGxlbmd0aCwgaWZcbiAqICAgIHBvc3NpYmxlKSBzbyB0aGUgdGhpcyByZXR1cm4gc3RyaW5nIChtaW51cyB0aGUgYnJhY2tldHMpIGlzIHVuaXF1ZSBpbiB0aGUgZnVsbCBzdHJpbmcsIG9yXG4gKiAtIGAke2Nsb3plfWAgaWYgYGxlZnQyID09PSByaWdodDIgPT09ICcnYCAoaS5lLiwgdGhlIGFib3ZlIGJ1dCB3aXRob3V0IHRoZSBicmFja2V0cykuXG4gKiBAcGFyYW0gbGVmdCBsZWZ0IHN0cmluZywgcG9zc2libHkgZW1wdHlcbiAqIEBwYXJhbSBjbG96ZSBtaWRkbGUgc3RyaW5nXG4gKiBAcGFyYW0gcmlnaHQgcmlnaHQgc3RyaW5nLCBwb3NzaWJsZSBlbXB0eVxuICogQHRocm93cyBpbiB0aGUgdW5saWtlbHkgZXZlbnQgdGhhdCBzdWNoIGEgcmV0dXJuIHN0cmluZyBjYW5ub3QgYmUgYnVpbGQgKEkgY2Fubm90IHRoaW5rIG9mIGFuIGV4YW1wbGUgdGhvdWdoKVxuICovXG5mdW5jdGlvbiBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdDogc3RyaW5nLCBjbG96ZTogc3RyaW5nLCByaWdodDogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VudGVuY2UgPSBsZWZ0ICsgY2xvemUgKyByaWdodDtcbiAgbGV0IGxlZnRDb250ZXh0ID0gJyc7XG4gIGxldCByaWdodENvbnRleHQgPSAnJztcbiAgbGV0IGNvbnRleHRMZW5ndGggPSAwO1xuICB3aGlsZSAoIWFwcGVhcnNFeGFjdGx5T25jZShzZW50ZW5jZSwgbGVmdENvbnRleHQgKyBjbG96ZSArIHJpZ2h0Q29udGV4dCkpIHtcbiAgICBjb250ZXh0TGVuZ3RoKys7XG4gICAgaWYgKGNvbnRleHRMZW5ndGggPj0gbGVmdC5sZW5ndGggJiYgY29udGV4dExlbmd0aCA+PSByaWdodC5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignUmFuIG91dCBvZiBjb250ZXh0IHRvIGJ1aWxkIHVuaXF1ZSBjbG96ZScpO1xuICAgIH1cbiAgICBsZWZ0Q29udGV4dCA9IGxlZnQuc2xpY2UoLWNvbnRleHRMZW5ndGgpO1xuICAgIHJpZ2h0Q29udGV4dCA9IHJpZ2h0LnNsaWNlKDAsIGNvbnRleHRMZW5ndGgpO1xuICB9XG4gIGlmIChsZWZ0Q29udGV4dCA9PT0gJycgJiYgcmlnaHRDb250ZXh0ID09PSAnJykgeyByZXR1cm4gY2xvemU7IH1cbiAgcmV0dXJuIGAke2xlZnRDb250ZXh0fVske2Nsb3plfV0ke3JpZ2h0Q29udGV4dH1gO1xufVxuXG5mdW5jdGlvbiBpZGVudGlmeUZpbGxJbkJsYW5rcyhidW5zZXRzdXM6IE1vcnBoZW1lW11bXSkge1xuICAvLyBGaW5kIGNsb3plczogcGFydGljbGVzIGFuZCBjb25qdWdhdGVkIHZlcmIvYWRqZWN0aXZlIHBocmFzZXNcbiAgbGV0IGxpdGVyYWxDbG96ZXM6IE1hcDxzdHJpbmcsIE1vcnBoZW1lW10+ID0gbmV3IE1hcChbXSk7XG4gIGZvciAobGV0IFtiaWR4LCBidW5zZXRzdV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1cykpIHtcbiAgICBsZXQgZmlyc3QgPSBidW5zZXRzdVswXTtcbiAgICBpZiAoIWZpcnN0KSB7IGNvbnRpbnVlOyB9XG4gICAgY29uc3QgcG9zMCA9IGZpcnN0LnBhcnRPZlNwZWVjaFswXTtcbiAgICBsZXQgc2VhcmNoRm9yUGFydGljbGVzID0gdHJ1ZTtcbiAgICBpZiAoYnVuc2V0c3UubGVuZ3RoID4gMSAmJiAocG9zMC5zdGFydHNXaXRoKCd2ZXJiJykgfHwgcG9zMC5lbmRzV2l0aCgnX3ZlcmInKSB8fCBwb3MwLnN0YXJ0c1dpdGgoJ2FkamVjdCcpKSkge1xuICAgICAgbGV0IGlnbm9yZVJpZ2h0ID0gZmlsdGVyUmlnaHQoYnVuc2V0c3UsIG0gPT4gIWdvb2RNb3JwaGVtZVByZWRpY2F0ZShtKSk7XG4gICAgICBsZXQgZ29vZEJ1bnNldHN1ID0gaWdub3JlUmlnaHQubGVuZ3RoID09PSAwID8gYnVuc2V0c3UgOiBidW5zZXRzdS5zbGljZSgwLCAtaWdub3JlUmlnaHQubGVuZ3RoKTtcbiAgICAgIGlmIChnb29kQnVuc2V0c3UubGVuZ3RoID4gMSkge1xuICAgICAgICBzZWFyY2hGb3JQYXJ0aWNsZXMgPSBmYWxzZTtcbiAgICAgICAgbGV0IGNsb3plID0gYnVuc2V0c3VUb1N0cmluZyhnb29kQnVuc2V0c3UpO1xuICAgICAgICBsZXQgbGVmdCA9IGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxldCByaWdodCA9IGJ1bnNldHN1VG9TdHJpbmcoaWdub3JlUmlnaHQpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgIGxpdGVyYWxDbG96ZXMuc2V0KGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0LCBjbG96ZSwgcmlnaHQpLCBnb29kQnVuc2V0c3UpO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBvbmx5IGFkZCBwYXJ0aWNsZXMgaWYgdGhleSdyZSBOT1QgaW5zaWRlIGNvbmp1Z2F0ZWQgcGhyYXNlc1xuICAgIGNvbnN0IHBhcnRpY2xlUHJlZGljYXRlID0gKHA6IE1vcnBoZW1lKSA9PiBwLnBhcnRPZlNwZWVjaFswXS5zdGFydHNXaXRoKCdwYXJ0aWNsZScpICYmIHAucGFydE9mU3BlZWNoLmxlbmd0aCA+IDEgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIXAucGFydE9mU3BlZWNoWzFdLnN0YXJ0c1dpdGgoJ3BocmFzZV9maW5hbCcpO1xuICAgIGlmIChzZWFyY2hGb3JQYXJ0aWNsZXMpIHtcbiAgICAgIGZvciAobGV0IFtwaWR4LCBwYXJ0aWNsZV0gb2YgZW51bWVyYXRlKGJ1bnNldHN1KSkge1xuICAgICAgICBpZiAocGFydGljbGVQcmVkaWNhdGUocGFydGljbGUpKSB7XG4gICAgICAgICAgbGV0IGxlZnQgPVxuICAgICAgICAgICAgICBidW5zZXRzdXMuc2xpY2UoMCwgYmlkeCkubWFwKGJ1bnNldHN1VG9TdHJpbmcpLmpvaW4oJycpICsgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZSgwLCBwaWR4KSk7XG4gICAgICAgICAgbGV0IHJpZ2h0ID1cbiAgICAgICAgICAgICAgYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdS5zbGljZShwaWR4ICsgMSkpICsgYnVuc2V0c3VzLnNsaWNlKGJpZHggKyAxKS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJyk7XG4gICAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIHBhcnRpY2xlLmxpdGVyYWwsIHJpZ2h0KSwgW3BhcnRpY2xlXSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgbGV0IGV4aXN0aW5nQ2xvemVzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW10pO1xuICBsZXQgYnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgZm9yIChsZXQgW2Nsb3plLCBidW5zZXRzdV0gb2YgbGl0ZXJhbENsb3plcykge1xuICAgIGlmICghZXhpc3RpbmdDbG96ZXMuaGFzKGNsb3plKSkge1xuICAgICAgbGV0IGFjY2VwdGFibGUgPSBbY2xvemVdO1xuICAgICAgaWYgKGhhc0thbmppKGJ1bnNldHN1VG9TdHJpbmcoYnVuc2V0c3UpKSkge1xuICAgICAgICBhY2NlcHRhYmxlLnB1c2goa2F0YTJoaXJhKGJ1bnNldHN1Lm1hcChtID0+IG0ucHJvbnVuY2lhdGlvbikuam9pbignJykpKVxuICAgICAgfVxuICAgICAgYnVsbGV0cy5wdXNoKCctIEBmaWxsICcgKyBhY2NlcHRhYmxlLmpvaW4oJyBAICcpICtcbiAgICAgICAgICAgICAgICAgICBgICAgIEBwb3MgJHtidW5zZXRzdS5tYXAobSA9PiBtLnBhcnRPZlNwZWVjaC5qb2luKCctJykpLmpvaW4oJy8nKX1gKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ1bGxldHM7XG59XG5cbmNvbnN0IFVTQUdFID0gYFVTQUdFIDE6XG4kIG5vZGUgW3RoaXMtc2NyaXB0LmpzXSBbbWFya2Rvd24ubWRdXG5cblVTQUdFIDI6XG4kIGNhdCBbbWFya2Rvd24ubWRdIHwgbm9kZSBbdGhpcy1zY3JpcHQuanNdXG5cbkJvdGggd2lsbCBwcmludCBhIHBhcnNlZCB2ZXJzaW9uIG9mIHRoZSBpbnB1dC5gO1xuaWYgKHJlcXVpcmUubWFpbiA9PT0gbW9kdWxlKSB7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IHJlYWRGaWxlID0gcHJvbWlzaWZ5KHJlcXVpcmUoJ2ZzJykucmVhZEZpbGUpO1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgY29uc3QgdGV4dCA9IHByb2Nlc3MuYXJndlsyXSA/IGF3YWl0IHJlYWRGaWxlKHByb2Nlc3MuYXJndlsyXSwgJ3V0ZjgnKSA6ICgoYXdhaXQgZ2V0U3RkaW4oKSkgfHwgVVNBR0UpO1xuICAgIC8vIFNwbGl0IE1hcmtkb3duIGF0IGhlYWRlciAoYCMgYmxhYmxhYClcbiAgICBsZXQgYmxvY2tzID0gc3BsaXRBdEhlYWRlcnModGV4dCk7XG4gICAgLy8gUGFyc2UgaGVhZGVyc1xuICAgIGxldCBjb250ZW50ID0gYXdhaXQgcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzKTtcbiAgICAvLyBQcmludCByZXN1bHRcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZShjb250ZW50Lm1hcCh2ID0+IHYuam9pbignXFxuJykpLmpvaW4oJ1xcbicpKTtcbiAgfSkoKTtcbn0iXX0=