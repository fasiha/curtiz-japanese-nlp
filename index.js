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
    if (!curtiz_utils_1.hasKanji(m.literal)) {
        return m.literal;
    }
    const ret = kana_1.kata2hira(m.literal === m.lemma ? m.lemmaReading : m.pronunciation);
    if (!ret.includes(CHOUONPU)) {
        return ret;
    }
    const alts = findAlternativeChouonpu(ret);
    return alts[1] || ret;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLG1DQUFpQztBQUNqQyxpQ0FBaUM7QUFDakMsK0NBQWtIO0FBQ2xILCtDQUErRjtBQUMvRiwrREFBZ0c7QUFFaEcsTUFBTSxjQUFjLEdBQUcsNEJBQUssRUFBRSxDQUFDO0FBRS9CLFNBQXNCLEtBQUssQ0FBQyxRQUFnQjs7UUFDMUMsSUFBSSxRQUFRLEdBQUcsTUFBTSx5QkFBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNDLElBQUksU0FBUyxHQUFHLHVDQUF5QixDQUFDLHdCQUFVLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzlGLElBQUksU0FBUyxHQUFHLE1BQU0sZ0JBQVEsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEQsT0FBTyxFQUFDLFNBQVMsRUFBRSxTQUFTLEVBQUMsQ0FBQztJQUNoQyxDQUFDO0NBQUE7QUFMRCxzQkFLQztBQUVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxTQUFxQixFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUUzRixTQUFnQixjQUFjLENBQUMsSUFBWTtJQUN6QyxNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUM7SUFDN0IsT0FBTywwQkFBVyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7QUFDOUQsQ0FBQztBQUhELHdDQUdDO0FBRUQs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QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxRQUFRLEVBQUUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO1lBQ3ZHLHdDQUF3QztZQUN4QyxJQUFJLE1BQU0sR0FBRyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDbEMsZ0JBQWdCO1lBQ2hCLElBQUksT0FBTyxHQUFHLE1BQU0sb0JBQW9CLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDakQsZUFBZTtZQUNmLE9BQU8sQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDbEUsQ0FBQztLQUFBLENBQUMsRUFBRSxDQUFDO0NBQ04iLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5pbXBvcnQge2FkZEpkZXBwfSBmcm9tICcuL2pkZXBwJztcbmltcG9ydCB7a2F0YTJoaXJhfSBmcm9tICcuL2thbmEnO1xuaW1wb3J0IHtnb29kTW9ycGhlbWVQcmVkaWNhdGUsIGludm9rZU1lY2FiLCBtYXliZU1vcnBoZW1lc1RvTW9ycGhlbWVzLCBNb3JwaGVtZSwgcGFyc2VNZWNhYn0gZnJvbSAnLi9tZWNhYlVuaWRpYyc7XG5pbXBvcnQge2VudW1lcmF0ZSwgZmlsdGVyUmlnaHQsIGZsYXR0ZW4sIGhhc0thbmppLCBwYXJ0aXRpb25CeSwgdGFrZVdoaWxlfSBmcm9tICdjdXJ0aXotdXRpbHMnO1xuaW1wb3J0IHtFbnRyeSwgZnVyaWdhbmFUb1N0cmluZywgRnVyaWdhbmEsIHNldHVwLCBzdHJpbmdUb0Z1cmlnYW5hfSBmcm9tICdqbWRpY3QtZnVyaWdhbmEtbm9kZSc7XG5cbmNvbnN0IEptZGljdEZ1cmlnYW5hID0gc2V0dXAoKTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlKHNlbnRlbmNlOiBzdHJpbmcpOiBQcm9taXNlPHttb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO30+IHtcbiAgbGV0IHJhd01lY2FiID0gYXdhaXQgaW52b2tlTWVjYWIoc2VudGVuY2UpO1xuICBsZXQgbW9ycGhlbWVzID0gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyhwYXJzZU1lY2FiKHNlbnRlbmNlLCByYXdNZWNhYilbMF0uZmlsdGVyKG8gPT4gISFvKSk7XG4gIGxldCBidW5zZXRzdXMgPSBhd2FpdCBhZGRKZGVwcChyYXdNZWNhYiwgbW9ycGhlbWVzKTtcbiAgcmV0dXJuIHttb3JwaGVtZXMsIGJ1bnNldHN1c307XG59XG5cbmNvbnN0IGJ1bnNldHN1VG9TdHJpbmcgPSAobW9ycGhlbWVzOiBNb3JwaGVtZVtdKSA9PiBtb3JwaGVtZXMubWFwKG0gPT4gbS5saXRlcmFsKS5qb2luKCcnKTtcblxuZXhwb3J0IGZ1bmN0aW9uIHNwbGl0QXRIZWFkZXJzKHRleHQ6IHN0cmluZyk6IHN0cmluZ1tdW10ge1xuICBjb25zdCBoZWFkZXJSZSA9IC9eIytcXHMrLiskLztcbiAgcmV0dXJuIHBhcnRpdGlvbkJ5KHRleHQuc3BsaXQoJ1xcbicpLCBzID0+IGhlYWRlclJlLnRlc3QocykpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBbGxIZWFkZXJCbG9ja3MoYmxvY2tzOiBzdHJpbmdbXVtdLCBjb25jdXJyZW50TGltaXQ6IG51bWJlciA9IDEpIHtcbiAgbGV0IHJldDogc3RyaW5nW11bXSA9IFtdO1xuICBsZXQgcHJvbWlzZXM6IFByb21pc2U8c3RyaW5nW10+W10gPSBbXTtcbiAgY29uc3Qgc2VlbjogTWFwPHN0cmluZywgU2Vlbj4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgbyBvZiBibG9ja3MpIHtcbiAgICBpZiAocHJvbWlzZXMubGVuZ3RoID49IGNvbmN1cnJlbnRMaW1pdCkge1xuICAgICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIGZvciAoY29uc3QgbyBvZiB0aGlzUmV0KSB7IHJldC5wdXNoKG8pOyB9XG4gICAgICBwcm9taXNlcyA9IFtdO1xuICAgIH1cbiAgICBwcm9taXNlcy5wdXNoKHBhcnNlSGVhZGVyQmxvY2sobywgc2VlbikpO1xuICB9XG4gIGlmIChwcm9taXNlcy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgdGhpc1JldCA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBmb3IgKGNvbnN0IG8gb2YgdGhpc1JldCkgeyByZXQucHVzaChvKTsgfVxuICB9XG4gIHJldHVybiByZXQ7XG59XG5cbmNvbnN0IFBMRUFTRV9QQVJTRV9CTE9DSyA9ICctIEBwbGVhc2VQYXJzZSc7XG5jb25zdCBGVVJJR0FOQV9CTE9DSyA9ICctIEBmdXJpZ2FuYSc7XG5cbmNvbnN0IGZsYXNoYWJsZU1vcnBoZW1lID0gKG06IE1vcnBoZW1lKSA9PiB7XG4gIGNvbnN0IHBvcyA9IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKTtcbiAgaWYgKGhhc0thbmppKG0ubGl0ZXJhbCkgJiYgIXBvcy5lbmRzV2l0aCgnbnVtZXJhbCcpKSB7IHJldHVybiB0cnVlOyB9XG4gIGlmIChwb3MuZW5kc1dpdGgoJ251bWVyYWwnKSkgeyByZXR1cm4gZmFsc2U7IH1cbiAgaWYgKHBvcy5zdGFydHNXaXRoKCd2ZXJiLScpIHx8IHBvcy5zdGFydHNXaXRoKCdub3VuJykgfHwgcG9zLnN0YXJ0c1dpdGgoJ3Byb25vdW4nKSB8fCBwb3Muc3RhcnRzV2l0aCgnYWRqZWN0aXYnKSB8fFxuICAgICAgcG9zLnN0YXJ0c1dpdGgoJ2FkdmVyYicpKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcbmZ1bmN0aW9uIG1vcnBoZW1lVG9SZWFkaW5nKG06IE1vcnBoZW1lKTogc3RyaW5nIHtcbiAgaWYgKCFoYXNLYW5qaShtLmxpdGVyYWwpKSB7IHJldHVybiBtLmxpdGVyYWw7IH1cbiAgY29uc3QgcmV0ID0ga2F0YTJoaXJhKG0ubGl0ZXJhbCA9PT0gbS5sZW1tYSA/IG0ubGVtbWFSZWFkaW5nIDogbS5wcm9udW5jaWF0aW9uKTtcbiAgaWYgKCFyZXQuaW5jbHVkZXMoQ0hPVU9OUFUpKSB7IHJldHVybiByZXQ7IH1cbiAgY29uc3QgYWx0cyA9IGZpbmRBbHRlcm5hdGl2ZUNob3VvbnB1KHJldCk7XG4gIHJldHVybiBhbHRzWzFdIHx8IHJldDtcbn1cbnR5cGUgUGFyc2VkID0ge1xuICBtb3JwaGVtZXM6IE1vcnBoZW1lW107IGJ1bnNldHN1czogTW9ycGhlbWVbXVtdO1xufTtcbnR5cGUgU2VlbiA9IHtcbiAgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXTsgcmVhZGluZzogc3RyaW5nO1xufTtcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZUhlYWRlckJsb2NrKGJsb2NrOiBzdHJpbmdbXSwgc2VlbjogTWFwPHN0cmluZywgU2Vlbj4gPSBuZXcgTWFwKFtdKSk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgY29uc3QgYXRIZWFkZXJSZSA9IC9eIytcXHMrQFxccysvO1xuICBjb25zdCBtYXRjaCA9IGJsb2NrWzBdLm1hdGNoKGF0SGVhZGVyUmUpO1xuICBpZiAobWF0Y2gpIHtcbiAgICBjb25zdCBsaW5lID0gYmxvY2tbMF0uc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKTsgLy8gbWludXMgdGhlIGZpcnN0IEBcblxuICAgIGxldCBbcHJvbXB0LCAuLi5yZXNwb25zZXNdID0gbGluZS5zcGxpdCgnQCcpLm1hcChzID0+IHMudHJpbSgpKTtcbiAgICBjb25zdCBwcmVmaXg6IHN0cmluZ1tdID0gW107XG4gICAgLy8gcHJvY2VzcyBsaW5lIGFuZCBibG9jay5cbiAgICBjb25zdCBuZWVkc1Jlc3BvbnNlID0gcmVzcG9uc2VzLmxlbmd0aCA9PT0gMSAmJiByZXNwb25zZXNbMF0ubGVuZ3RoID09IDA7XG4gICAgY29uc3QgaGFzUGxlYXNlUGFyc2UgPVxuICAgICAgICB0YWtlV2hpbGUoYmxvY2suc2xpY2UoMSksIHMgPT4gcy5zdGFydHNXaXRoKCctIEAnKSkuc29tZShzID0+IHMuc3RhcnRzV2l0aChQTEVBU0VfUEFSU0VfQkxPQ0spKTtcbiAgICBjb25zdCBoYXNGdXJpZ2FuYSA9IHRha2VXaGlsZShibG9jay5zbGljZSgxKSwgcyA9PiBzLnN0YXJ0c1dpdGgoJy0gQCcpKS5zb21lKHMgPT4gcy5zdGFydHNXaXRoKEZVUklHQU5BX0JMT0NLKSk7XG4gICAgaWYgKG5lZWRzUmVzcG9uc2UgfHwgaGFzUGxlYXNlUGFyc2UgfHwgIWhhc0Z1cmlnYW5hKSB7XG4gICAgICBjb25zdCBwYXJzZWQ6IFBhcnNlZCA9IGF3YWl0IHBhcnNlKHByb21wdCk7XG4gICAgICBpZiAobmVlZHNSZXNwb25zZSkge1xuICAgICAgICByZXNwb25zZXMgPSBba2F0YTJoaXJhKGZsYXR0ZW4ocGFyc2VkLmJ1bnNldHN1cylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLmZpbHRlcihtID0+IG0ucGFydE9mU3BlZWNoWzBdICE9PSAnc3VwcGxlbWVudGFyeV9zeW1ib2wnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAubWFwKG0gPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGhpdCA9IHNlZW4uZ2V0KG0ubGl0ZXJhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGhpdCA/IGhpdC5yZWFkaW5nIDogbW9ycGhlbWVUb1JlYWRpbmcobSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5qb2luKCcnKSldO1xuICAgICAgICBibG9ja1swXSA9IGJsb2NrWzBdICsgKGJsb2NrWzBdLmVuZHNXaXRoKCcgJykgPyAnJyA6ICcgJykgKyByZXNwb25zZXNbMF07XG4gICAgICB9XG4gICAgICBpZiAoaGFzUGxlYXNlUGFyc2UpIHtcbiAgICAgICAgLy8gYWRkIEAgdm9jYWJ1bGFyeSBsaW5lczpcbiAgICAgICAgbGV0IGZsYXNoQnVsbGV0czogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgZm9yIChsZXQgW21pZHgsIG1vcnBoZW1lXSBvZiBlbnVtZXJhdGUocGFyc2VkLm1vcnBoZW1lcykpIHtcbiAgICAgICAgICBpZiAocGFyc2VkLm1vcnBoZW1lcy5sZW5ndGggPT09IDEpIHsgYnJlYWs7IH1cbiAgICAgICAgICBpZiAoZmxhc2hhYmxlTW9ycGhlbWUobW9ycGhlbWUpKSB7XG4gICAgICAgICAgICBsZXQge3Byb21wdDogbXByb21wdCwgcmVzcG9uc2U6IG1yZXNwb25zZX0gPSBtb3JwaGVtZVRvUHJvbXB0UmVzcG9uc2UobW9ycGhlbWUpO1xuXG4gICAgICAgICAgICBsZXQgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IFtdO1xuICAgICAgICAgICAgaWYgKGhhc0thbmppKG1wcm9tcHQpKSB7IGZ1cmlnYW5hID0gYXdhaXQgdm9jYWJUb0Z1cmlnYW5hKFttb3JwaGVtZV0pOyB9XG5cbiAgICAgICAgICAgIGNvbnN0IGhpdCA9IHNlZW4uZ2V0KG1wcm9tcHQpO1xuICAgICAgICAgICAgaWYgKCFoaXQpIHtcbiAgICAgICAgICAgICAgcHJlZml4LnB1c2gobWF0Y2hbMF0gKyBgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfWApO1xuICAgICAgICAgICAgICBwcmVmaXgucHVzaChGVVJJR0FOQV9CTE9DSyArICcgJyArIGZ1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKSk7XG4gICAgICAgICAgICAgIHByZWZpeC5wdXNoKGAoQXV0by1hZGRlZCB2aWEg44COJHtwcm9tcHR944CPKWApO1xuICAgICAgICAgICAgICBzZWVuLnNldChtcHJvbXB0LCB7ZnVyaWdhbmEsIHJlYWRpbmc6IG1yZXNwb25zZX0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgbXJlc3BvbnNlID0gaGl0LnJlYWRpbmc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGxlZnQgPSBwYXJzZWQubW9ycGhlbWVzLnNsaWNlKDAsIG1pZHgpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBjb25zdCByaWdodCA9IHBhcnNlZC5tb3JwaGVtZXMuc2xpY2UobWlkeCArIDEpLm1hcChtID0+IG0ubGl0ZXJhbCkuam9pbignJyk7XG4gICAgICAgICAgICBsZXQgY2xvemUgPSBnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgbW9ycGhlbWUubGl0ZXJhbCwgcmlnaHQpO1xuICAgICAgICAgICAgbGV0IGZpbmFsID0gJyc7XG4gICAgICAgICAgICBpZiAobXByb21wdCA9PT0gbW9ycGhlbWUubGl0ZXJhbCAmJiBhcHBlYXJzRXhhY3RseU9uY2UocHJvbXB0LCBtb3JwaGVtZS5saXRlcmFsKSkge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfWA7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBmaW5hbCA9IGAtIEAgJHttcHJvbXB0fSBAICR7bXJlc3BvbnNlfSBAb21pdCAke2Nsb3plfWA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZsYXNoQnVsbGV0cy5wdXNoKGZpbmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIC4uLmZsYXNoQnVsbGV0cyk7XG5cbiAgICAgICAgLy8gYWRkIEBmaWxsIGxpbmVzXG4gICAgICAgIGJsb2NrLnNwbGljZSgxLCAwLCAuLi5pZGVudGlmeUZpbGxJbkJsYW5rcyhwYXJzZWQuYnVuc2V0c3VzKSk7XG5cbiAgICAgICAgLy8gcmVtb3ZlIEBwbGVhc2VQYXJzZVxuICAgICAgICBibG9jayA9IGJsb2NrLmZpbHRlcihzID0+ICFzLnN0YXJ0c1dpdGgoUExFQVNFX1BBUlNFX0JMT0NLKSk7XG4gICAgICB9XG4gICAgICBpZiAoIWhhc0Z1cmlnYW5hKSB7XG4gICAgICAgIGlmIChoYXNLYW5qaShwcm9tcHQpKSB7XG4gICAgICAgICAgLy8gYWRkIGZ1cmlnYW5hIGxpbmVcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IGF3YWl0IHBhcnNlZFRvRnVyaWdhbmEocGFyc2VkLm1vcnBoZW1lcywgc2Vlbik7XG4gICAgICAgICAgYmxvY2suc3BsaWNlKDEsIDAsIGAke0ZVUklHQU5BX0JMT0NLfSAke2Z1cmlnYW5hLm1hcChmdXJpZ2FuYVRvU3RyaW5nKS5qb2luKCcnKX1gKTtcbiAgICAgICAgICBzZWVuLnNldChwcm9tcHQsIHtmdXJpZ2FuYSwgcmVhZGluZzogcmVzcG9uc2VzWzBdfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtbcmVzcG9uc2VzWzBdXV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYUJ1bGxldHMgPSBibG9jay5maWx0ZXIocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICAgICAgaWYgKGZ1cmlnYW5hQnVsbGV0cy5sZW5ndGgpIHtcbiAgICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IHN0cmluZ1RvRnVyaWdhbmEoZnVyaWdhbmFCdWxsZXRzWzBdLnNsaWNlKEZVUklHQU5BX0JMT0NLLmxlbmd0aCkpXG4gICAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtmdXJpZ2FuYV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEZJWE1FIERSWSBzYW1lIGFzIGFib3ZlXG4gICAgICBjb25zdCBmdXJpZ2FuYUJ1bGxldCA9IGJsb2NrLmZpbmQocyA9PiBzLnN0YXJ0c1dpdGgoRlVSSUdBTkFfQkxPQ0spKTtcbiAgICAgIGlmIChmdXJpZ2FuYUJ1bGxldCkge1xuICAgICAgICBjb25zdCBmdXJpZ2FuYSA9IHN0cmluZ1RvRnVyaWdhbmEoZnVyaWdhbmFCdWxsZXQuc2xpY2UoRlVSSUdBTkFfQkxPQ0subGVuZ3RoKSlcbiAgICAgICAgc2Vlbi5zZXQocHJvbXB0LCB7ZnVyaWdhbmE6IFtmdXJpZ2FuYV0sIHJlYWRpbmc6IHJlc3BvbnNlc1swXX0pO1xuICAgICAgfVxuICAgIH1cbiAgICBibG9jayA9IHByZWZpeC5jb25jYXQoYmxvY2spO1xuICB9XG4gIHJldHVybiBibG9jaztcbn1cblxuZnVuY3Rpb24gbW9ycGhlbWVUb1Byb21wdFJlc3BvbnNlKG1vcnBoZW1lOiBNb3JwaGVtZSkge1xuICAvLyB1c2UgbGVtbWEgb25seSB3aGVuIGluZmxlY3RlZCwgb3Igd2hlbiBsaXRlcmFsIGxhY2tzIGthbmppIGJ1dCBsZW1tYSBoYXMgdGhlbVxuICBjb25zdCB1c2VMZW1tYSA9XG4gICAgICAobW9ycGhlbWUuaW5mbGVjdGlvbiAmJiBtb3JwaGVtZS5pbmZsZWN0aW9uWzBdKSB8fCAoaGFzS2FuamkobW9ycGhlbWUubGVtbWEpICYmICFoYXNLYW5qaShtb3JwaGVtZS5saXRlcmFsKSk7XG4gIGNvbnN0IHByb21wdCA9IHVzZUxlbW1hID8gbW9ycGhlbWUubGVtbWEgOiBtb3JwaGVtZS5saXRlcmFsO1xuICBjb25zdCByZXNwb25zZSA9IGthdGEyaGlyYSh1c2VMZW1tYSA/IG1vcnBoZW1lLmxlbW1hUmVhZGluZyA6IG1vcnBoZW1lLnByb251bmNpYXRpb24pO1xuICB7XG4gICAgY29uc3QgbGVtbWFBbnl3YXkgPSBrYXRhMmhpcmEobW9ycGhlbWUubGVtbWFSZWFkaW5nKTtcbiAgICBpZiAoIXVzZUxlbW1hICYmIHJlc3BvbnNlLmluY2x1ZGVzKENIT1VPTlBVKSAmJiBmaW5kQWx0ZXJuYXRpdmVDaG91b25wdShyZXNwb25zZSkuZmluZChzID0+IHMgPT09IGxlbW1hQW55d2F5KSkge1xuICAgICAgcmV0dXJuIHtwcm9tcHQsIHJlc3BvbnNlOiBrYXRhMmhpcmEobW9ycGhlbWUubGVtbWFSZWFkaW5nKX07XG4gICAgfVxuICB9XG4gIHJldHVybiB7cHJvbXB0LCByZXNwb25zZX07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHZvY2FiVG9GdXJpZ2FuYShtb3JwaGVtZXM6IE1vcnBoZW1lW10pOiBQcm9taXNlPEZ1cmlnYW5hW11bXT4ge1xuICByZXR1cm4gUHJvbWlzZS5hbGwobW9ycGhlbWVzLm1hcChhc3luYyBtID0+IHtcbiAgICBjb25zdCB7cHJvbXB0OiBsZW1tYSwgcmVzcG9uc2U6IGxlbW1hUmVhZGluZ30gPSBtb3JwaGVtZVRvUHJvbXB0UmVzcG9uc2UobSk7XG4gICAgaWYgKGhhc0thbmppKGxlbW1hKSkge1xuICAgICAgY29uc3Qge3RleHRUb0VudHJ5fSA9IGF3YWl0IEptZGljdEZ1cmlnYW5hO1xuXG4gICAgICBjb25zdCBsZW1tYUhpdCA9IHNlYXJjaCh0ZXh0VG9FbnRyeSwgbGVtbWEsICdyZWFkaW5nJywgbGVtbWFSZWFkaW5nKTtcbiAgICAgIGlmIChsZW1tYUhpdCkgeyByZXR1cm4gbGVtbWFIaXQuZnVyaWdhbmE7IH1cbiAgICB9XG4gICAgcmV0dXJuIFtoYXNLYW5qaShsZW1tYSkgPyB7cnVieTogbGVtbWEsIHJ0OiBtb3JwaGVtZVRvUmVhZGluZyhtKX0gOiBsZW1tYV07XG4gIH0pKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcGFyc2VkVG9GdXJpZ2FuYShtb3JwaGVtZXM6IE1vcnBoZW1lW10sIHNlZW46IE1hcDxzdHJpbmcsIFNlZW4+KTogUHJvbWlzZTxGdXJpZ2FuYVtdW10+IHtcbiAgY29uc3QgZnVyaWdhbmE6IEZ1cmlnYW5hW11bXSA9IGF3YWl0IFByb21pc2UuYWxsKG1vcnBoZW1lcy5tYXAoYXN5bmMgbSA9PiB7XG4gICAgY29uc3Qge2xlbW1hLCBsZW1tYVJlYWRpbmcsIGxpdGVyYWwsIHByb251bmNpYXRpb259ID0gbTtcbiAgICBpZiAoaGFzS2FuamkobGl0ZXJhbCkpIHtcbiAgICAgIGNvbnN0IGhpdCA9IHNlZW4uZ2V0KGxpdGVyYWwpO1xuICAgICAgaWYgKGhpdCkgeyByZXR1cm4gZmxhdHRlbihoaXQuZnVyaWdhbmEpIHx8IFtdOyB9XG5cbiAgICAgIGNvbnN0IHt0ZXh0VG9FbnRyeSwgcmVhZGluZ1RvRW50cnl9ID0gYXdhaXQgSm1kaWN0RnVyaWdhbmE7XG5cbiAgICAgIGNvbnN0IGxpdGVyYWxIaXQgPSBzZWFyY2godGV4dFRvRW50cnksIGxpdGVyYWwsICdyZWFkaW5nJywgcHJvbnVuY2lhdGlvbik7XG4gICAgICBpZiAobGl0ZXJhbEhpdCkgeyByZXR1cm4gbGl0ZXJhbEhpdC5mdXJpZ2FuYTsgfVxuICAgICAgY29uc3QgcHJvbnVuY2lhdGlvbkhpdCA9IHNlYXJjaChyZWFkaW5nVG9FbnRyeSwgcHJvbnVuY2lhdGlvbiwgJ3RleHQnLCBsaXRlcmFsKTtcbiAgICAgIGlmIChwcm9udW5jaWF0aW9uSGl0KSB7IHJldHVybiBwcm9udW5jaWF0aW9uSGl0LmZ1cmlnYW5hOyB9XG5cbiAgICAgIGNvbnN0IGxlbW1hSGl0ID0gc2VhcmNoKHRleHRUb0VudHJ5LCBsZW1tYSwgJ3JlYWRpbmcnLCBsZW1tYVJlYWRpbmcpO1xuICAgICAgaWYgKGxlbW1hSGl0KSB7XG4gICAgICAgIGNvbnN0IGZ1cmlnYW5hRGljdDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcbiAgICAgICAgZm9yIChjb25zdCBmIG9mIGxlbW1hSGl0LmZ1cmlnYW5hKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmID09PSAnc3RyaW5nJykgeyBjb250aW51ZTsgfVxuICAgICAgICAgIGZ1cmlnYW5hRGljdC5zZXQoZi5ydWJ5LCBmLnJ0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNoYXJzID0gbGl0ZXJhbC5zcGxpdCgnJyk7XG4gICAgICAgIGxldCBrYW5qaSA9IGNoYXJzLmZpbHRlcihoYXNLYW5qaSk7XG4gICAgICAgIGNvbnN0IGFubm90YXRlZENoYXJzOiBGdXJpZ2FuYVtdID0gY2hhcnMuc2xpY2UoKTtcblxuICAgICAgICAvLyBzdGFydCBmcm9tIGFsbCBrYW5qaSBjaGFyYWN0ZXJzIGluIGEgc3RyaW5nLCBzZWUgaWYgdGhhdCdzIGluIGZ1cmlnYW5hRGljdCwgaWYgbm90LCBjaG9wIGxhc3RcbiAgICAgICAgd2hpbGUgKGthbmppLmxlbmd0aCkge1xuICAgICAgICAgIGNvbnN0IGhpdCA9IHRyaXUoa2FuamkpLmZpbmQoa3MgPT4gZnVyaWdhbmFEaWN0Lmhhcyhrcy5qb2luKCcnKSkpO1xuICAgICAgICAgIGlmIChoaXQpIHtcbiAgICAgICAgICAgIGNvbnN0IGhpdHN0ciA9IGhpdC5qb2luKCcnKTtcbiAgICAgICAgICAgIGNvbnN0IGlkeCA9IGxpdGVyYWwuaW5kZXhPZihoaXRzdHIpO1xuICAgICAgICAgICAgYW5ub3RhdGVkQ2hhcnNbaWR4XSA9IHtydWJ5OiBoaXRzdHIsIHJ0OiBmdXJpZ2FuYURpY3QuZ2V0KGhpdHN0cikgfHwgaGl0c3RyfTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSBpZHggKyAxOyBpIDwgaWR4ICsgaGl0c3RyLmxlbmd0aDsgaSsrKSB7IGFubm90YXRlZENoYXJzW2ldID0gJyc7IH1cbiAgICAgICAgICAgIGthbmppID0ga2Fuamkuc2xpY2UoaGl0c3RyLmxlbmd0aCk7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFubm90YXRlZENoYXJzO1xuICAgICAgfVxuICAgICAgLy8gY29uc3QgbGVtbWFSZWFkaW5nSGl0ID0gc2VhcmNoKHJlYWRpbmdUb0VudHJ5LCBsZW1tYVJlYWRpbmcsICd0ZXh0JywgbGVtbWEpO1xuICAgICAgLy8gaWYgKGxlbW1hUmVhZGluZ0hpdCkgeyByZXR1cm4gbGVtbWFSZWFkaW5nSGl0LmZ1cmlnYW5hOyB9XG4gICAgfVxuICAgIHJldHVybiBbaGFzS2FuamkobGl0ZXJhbCkgPyB7cnVieTogbGl0ZXJhbCwgcnQ6IG1vcnBoZW1lVG9SZWFkaW5nKG0pfSA6IGxpdGVyYWxdO1xuICB9KSk7XG5cbiAgcmV0dXJuIGZ1cmlnYW5hO1xufVxuXG5mdW5jdGlvbiB0cml1PFQ+KGFycjogVFtdKTogVFtdW10ge1xuICBjb25zdCByZXQ6IFRbXVtdID0gW107XG4gIGZvciAobGV0IGkgPSBhcnIubGVuZ3RoOyBpID4gMDsgLS1pKSB7IHJldC5wdXNoKGFyci5zbGljZSgwLCBpKSk7IH1cbiAgcmV0dXJuIHJldDtcbn1cblxuY29uc3QgQ0hPVU9OUFVfUFJFRklYX01BUCA9IGNyZWF0ZUNob3VvbnB1UHJlZml4TWFwKCk7XG5jb25zdCBDSE9VT05QVSA9ICfjg7wnOyAvLyBodHRwczovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9DaCVDNSU4RG9ucHVcbmZ1bmN0aW9uIGNyZWF0ZUNob3VvbnB1UHJlZml4TWFwKCkge1xuICBjb25zdCBwcmVmaXhlcyA9ICfjgYLjgYTjgYbjgYTjgYYnO1xuICBjb25zdCBtYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG4gIGDjgYHjgYLjgYvjgYzjgZXjgZbjgZ/jgaDjgarjga/jgbDjgbHjgb7jgoPjgoTjgonjgo7jgo9cbuOBg+OBhOOBjeOBjuOBl+OBmOOBoeOBouOBq+OBsuOBs+OBtOOBv+OCilxu44GF44GG44GP44GQ44GZ44Ga44Gj44Gk44Gl44Gs44G144G244G344KA44KF44KG44KL44KUXG7jgYfjgYjjgZHjgZLjgZvjgZzjgabjgafjga3jgbjjgbnjgbrjgoHjgoxcbuOBieOBiuOBk+OBlOOBneOBnuOBqOOBqeOBruOBu+OBvOOBveOCguOCh+OCiOOCjeOCkmAuc3BsaXQoJ1xcbicpXG4gICAgICAuZm9yRWFjaCgobGluZSwgaSkgPT4gbGluZS5zcGxpdCgnJykuZm9yRWFjaChzID0+IG1hcC5zZXQocywgcyArIHByZWZpeGVzW2ldKSkpO1xuICByZXR1cm4gbWFwO1xufVxuXG5mdW5jdGlvbiBmaW5kQWx0ZXJuYXRpdmVDaG91b25wdShoaXJhZ2FuYTogc3RyaW5nKTogc3RyaW5nW10ge1xuICBjb25zdCBoaXRzID0gW2hpcmFnYW5hXTtcbiAgZm9yIChsZXQgaSA9IDE7IGkgPCBoaXJhZ2FuYS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChoaXJhZ2FuYVtpXSA9PT0gQ0hPVU9OUFUpIHtcbiAgICAgIGNvbnN0IHJlcGxhY2VtZW50ID0gQ0hPVU9OUFVfUFJFRklYX01BUC5nZXQoaGlyYWdhbmFbaSAtIDFdKTtcbiAgICAgIGlmIChyZXBsYWNlbWVudCkge1xuICAgICAgICBjb25zdCBwcmVmaXggPSBoaXJhZ2FuYS5zbGljZSgwLCBpIC0gMSk7XG4gICAgICAgIGNvbnN0IHBvc3RmaXggPSBoaXJhZ2FuYS5zbGljZShpICsgMSk7XG4gICAgICAgIGhpdHMucHVzaChwcmVmaXggKyByZXBsYWNlbWVudCArIHBvc3RmaXgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICByZXR1cm4gaGl0cztcbn1cbmZ1bmN0aW9uIHNlYXJjaChtYXA6IE1hcDxzdHJpbmcsIEVudHJ5W10+LCBmaXJzdDogc3RyaW5nLCBzdWI6ICdyZWFkaW5nJ3wndGV4dCcsIHNlY29uZDogc3RyaW5nKTogRW50cnl8dW5kZWZpbmVkIHtcbiAgY29uc3QgaGl0ID0gbWFwLmdldChmaXJzdCk7XG4gIGlmIChoaXQpIHtcbiAgICBpZiAoaGl0Lmxlbmd0aCA9PT0gMSkgeyByZXR1cm4gaGl0WzBdOyB9XG4gICAgY29uc3QgcG9zc2libGVTZWNvbmRzID0gZmluZEFsdGVybmF0aXZlQ2hvdW9ucHUoa2F0YTJoaXJhKHNlY29uZCkpO1xuICAgIGNvbnN0IHN1YmhpdCA9IGhpdC5maW5kKGUgPT4ge1xuICAgICAgY29uc3QgZGljdCA9IGthdGEyaGlyYShlW3N1Yl0pO1xuICAgICAgcmV0dXJuIHBvc3NpYmxlU2Vjb25kcy5zb21lKHNlY29uZCA9PiBzZWNvbmQgPT09IGRpY3QpO1xuICAgIH0pO1xuICAgIGlmIChzdWJoaXQpIHsgcmV0dXJuIHN1YmhpdDsgfVxuICAgIGNvbnNvbGUuZXJyb3IoYGZvdW5kIGhpdCBmb3IgJHtmaXJzdH0gYnV0IG5vdCAke3NlY29uZH1gLCB7aGl0LCBwb3NzaWJsZVNlY29uZHN9KTtcbiAgfVxufVxuXG4vKipcbiAqIEVuc3VyZSBuZWVkbGUgaXMgZm91bmQgaW4gaGF5c3RhY2sgb25seSBvbmNlXG4gKiBAcGFyYW0gaGF5c3RhY2sgYmlnIHN0cmluZ1xuICogQHBhcmFtIG5lZWRsZSBsaXR0bGUgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIGFwcGVhcnNFeGFjdGx5T25jZShoYXlzdGFjazogc3RyaW5nLCBuZWVkbGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBsZXQgaGl0OiBudW1iZXI7XG4gIHJldHVybiAoaGl0ID0gaGF5c3RhY2suaW5kZXhPZihuZWVkbGUpKSA+PSAwICYmIChoaXQgPSBoYXlzdGFjay5pbmRleE9mKG5lZWRsZSwgaGl0ICsgMSkpIDwgMDtcbn1cbi8qKlxuICogR2l2ZW4gdGhyZWUgY29uc2VjdXRpZXMgc3Vic3RyaW5ncyAodGhlIGFyZ3VtZW50cyksIHJldHVybiBlaXRoZXJcbiAqIC0gYCR7bGVmdDJ9WyR7Y2xvemV9XSR7cmlnaHQyfWAgd2hlcmUgYGxlZnQyYCBhbmQgYHJpZ2h0MmAgYXJlIGFzIHNob3J0IGFzIHBvc3NpYmxlIChhbmQgb2YgZXF1YWwgbGVuZ3RoLCBpZlxuICogICAgcG9zc2libGUpIHNvIHRoZSB0aGlzIHJldHVybiBzdHJpbmcgKG1pbnVzIHRoZSBicmFja2V0cykgaXMgdW5pcXVlIGluIHRoZSBmdWxsIHN0cmluZywgb3JcbiAqIC0gYCR7Y2xvemV9YCBpZiBgbGVmdDIgPT09IHJpZ2h0MiA9PT0gJydgIChpLmUuLCB0aGUgYWJvdmUgYnV0IHdpdGhvdXQgdGhlIGJyYWNrZXRzKS5cbiAqIEBwYXJhbSBsZWZ0IGxlZnQgc3RyaW5nLCBwb3NzaWJseSBlbXB0eVxuICogQHBhcmFtIGNsb3plIG1pZGRsZSBzdHJpbmdcbiAqIEBwYXJhbSByaWdodCByaWdodCBzdHJpbmcsIHBvc3NpYmxlIGVtcHR5XG4gKiBAdGhyb3dzIGluIHRoZSB1bmxpa2VseSBldmVudCB0aGF0IHN1Y2ggYSByZXR1cm4gc3RyaW5nIGNhbm5vdCBiZSBidWlsZCAoSSBjYW5ub3QgdGhpbmsgb2YgYW4gZXhhbXBsZSB0aG91Z2gpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlQ29udGV4dENsb3plZChsZWZ0OiBzdHJpbmcsIGNsb3plOiBzdHJpbmcsIHJpZ2h0OiBzdHJpbmcpOiBzdHJpbmcge1xuICBjb25zdCBzZW50ZW5jZSA9IGxlZnQgKyBjbG96ZSArIHJpZ2h0O1xuICBsZXQgbGVmdENvbnRleHQgPSAnJztcbiAgbGV0IHJpZ2h0Q29udGV4dCA9ICcnO1xuICBsZXQgY29udGV4dExlbmd0aCA9IDA7XG4gIHdoaWxlICghYXBwZWFyc0V4YWN0bHlPbmNlKHNlbnRlbmNlLCBsZWZ0Q29udGV4dCArIGNsb3plICsgcmlnaHRDb250ZXh0KSkge1xuICAgIGNvbnRleHRMZW5ndGgrKztcbiAgICBpZiAoY29udGV4dExlbmd0aCA+PSBsZWZ0Lmxlbmd0aCAmJiBjb250ZXh0TGVuZ3RoID49IHJpZ2h0Lmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdSYW4gb3V0IG9mIGNvbnRleHQgdG8gYnVpbGQgdW5pcXVlIGNsb3plJyk7XG4gICAgfVxuICAgIGxlZnRDb250ZXh0ID0gbGVmdC5zbGljZSgtY29udGV4dExlbmd0aCk7XG4gICAgcmlnaHRDb250ZXh0ID0gcmlnaHQuc2xpY2UoMCwgY29udGV4dExlbmd0aCk7XG4gIH1cbiAgaWYgKGxlZnRDb250ZXh0ID09PSAnJyAmJiByaWdodENvbnRleHQgPT09ICcnKSB7IHJldHVybiBjbG96ZTsgfVxuICByZXR1cm4gYCR7bGVmdENvbnRleHR9WyR7Y2xvemV9XSR7cmlnaHRDb250ZXh0fWA7XG59XG5cbmZ1bmN0aW9uIGlkZW50aWZ5RmlsbEluQmxhbmtzKGJ1bnNldHN1czogTW9ycGhlbWVbXVtdKSB7XG4gIC8vIEZpbmQgY2xvemVzOiBwYXJ0aWNsZXMgYW5kIGNvbmp1Z2F0ZWQgdmVyYi9hZGplY3RpdmUgcGhyYXNlc1xuICBsZXQgbGl0ZXJhbENsb3plczogTWFwPHN0cmluZywgTW9ycGhlbWVbXT4gPSBuZXcgTWFwKFtdKTtcbiAgZm9yIChsZXQgW2JpZHgsIGJ1bnNldHN1XSBvZiBlbnVtZXJhdGUoYnVuc2V0c3VzKSkge1xuICAgIGxldCBmaXJzdCA9IGJ1bnNldHN1WzBdO1xuICAgIGlmICghZmlyc3QpIHsgY29udGludWU7IH1cbiAgICBjb25zdCBwb3MwID0gZmlyc3QucGFydE9mU3BlZWNoWzBdO1xuICAgIGxldCBzZWFyY2hGb3JQYXJ0aWNsZXMgPSB0cnVlO1xuICAgIGlmIChidW5zZXRzdXMubGVuZ3RoID4gMSAmJiBidW5zZXRzdS5sZW5ndGggPiAxICYmXG4gICAgICAgIChwb3MwLnN0YXJ0c1dpdGgoJ3ZlcmInKSB8fCBwb3MwLmVuZHNXaXRoKCdfdmVyYicpIHx8IHBvczAuc3RhcnRzV2l0aCgnYWRqZWN0JykpKSB7XG4gICAgICBsZXQgaWdub3JlUmlnaHQgPSBmaWx0ZXJSaWdodChidW5zZXRzdSwgbSA9PiAhZ29vZE1vcnBoZW1lUHJlZGljYXRlKG0pKTtcbiAgICAgIGxldCBnb29kQnVuc2V0c3UgPSBpZ25vcmVSaWdodC5sZW5ndGggPT09IDAgPyBidW5zZXRzdSA6IGJ1bnNldHN1LnNsaWNlKDAsIC1pZ25vcmVSaWdodC5sZW5ndGgpO1xuICAgICAgaWYgKGdvb2RCdW5zZXRzdS5sZW5ndGggPiAxKSB7XG4gICAgICAgIHNlYXJjaEZvclBhcnRpY2xlcyA9IGZhbHNlO1xuICAgICAgICBsZXQgY2xvemUgPSBidW5zZXRzdVRvU3RyaW5nKGdvb2RCdW5zZXRzdSk7XG4gICAgICAgIGxldCBsZWZ0ID0gYnVuc2V0c3VzLnNsaWNlKDAsIGJpZHgpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGV0IHJpZ2h0ID0gYnVuc2V0c3VUb1N0cmluZyhpZ25vcmVSaWdodCkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgbGl0ZXJhbENsb3plcy5zZXQoZ2VuZXJhdGVDb250ZXh0Q2xvemVkKGxlZnQsIGNsb3plLCByaWdodCksIGdvb2RCdW5zZXRzdSk7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIG9ubHkgYWRkIHBhcnRpY2xlcyBpZiB0aGV5J3JlIE5PVCBpbnNpZGUgY29uanVnYXRlZCBwaHJhc2VzXG4gICAgY29uc3QgcGFydGljbGVQcmVkaWNhdGUgPSAocDogTW9ycGhlbWUpID0+IHAucGFydE9mU3BlZWNoWzBdLnN0YXJ0c1dpdGgoJ3BhcnRpY2xlJykgJiYgcC5wYXJ0T2ZTcGVlY2gubGVuZ3RoID4gMSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhcC5wYXJ0T2ZTcGVlY2hbMV0uc3RhcnRzV2l0aCgncGhyYXNlX2ZpbmFsJyk7XG4gICAgaWYgKHNlYXJjaEZvclBhcnRpY2xlcykge1xuICAgICAgZm9yIChsZXQgW3BpZHgsIHBhcnRpY2xlXSBvZiBlbnVtZXJhdGUoYnVuc2V0c3UpKSB7XG4gICAgICAgIGlmIChwYXJ0aWNsZVByZWRpY2F0ZShwYXJ0aWNsZSkpIHtcbiAgICAgICAgICBsZXQgbGVmdCA9XG4gICAgICAgICAgICAgIGJ1bnNldHN1cy5zbGljZSgwLCBiaWR4KS5tYXAoYnVuc2V0c3VUb1N0cmluZykuam9pbignJykgKyBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKDAsIHBpZHgpKTtcbiAgICAgICAgICBsZXQgcmlnaHQgPVxuICAgICAgICAgICAgICBidW5zZXRzdVRvU3RyaW5nKGJ1bnNldHN1LnNsaWNlKHBpZHggKyAxKSkgKyBidW5zZXRzdXMuc2xpY2UoYmlkeCArIDEpLm1hcChidW5zZXRzdVRvU3RyaW5nKS5qb2luKCcnKTtcbiAgICAgICAgICBsaXRlcmFsQ2xvemVzLnNldChnZW5lcmF0ZUNvbnRleHRDbG96ZWQobGVmdCwgcGFydGljbGUubGl0ZXJhbCwgcmlnaHQpLCBbcGFydGljbGVdKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuICBsZXQgZXhpc3RpbmdDbG96ZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldChbXSk7XG4gIGxldCBidWxsZXRzOiBzdHJpbmdbXSA9IFtdO1xuICBmb3IgKGxldCBbY2xvemUsIGJ1bnNldHN1XSBvZiBsaXRlcmFsQ2xvemVzKSB7XG4gICAgaWYgKCFleGlzdGluZ0Nsb3plcy5oYXMoY2xvemUpKSB7XG4gICAgICBsZXQgYWNjZXB0YWJsZSA9IFtjbG96ZV07XG4gICAgICBpZiAoaGFzS2FuamkoYnVuc2V0c3VUb1N0cmluZyhidW5zZXRzdSkpKSB7XG4gICAgICAgIGFjY2VwdGFibGUucHVzaChrYXRhMmhpcmEoYnVuc2V0c3UubWFwKG0gPT4gbS5wcm9udW5jaWF0aW9uKS5qb2luKCcnKSkpXG4gICAgICB9XG4gICAgICBidWxsZXRzLnB1c2goJy0gQGZpbGwgJyArIGFjY2VwdGFibGUuam9pbignIEAgJykgK1xuICAgICAgICAgICAgICAgICAgIGAgICAgQHBvcyAke2J1bnNldHN1Lm1hcChtID0+IG0ucGFydE9mU3BlZWNoLmpvaW4oJy0nKSkuam9pbignLycpfWApO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYnVsbGV0cztcbn1cblxuY29uc3QgVVNBR0UgPSBgVVNBR0UgMTpcbiQgbm9kZSBbdGhpcy1zY3JpcHQuanNdIFttYXJrZG93bi5tZF1cblxuVVNBR0UgMjpcbiQgY2F0IFttYXJrZG93bi5tZF0gfCBub2RlIFt0aGlzLXNjcmlwdC5qc11cblxuQm90aCB3aWxsIHByaW50IGEgcGFyc2VkIHZlcnNpb24gb2YgdGhlIGlucHV0LmA7XG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcHJvbWlzaWZ5ID0gcmVxdWlyZSgndXRpbCcpLnByb21pc2lmeTtcbiAgY29uc3QgcmVhZEZpbGUgPSBwcm9taXNpZnkocmVxdWlyZSgnZnMnKS5yZWFkRmlsZSk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBjb25zdCB0ZXh0ID0gcHJvY2Vzcy5hcmd2WzJdID8gYXdhaXQgcmVhZEZpbGUocHJvY2Vzcy5hcmd2WzJdLCAndXRmOCcpIDogKChhd2FpdCBnZXRTdGRpbigpKSB8fCBVU0FHRSk7XG4gICAgLy8gU3BsaXQgTWFya2Rvd24gYXQgaGVhZGVyIChgIyBibGFibGFgKVxuICAgIGxldCBibG9ja3MgPSBzcGxpdEF0SGVhZGVycyh0ZXh0KTtcbiAgICAvLyBQYXJzZSBoZWFkZXJzXG4gICAgbGV0IGNvbnRlbnQgPSBhd2FpdCBwYXJzZUFsbEhlYWRlckJsb2NrcyhibG9ja3MpO1xuICAgIC8vIFByaW50IHJlc3VsdFxuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKGNvbnRlbnQubWFwKHYgPT4gdi5qb2luKCdcXG4nKSkuam9pbignXFxuJykpO1xuICB9KSgpO1xufSJdfQ==