#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const spawn = require('child_process').spawn;
const curtiz_utils_1 = require("curtiz-utils");
const partOfSpeechKeys = [
    "代名詞",
    "pronoun",
    "副詞",
    "adverb",
    "助動詞",
    "auxiliary_verb",
    "助詞",
    "particle",
    "係助詞",
    "binding",
    "副助詞",
    "adverbial",
    "接続助詞",
    "conjunctive",
    "格助詞",
    "case",
    "準体助詞",
    "nominal",
    "終助詞",
    "phrase_final",
    "動詞",
    "verb",
    "一般",
    "general",
    "非自立可能",
    "bound",
    "名詞",
    "noun",
    "助動詞語幹",
    "auxiliary",
    "固有名詞",
    "proper",
    "人名",
    "name",
    "名",
    "firstname",
    "姓",
    "surname",
    "地名",
    "place",
    "国",
    "country",
    "数詞",
    "numeral",
    "普通名詞",
    "common",
    "サ変可能",
    "verbal_suru",
    "サ変形状詞可能",
    "verbal_adjectival",
    "副詞可能",
    "adverbial_suffix",
    "助数詞可能",
    "counter",
    "形状詞可能",
    "adjectival",
    "形容詞",
    "adjective_i",
    "形状詞",
    "adjectival_noun",
    "タリ",
    "tari",
    "感動詞",
    "interjection",
    "フィラー",
    "filler",
    "接尾辞",
    "suffix",
    "動詞的",
    "verbal",
    "名詞的",
    "nominal_suffix",
    "助数詞",
    "counter_suffix",
    "形容詞的",
    "adjective_i_suffix",
    "形状詞的",
    "adjectival_noun_suffix",
    "接続詞",
    "conjunction",
    "接頭辞",
    "prefix",
    "空白",
    "whitespace",
    "補助記号",
    "supplementary_symbol",
    "ＡＡ",
    "ascii_art",
    "顔文字",
    "emoticon",
    "句点",
    "period",
    "括弧閉",
    "bracket_open",
    "括弧開",
    "bracket_close",
    "読点",
    "comma",
    "記号",
    "symbol",
    "文字",
    "character",
    "連体詞",
    "adnominal",
    "未知語",
    "unknown_words",
    "カタカナ文",
    "katakana",
    "漢文",
    "chinese_writing",
    "言いよどみ",
    "hesitation",
    "web誤脱",
    "errors_omissions",
    "方言",
    "dialect",
    "ローマ字文",
    "latin_alphabet",
    "新規未知語",
    "new_unknown_words"
];
const inflectionKeys = [
    "ク語法", "ku_wording",
    "仮定形", "conditional",
    "一般", "general",
    "融合", "integrated",
    "命令形", "imperative",
    "已然形", "realis",
    "補助", "auxiliary_inflection",
    "意志推量形", "volitional_tentative",
    "未然形", "irrealis",
    "サ", "sa",
    "セ", "se",
    "撥音便", "euphonic_change_n",
    "終止形", "conclusive",
    "ウ音便", "euphonic_change_u",
    "促音便", "euphonic_change_t",
    "語幹", "word_stem",
    "連体形", "attributive",
    "イ音便", "euphonic_change_i",
    "省略", "abbreviation",
    "連用形", "continuative",
    "ト", "change_to",
    "ニ", "change_ni",
    "長音", "long_sound",
    "*", "uninflected"
];
const inflectionTypeKeys = [
    "ユク", "yuku",
    "ダ行", "da_column",
    "ザ行変格", "zahen_verb_irregular",
    "ダ", "da",
    "タイ", "tai",
    "文語ラ行変格", "classical_ra_column_change",
    "ワ行", "wa_column",
    "コス", "kosu",
    "キ", "ki",
    "文語下二段", "classical_shimonidan_verb_e_u_row",
    "ス", "su",
    "ハ行", "ha_column",
    "上一段", "kamiichidan_verb_i_row",
    "イク", "iku",
    "マ行", "ma_column",
    "助動詞", "auxiliary",
    "シク", "shiku",
    "ナ行", "na_column",
    "ガ行", "ga_column",
    "ム", "mu",
    "ア行", "a_column",
    "ザンス", "zansu",
    "文語形容詞", "classical_adjective",
    "タ", "ta",
    "伝聞", "reported_speech",
    "ナイ", "nai",
    "ヘン", "hen",
    "文語助動詞", "classical_auxiliary",
    "ジ", "ji",
    "ワア行", "wa_a_column",
    "文語ナ行変格", "classical_na_column_change",
    "カ行変格", "kahen_verb_irregular",
    "ラシ", "rashi",
    "マイ", "mai",
    "タリ", "tari",
    "呉レル", "kureru",
    "形容詞", "adjective",
    "ゲナ", "gena",
    "一般+う", "general_u",
    "ザマス", "zamasu",
    "ゴトシ", "gotoshi",
    "ヌ", "nu",
    "文語上二段", "classical_kaminidan_verb_u_i_row",
    "ク", "ku",
    "サ行変格", "sahen_verb_irregular",
    "ラ行", "ra_column",
    "下一段", "shimoichidan_verb_e_row",
    "完了", "final",
    "ラシイ", "rashii",
    "文語四段", "classical_yondan_verb",
    "ドス", "dosu",
    "ザ行", "za_column",
    "ツ", "shi",
    "ヤス", "yasu",
    "バ行", "ba_column",
    "断定", "assertive",
    "ナンダ", "nanda",
    "ケリ", "keri",
    "文語サ行変格", "classical_sa_column_change",
    "タ行", "ta_column",
    "ケム", "kemu",
    "カ行", "ka_column",
    "ゲス", "gesu",
    "ヤ行", "ya_column",
    "マス", "masu",
    "レル", "reru",
    "サ行", "sa_column",
    "文語下一段", "classical_shimoichidan_verb_e_row",
    "ベシ", "beshi",
    "アル", "aru",
    "ヤ", "ya",
    "五段", "godan_verb",
    "一般", "general",
    "デス", "desu",
    "リ", "ri",
    "ナリ", "nari",
    "文語上一段", "classical_kamiichidan_verb_i_row",
    "無変化型", "uninflected_form",
    "ズ", "zu",
    "ジャ", "ja",
    "文語カ行変格", "classical_ka_column_change",
    "イウ", "iu"
];
function keysToObj(keys) {
    if (keys.length % 2 !== 0) {
        throw new Error("Even number of keys required");
    }
    let ret = {};
    for (let i = 0; i < keys.length; i += 2) {
        ret[keys[i]] = keys[i + 1];
    }
    return ret;
}
const partOfSpeechObj = keysToObj(partOfSpeechKeys);
const inflectionObj = keysToObj(inflectionKeys);
const inflectionTypeObj = keysToObj(inflectionTypeKeys);
/**
 *
 * @param text raw text to parse
 * @param native use natively-compiled MeCab (C++ executable) or Node version
 */
function invokeMecab(text, native = true) {
    return new Promise((resolve, reject) => {
        let spawned = native ? spawn('mecab', ['-d', '/usr/local/lib/mecab/dic/unidic'])
            : spawn('npx', ['mecab-emscripten-node', '-d', '/usr/local/lib/mecab/dic/unidic']);
        spawned.stdin.write(text);
        spawned.stdin.write('\n'); // necessary, otherwise MeCab says `input-buffer overflow.`
        spawned.stdin.end();
        let arr = [];
        spawned.stdout.on('data', (data) => arr.push(data.toString('utf8')));
        spawned.stderr.on('data', (data) => {
            console.log('stderr', data.toString());
            reject(data);
        });
        spawned.on('close', (code) => {
            if (code !== 0) {
                reject(code);
            }
            resolve(arr.join(''));
        });
    });
}
exports.invokeMecab = invokeMecab;
function maybeMorphemesToMorphemes(v) { return v.filter(o => !!o); }
exports.maybeMorphemesToMorphemes = maybeMorphemesToMorphemes;
function maybeMorphemeToMorpheme(o) {
    if (o) {
        return o;
    }
    throw new Error('Invalid morpheme found');
}
exports.maybeMorphemeToMorpheme = maybeMorphemeToMorpheme;
function morphemesEq(x, y) {
    return !!x && !!y && ultraCompressMorpheme(x) === ultraCompressMorpheme(y);
}
exports.morphemesEq = morphemesEq;
function parseMorpheme(raw) {
    if (raw.length === 7) {
        const [literal, pronunciation, lemmaReading, lemma, partOfSpeechRaw, inflectionTypeRaw, inflectionRaw] = raw;
        const clean = (dashed, obj) => dashed === '' ? null : dashed.split('-').map(key => {
            const res = obj[key];
            if (!res) {
                console.error('Unknown MeCab Unidic key encountered, key', key, 'dashed', dashed, 'raw', raw);
                // throw new Error('Unknown MeCab Unidic key encountered');
                return '';
            }
            return res;
        });
        const partOfSpeech = clean(partOfSpeechRaw, partOfSpeechObj);
        if (!partOfSpeech) {
            // this will never happen, but `clean` does potentially return null so let's check it.
            throw new Error('Empty part of speech encountered');
        }
        // These two can potentially be null, for uninflected morphemes
        const inflectionType = clean(inflectionTypeRaw, inflectionTypeObj);
        const inflection = clean(inflectionRaw, inflectionObj);
        return { literal, pronunciation, lemmaReading, lemma, partOfSpeech, inflectionType, inflection };
    }
    else if (raw.length === 1) {
        return null;
    }
    console.error('Neither 1 nor 7', raw);
    return null;
    // throw new Error('Unexpected number of columns in MeCab Unidic output');
}
exports.parseMorpheme = parseMorpheme;
function parseMecab(original, result) {
    const pieces = result.trim().split('\n').map(line => parseMorpheme(line.split('\t')));
    // split after each newline (null), just like text
    const lines = curtiz_utils_1.partitionBy(pieces, (line, i, orig) => !!(i && orig && !orig[i - 1]));
    return lines;
}
exports.parseMecab = parseMecab;
const MORPHEMESEP = '\t';
const BUNSETSUSEP = '::';
const ELEMENTSEP = '-';
function ultraCompressMorpheme(m) {
    return m ? [m.literal, m.pronunciation, m.lemmaReading, m.lemma, m.partOfSpeech.join(ELEMENTSEP),
        (m.inflectionType || []).join(ELEMENTSEP), (m.inflection || []).join(ELEMENTSEP)].join(MORPHEMESEP) : '';
}
exports.ultraCompressMorpheme = ultraCompressMorpheme;
function ultraCompressMorphemes(ms) {
    return ms.map(ultraCompressMorpheme).join(BUNSETSUSEP);
}
exports.ultraCompressMorphemes = ultraCompressMorphemes;
function decompressMorpheme(s) {
    const split = (s) => s.split(ELEMENTSEP);
    const nullable = (v) => v.length ? v : null;
    if (s === '') {
        return null;
    }
    let [literal, pronunciation, lemmaReading, lemma, partOfSpeech, inflectionType, inflection] = s.split(MORPHEMESEP);
    return {
        literal,
        pronunciation,
        lemmaReading,
        lemma,
        partOfSpeech: split(partOfSpeech),
        inflectionType: nullable(split(inflectionType || '')),
        inflection: nullable(split(inflection || ''))
    };
}
exports.decompressMorpheme = decompressMorpheme;
function decompressMorphemes(s) { return s.split(BUNSETSUSEP).map(decompressMorpheme); }
exports.decompressMorphemes = decompressMorphemes;
function goodMorphemePredicate(m) {
    return !(m.partOfSpeech[0] === 'supplementary_symbol') &&
        !(m.partOfSpeech[0] === 'particle' && m.partOfSpeech[1] === 'phrase_final');
}
exports.goodMorphemePredicate = goodMorphemePredicate;
/**
 *
 * @param text raw text to parse
 * @param native use natively-compiled MeCab (C++ executable) or Node version
 */
function parse(text, native = true) {
    return __awaiter(this, void 0, void 0, function* () {
        const m = parseMecab(text, yield invokeMecab(text.trim(), native));
        return m.map(v => v.filter(x => x !== null));
    });
}
exports.parse = parse;
if (require.main === module) {
    const readFile = require('fs').readFile;
    const promisify = require('util').promisify;
    const getStdin = require('get-stdin');
    const eaw = require('eastasianwidth');
    function formatRow(row, width) {
        return `| ${width.map((n, i) => (row[i] || '') + ' '.repeat(n - eaw.length(row[i] || ''))).join(' | ')} |`;
    }
    function printMarkdownTable(table, header = []) {
        if (header.length && header.length !== table[0].length) {
            throw new Error('table and header have different lengths');
        }
        const cellLengths = table.concat([header]).filter(v => v.length).map(row => { return row.map(cell => eaw.length(cell)); });
        let widths = Array.from(table[0], () => 0);
        for (const l of cellLengths) {
            widths = widths.map((curr, i) => Math.max(curr, l[i]));
        }
        if (header.length) {
            console.log(formatRow(header, widths));
            console.log(formatRow(header.map((h, i) => '-'.repeat(widths[i])), widths));
        }
        for (const row of table) {
            console.log(formatRow(row, widths));
        }
    }
    (function () {
        return __awaiter(this, void 0, void 0, function* () {
            let text = '今日は　良い天気だ。\n\nたのしいですか。\n\n何できた？';
            if (process.argv.length <= 2) {
                // no arguments, read from stdin. If stdin is empty, use default.
                text = (yield getStdin()) || text;
            }
            else {
                text = (yield Promise.all(process.argv.slice(2).map(f => promisify(readFile)(f, 'utf8'))))
                    .join('\n')
                    .replace(/\r/g, '');
            }
            const parsed = parseMecab(text, yield invokeMecab(text.trim(), true));
            {
                const assert = require('assert');
                const parsedNode = parseMecab(text, yield invokeMecab(text.trim(), false));
                assert(parsedNode.map(ultraCompressMorphemes).join('\n') === parsed.map(ultraCompressMorphemes).join('\n'), 'Native MeCab and mecab-emscripten-node must produce same output');
            }
            // Output
            const table = curtiz_utils_1.flatten(parsed.map(s => s.map(m => {
                return m ? [m.literal, m.pronunciation, m.lemmaReading, m.lemma, m.partOfSpeech.join(ELEMENTSEP),
                    (m.inflectionType || []).join(ELEMENTSEP), (m.inflection || []).join(ELEMENTSEP)] : [];
            })));
            printMarkdownTable(table, 'Literal,Pron.,Lemma Read.,Lemma,PoS,Infl. Type,Infl.'.split(','));
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVjYWJVbmlkaWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtZWNhYlVuaWRpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFDQSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzdDLCtDQUFrRDtBQUVsRCxNQUFNLGdCQUFnQixHQUFHO0lBQ3ZCLEtBQUs7SUFDTCxTQUFTO0lBQ1QsSUFBSTtJQUNKLFFBQVE7SUFDUixLQUFLO0lBQ0wsZ0JBQWdCO0lBQ2hCLElBQUk7SUFDSixVQUFVO0lBQ1YsS0FBSztJQUNMLFNBQVM7SUFDVCxLQUFLO0lBQ0wsV0FBVztJQUNYLE1BQU07SUFDTixhQUFhO0lBQ2IsS0FBSztJQUNMLE1BQU07SUFDTixNQUFNO0lBQ04sU0FBUztJQUNULEtBQUs7SUFDTCxjQUFjO0lBQ2QsSUFBSTtJQUNKLE1BQU07SUFDTixJQUFJO0lBQ0osU0FBUztJQUNULE9BQU87SUFDUCxPQUFPO0lBQ1AsSUFBSTtJQUNKLE1BQU07SUFDTixPQUFPO0lBQ1AsV0FBVztJQUNYLE1BQU07SUFDTixRQUFRO0lBQ1IsSUFBSTtJQUNKLE1BQU07SUFDTixHQUFHO0lBQ0gsV0FBVztJQUNYLEdBQUc7SUFDSCxTQUFTO0lBQ1QsSUFBSTtJQUNKLE9BQU87SUFDUCxHQUFHO0lBQ0gsU0FBUztJQUNULElBQUk7SUFDSixTQUFTO0lBQ1QsTUFBTTtJQUNOLFFBQVE7SUFDUixNQUFNO0lBQ04sYUFBYTtJQUNiLFNBQVM7SUFDVCxtQkFBbUI7SUFDbkIsTUFBTTtJQUNOLGtCQUFrQjtJQUNsQixPQUFPO0lBQ1AsU0FBUztJQUNULE9BQU87SUFDUCxZQUFZO0lBQ1osS0FBSztJQUNMLGFBQWE7SUFDYixLQUFLO0lBQ0wsaUJBQWlCO0lBQ2pCLElBQUk7SUFDSixNQUFNO0lBQ04sS0FBSztJQUNMLGNBQWM7SUFDZCxNQUFNO0lBQ04sUUFBUTtJQUNSLEtBQUs7SUFDTCxRQUFR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O2FBQzNFO1lBQ0QsU0FBUztZQUNULE1BQU0sS0FBSyxHQUFHLHNCQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzlDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO29CQUN0RixDQUFDLENBQUMsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ25HLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLGtCQUFrQixDQUFDLEtBQUssRUFBRSxzREFBc0QsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRixDQUFDO0tBQUEsQ0FBQyxFQUFFLENBQUM7Q0FDTiIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmNvbnN0IHNwYXduID0gcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLnNwYXduO1xuaW1wb3J0IHtwYXJ0aXRpb25CeSwgZmxhdHRlbn0gZnJvbSAnY3VydGl6LXV0aWxzJztcblxuY29uc3QgcGFydE9mU3BlZWNoS2V5cyA9IFtcbiAgXCLku6PlkI3oqZ5cIixcbiAgXCJwcm9ub3VuXCIsXG4gIFwi5Ymv6KmeXCIsXG4gIFwiYWR2ZXJiXCIsXG4gIFwi5Yqp5YuV6KmeXCIsXG4gIFwiYXV4aWxpYXJ5X3ZlcmJcIixcbiAgXCLliqnoqZ5cIixcbiAgXCJwYXJ0aWNsZVwiLFxuICBcIuS/guWKqeipnlwiLFxuICBcImJpbmRpbmdcIixcbiAgXCLlia/liqnoqZ5cIixcbiAgXCJhZHZlcmJpYWxcIixcbiAgXCLmjqXntprliqnoqZ5cIixcbiAgXCJjb25qdW5jdGl2ZVwiLFxuICBcIuagvOWKqeipnlwiLFxuICBcImNhc2VcIixcbiAgXCLmupbkvZPliqnoqZ5cIixcbiAgXCJub21pbmFsXCIsXG4gIFwi57WC5Yqp6KmeXCIsXG4gIFwicGhyYXNlX2ZpbmFsXCIsXG4gIFwi5YuV6KmeXCIsXG4gIFwidmVyYlwiLFxuICBcIuS4gOiIrFwiLFxuICBcImdlbmVyYWxcIixcbiAgXCLpnZ7oh6rnq4vlj6/og71cIixcbiAgXCJib3VuZFwiLFxuICBcIuWQjeipnlwiLFxuICBcIm5vdW5cIixcbiAgXCLliqnli5XoqZ7oqp7lublcIixcbiAgXCJhdXhpbGlhcnlcIixcbiAgXCLlm7rmnInlkI3oqZ5cIixcbiAgXCJwcm9wZXJcIixcbiAgXCLkurrlkI1cIixcbiAgXCJuYW1lXCIsXG4gIFwi5ZCNXCIsXG4gIFwiZmlyc3RuYW1lXCIsXG4gIFwi5aeTXCIsXG4gIFwic3VybmFtZVwiLFxuICBcIuWcsOWQjVwiLFxuICBcInBsYWNlXCIsXG4gIFwi5Zu9XCIsXG4gIFwiY291bnRyeVwiLFxuICBcIuaVsOipnlwiLFxuICBcIm51bWVyYWxcIixcbiAgXCLmma7pgJrlkI3oqZ5cIixcbiAgXCJjb21tb25cIixcbiAgXCLjgrXlpInlj6/og71cIixcbiAgXCJ2ZXJiYWxfc3VydVwiLFxuICBcIuOCteWkieW9oueKtuipnuWPr+iDvVwiLFxuICBcInZlcmJhbF9hZGplY3RpdmFsXCIsXG4gIFwi5Ymv6Kme5Y+v6IO9XCIsXG4gIFwiYWR2ZXJiaWFsX3N1ZmZpeFwiLFxuICBcIuWKqeaVsOipnuWPr+iDvVwiLFxuICBcImNvdW50ZXJcIixcbiAgXCLlvaLnirboqZ7lj6/og71cIixcbiAgXCJhZGplY3RpdmFsXCIsXG4gIFwi5b2i5a656KmeXCIsXG4gIFwiYWRqZWN0aXZlX2lcIixcbiAgXCLlvaLnirboqZ5cIixcbiAgXCJhZGplY3RpdmFsX25vdW5cIixcbiAgXCLjgr/jg6pcIixcbiAgXCJ0YXJpXCIsXG4gIFwi5oSf5YuV6KmeXCIsXG4gIFwiaW50ZXJqZWN0aW9uXCIsXG4gIFwi44OV44Kj44Op44O8XCIsXG4gIFwiZmlsbGVyXCIsXG4gIFwi5o6l5bC+6L6eXCIsXG4gIFwic3VmZml4XCIsXG4gIFwi5YuV6Kme55qEXCIsXG4gIFwidmVyYmFsXCIsXG4gIFwi5ZCN6Kme55qEXCIsXG4gIFwibm9taW5hbF9zdWZmaXhcIixcbiAgXCLliqnmlbDoqZ5cIixcbiAgXCJjb3VudGVyX3N1ZmZpeFwiLFxuICBcIuW9ouWuueipnueahFwiLFxuICBcImFkamVjdGl2ZV9pX3N1ZmZpeFwiLFxuICBcIuW9oueKtuipnueahFwiLFxuICBcImFkamVjdGl2YWxfbm91bl9zdWZmaXhcIixcbiAgXCLmjqXntproqZ5cIixcbiAgXCJjb25qdW5jdGlvblwiLFxuICBcIuaOpemgrei+nlwiLFxuICBcInByZWZpeFwiLFxuICBcIuepuueZvVwiLFxuICBcIndoaXRlc3BhY2VcIixcbiAgXCLoo5zliqnoqJjlj7dcIixcbiAgXCJzdXBwbGVtZW50YXJ5X3N5bWJvbFwiLFxuICBcIu+8oe+8oVwiLFxuICBcImFzY2lpX2FydFwiLFxuICBcIumhlOaWh+Wtl1wiLFxuICBcImVtb3RpY29uXCIsXG4gIFwi5Y+l54K5XCIsXG4gIFwicGVyaW9kXCIsXG4gIFwi5ous5byn6ZaJXCIsXG4gIFwiYnJhY2tldF9vcGVuXCIsXG4gIFwi5ous5byn6ZaLXCIsXG4gIFwiYnJhY2tldF9jbG9zZVwiLFxuICBcIuiqreeCuVwiLFxuICBcImNvbW1hXCIsXG4gIFwi6KiY5Y+3XCIsXG4gIFwic3ltYm9sXCIsXG4gIFwi5paH5a2XXCIsXG4gIFwiY2hhcmFjdGVyXCIsXG4gIFwi6YCj5L2T6KmeXCIsXG4gIFwiYWRub21pbmFsXCIsXG4gIFwi5pyq55+l6KqeXCIsXG4gIFwidW5rbm93bl93b3Jkc1wiLFxuICBcIuOCq+OCv+OCq+ODiuaWh1wiLFxuICBcImthdGFrYW5hXCIsXG4gIFwi5ryi5paHXCIsXG4gIFwiY2hpbmVzZV93cml0aW5nXCIsXG4gIFwi6KiA44GE44KI44Gp44G/XCIsXG4gIFwiaGVzaXRhdGlvblwiLFxuICBcIndlYuiqpOiEsVwiLFxuICBcImVycm9yc19vbWlzc2lvbnNcIixcbiAgXCLmlrnoqIBcIixcbiAgXCJkaWFsZWN0XCIsXG4gIFwi44Ot44O844Oe5a2X5paHXCIsXG4gIFwibGF0aW5fYWxwaGFiZXRcIixcbiAgXCLmlrDopo/mnKrnn6Xoqp5cIixcbiAgXCJuZXdfdW5rbm93bl93b3Jkc1wiXG5dO1xuXG5jb25zdCBpbmZsZWN0aW9uS2V5cyA9IFtcbiAgXCLjgq/oqp7ms5VcIiwgICAgIFwia3Vfd29yZGluZ1wiLFxuICBcIuS7ruWumuW9olwiLCAgICAgXCJjb25kaXRpb25hbFwiLFxuICBcIuS4gOiIrFwiLCAgICAgICBcImdlbmVyYWxcIixcbiAgXCLono3lkIhcIiwgICAgICAgXCJpbnRlZ3JhdGVkXCIsXG4gIFwi5ZG95Luk5b2iXCIsICAgICBcImltcGVyYXRpdmVcIixcbiAgXCLlt7LnhLblvaJcIiwgICAgIFwicmVhbGlzXCIsXG4gIFwi6KOc5YqpXCIsICAgICAgIFwiYXV4aWxpYXJ5X2luZmxlY3Rpb25cIixcbiAgXCLmhI/lv5fmjqjph4/lvaJcIiwgXCJ2b2xpdGlvbmFsX3RlbnRhdGl2ZVwiLFxuICBcIuacqueEtuW9olwiLCAgICAgXCJpcnJlYWxpc1wiLFxuICBcIuOCtVwiLCAgICAgICAgIFwic2FcIixcbiAgXCLjgrtcIiwgICAgICAgICBcInNlXCIsXG4gIFwi5pKl6Z+z5L6/XCIsICAgICBcImV1cGhvbmljX2NoYW5nZV9uXCIsXG4gIFwi57WC5q2i5b2iXCIsICAgICBcImNvbmNsdXNpdmVcIixcbiAgXCLjgqbpn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX3VcIixcbiAgXCLkv4Ppn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX3RcIixcbiAgXCLoqp7lublcIiwgICAgICAgXCJ3b3JkX3N0ZW1cIixcbiAgXCLpgKPkvZPlvaJcIiwgICAgIFwiYXR0cmlidXRpdmVcIixcbiAgXCLjgqTpn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX2lcIixcbiAgXCLnnIHnlaVcIiwgICAgICAgXCJhYmJyZXZpYXRpb25cIixcbiAgXCLpgKPnlKjlvaJcIiwgICAgIFwiY29udGludWF0aXZlXCIsXG4gIFwi44OIXCIsICAgICAgICAgXCJjaGFuZ2VfdG9cIixcbiAgXCLjg4tcIiwgICAgICAgICBcImNoYW5nZV9uaVwiLFxuICBcIumVt+mfs1wiLCAgICAgICBcImxvbmdfc291bmRcIixcbiAgXCIqXCIsICAgICAgICAgIFwidW5pbmZsZWN0ZWRcIlxuXTtcblxuY29uc3QgaW5mbGVjdGlvblR5cGVLZXlzID0gW1xuICBcIuODpuOCr1wiLCAgICAgICAgIFwieXVrdVwiLFxuICBcIuODgOihjFwiLCAgICAgICAgIFwiZGFfY29sdW1uXCIsXG4gIFwi44K26KGM5aSJ5qC8XCIsICAgICBcInphaGVuX3ZlcmJfaXJyZWd1bGFyXCIsXG4gIFwi44OAXCIsICAgICAgICAgICBcImRhXCIsXG4gIFwi44K/44KkXCIsICAgICAgICAgXCJ0YWlcIixcbiAgXCLmlofoqp7jg6nooYzlpInmoLxcIiwgXCJjbGFzc2ljYWxfcmFfY29sdW1uX2NoYW5nZVwiLFxuICBcIuODr+ihjFwiLCAgICAgICAgIFwid2FfY29sdW1uXCIsXG4gIFwi44Kz44K5XCIsICAgICAgICAgXCJrb3N1XCIsXG4gIFwi44KtXCIsICAgICAgICAgICBcImtpXCIsXG4gIFwi5paH6Kqe5LiL5LqM5q61XCIsICAgXCJjbGFzc2ljYWxfc2hpbW9uaWRhbl92ZXJiX2VfdV9yb3dcIixcbiAgXCLjgrlcIiwgICAgICAgICAgIFwic3VcIixcbiAgXCLjg4/ooYxcIiwgICAgICAgICBcImhhX2NvbHVtblwiLFxuICBcIuS4iuS4gOautVwiLCAgICAgICBcImthbWlpY2hpZGFuX3ZlcmJfaV9yb3dcIixcbiAgXCLjgqTjgq9cIiwgICAgICAgICBcImlrdVwiLFxuICBcIuODnuihjFwiLCAgICAgICAgIFwibWFfY29sdW1uXCIsXG4gIFwi5Yqp5YuV6KmeXCIsICAgICAgIFwiYXV4aWxpYXJ5XCIsXG4gIFwi44K344KvXCIsICAgICAgICAgXCJzaGlrdVwiLFxuICBcIuODiuihjFwiLCAgICAgICAgIFwibmFfY29sdW1uXCIsXG4gIFwi44Ks6KGMXCIsICAgICAgICAgXCJnYV9jb2x1bW5cIixcbiAgXCLjg6BcIiwgICAgICAgICAgIFwibXVcIixcbiAgXCLjgqLooYxcIiwgICAgICAgICBcImFfY29sdW1uXCIsXG4gIFwi44K244Oz44K5XCIsICAgICAgIFwiemFuc3VcIixcbiAgXCLmlofoqp7lvaLlrrnoqZ5cIiwgICBcImNsYXNzaWNhbF9hZGplY3RpdmVcIixcbiAgXCLjgr9cIiwgICAgICAgICAgIFwidGFcIixcbiAgXCLkvJ3ogZ5cIiwgICAgICAgICBcInJlcG9ydGVkX3NwZWVjaFwiLFxuICBcIuODiuOCpFwiLCAgICAgICAgIFwibmFpXCIsXG4gIFwi44OY44OzXCIsICAgICAgICAgXCJoZW5cIixcbiAgXCLmlofoqp7liqnli5XoqZ5cIiwgICBcImNsYXNzaWNhbF9hdXhpbGlhcnlcIixcbiAgXCLjgrhcIiwgICAgICAgICAgIFwiamlcIixcbiAgXCLjg6/jgqLooYxcIiwgICAgICAgXCJ3YV9hX2NvbHVtblwiLFxuICBcIuaWh+iqnuODiuihjOWkieagvFwiLCBcImNsYXNzaWNhbF9uYV9jb2x1bW5fY2hhbmdlXCIsXG4gIFwi44Kr6KGM5aSJ5qC8XCIsICAgICBcImthaGVuX3ZlcmJfaXJyZWd1bGFyXCIsXG4gIFwi44Op44K3XCIsICAgICAgICAgXCJyYXNoaVwiLFxuICBcIuODnuOCpFwiLCAgICAgICAgIFwibWFpXCIsXG4gIFwi44K/44OqXCIsICAgICAgICAgXCJ0YXJpXCIsXG4gIFwi5ZGJ44Os44OrXCIsICAgICAgIFwia3VyZXJ1XCIsXG4gIFwi5b2i5a656KmeXCIsICAgICAgIFwiYWRqZWN0aXZlXCIsXG4gIFwi44Ky44OKXCIsICAgICAgICAgXCJnZW5hXCIsXG4gIFwi5LiA6IisK+OBhlwiLCAgICAgIFwiZ2VuZXJhbF91XCIsXG4gIFwi44K244Oe44K5XCIsICAgICAgIFwiemFtYXN1XCIsXG4gIFwi44K044OI44K3XCIsICAgICAgIFwiZ290b3NoaVwiLFxuICBcIuODjFwiLCAgICAgICAgICAgXCJudVwiLFxuICBcIuaWh+iqnuS4iuS6jOautVwiLCAgIFwiY2xhc3NpY2FsX2thbWluaWRhbl92ZXJiX3VfaV9yb3dcIixcbiAgXCLjgq9cIiwgICAgICAgICAgIFwia3VcIixcbiAgXCLjgrXooYzlpInmoLxcIiwgICAgIFwic2FoZW5fdmVyYl9pcnJlZ3VsYXJcIixcbiAgXCLjg6nooYxcIiwgICAgICAgICBcInJhX2NvbHVtblwiLFxuICBcIuS4i+S4gOautVwiLCAgICAgICBcInNoaW1vaWNoaWRhbl92ZXJiX2Vfcm93XCIsXG4gIFwi5a6M5LqGXCIsICAgICAgICAgXCJmaW5hbFwiLFxuICBcIuODqeOCt+OCpFwiLCAgICAgICBcInJhc2hpaVwiLFxuICBcIuaWh+iqnuWbm+autVwiLCAgICAgXCJjbGFzc2ljYWxfeW9uZGFuX3ZlcmJcIixcbiAgXCLjg4njgrlcIiwgICAgICAgICBcImRvc3VcIixcbiAgXCLjgrbooYxcIiwgICAgICAgICBcInphX2NvbHVtblwiLFxuICBcIuODhFwiLCAgICAgICAgICAgXCJzaGlcIixcbiAgXCLjg6TjgrlcIiwgICAgICAgICBcInlhc3VcIixcbiAgXCLjg5DooYxcIiwgICAgICAgICBcImJhX2NvbHVtblwiLFxuICBcIuaWreWumlwiLCAgICAgICAgIFwiYXNzZXJ0aXZlXCIsXG4gIFwi44OK44Oz44OAXCIsICAgICAgIFwibmFuZGFcIixcbiAgXCLjgrHjg6pcIiwgICAgICAgICBcImtlcmlcIixcbiAgXCLmlofoqp7jgrXooYzlpInmoLxcIiwgXCJjbGFzc2ljYWxfc2FfY29sdW1uX2NoYW5nZVwiLFxuICBcIuOCv+ihjFwiLCAgICAgICAgIFwidGFfY29sdW1uXCIsXG4gIFwi44Kx44OgXCIsICAgICAgICAgXCJrZW11XCIsXG4gIFwi44Kr6KGMXCIsICAgICAgICAgXCJrYV9jb2x1bW5cIixcbiAgXCLjgrLjgrlcIiwgICAgICAgICBcImdlc3VcIixcbiAgXCLjg6TooYxcIiwgICAgICAgICBcInlhX2NvbHVtblwiLFxuICBcIuODnuOCuVwiLCAgICAgICAgIFwibWFzdVwiLFxuICBcIuODrOODq1wiLCAgICAgICAgIFwicmVydVwiLFxuICBcIuOCteihjFwiLCAgICAgICAgIFwic2FfY29sdW1uXCIsXG4gIFwi5paH6Kqe5LiL5LiA5q61XCIsICAgXCJjbGFzc2ljYWxfc2hpbW9pY2hpZGFuX3ZlcmJfZV9yb3dcIixcbiAgXCLjg5njgrdcIiwgICAgICAgICBcImJlc2hpXCIsXG4gIFwi44Ki44OrXCIsICAgICAgICAgXCJhcnVcIixcbiAgXCLjg6RcIiwgICAgICAgICAgIFwieWFcIixcbiAgXCLkupTmrrVcIiwgICAgICAgICBcImdvZGFuX3ZlcmJcIixcbiAgXCLkuIDoiKxcIiwgICAgICAgICBcImdlbmVyYWxcIixcbiAgXCLjg4fjgrlcIiwgICAgICAgICBcImRlc3VcIixcbiAgXCLjg6pcIiwgICAgICAgICAgIFwicmlcIixcbiAgXCLjg4rjg6pcIiwgICAgICAgICBcIm5hcmlcIixcbiAgXCLmlofoqp7kuIrkuIDmrrVcIiwgICBcImNsYXNzaWNhbF9rYW1paWNoaWRhbl92ZXJiX2lfcm93XCIsXG4gIFwi54Sh5aSJ5YyW5Z6LXCIsICAgICBcInVuaW5mbGVjdGVkX2Zvcm1cIixcbiAgXCLjgrpcIiwgICAgICAgICAgIFwienVcIixcbiAgXCLjgrjjg6NcIiwgICAgICAgICBcImphXCIsXG4gIFwi5paH6Kqe44Kr6KGM5aSJ5qC8XCIsIFwiY2xhc3NpY2FsX2thX2NvbHVtbl9jaGFuZ2VcIixcbiAgXCLjgqTjgqZcIiwgICAgICAgICBcIml1XCJcbl07XG5mdW5jdGlvbiBrZXlzVG9PYmooa2V5czogc3RyaW5nW10pIHtcbiAgaWYgKGtleXMubGVuZ3RoICUgMiAhPT0gMCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJFdmVuIG51bWJlciBvZiBrZXlzIHJlcXVpcmVkXCIpOyB9XG4gIGxldCByZXQ6IGFueSA9IHt9O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpICs9IDIpIHsgcmV0W2tleXNbaV1dID0ga2V5c1tpICsgMV07IH1cbiAgcmV0dXJuIHJldDtcbn1cbmNvbnN0IHBhcnRPZlNwZWVjaE9iaiA9IGtleXNUb09iaihwYXJ0T2ZTcGVlY2hLZXlzKTtcbmNvbnN0IGluZmxlY3Rpb25PYmogPSBrZXlzVG9PYmooaW5mbGVjdGlvbktleXMpO1xuY29uc3QgaW5mbGVjdGlvblR5cGVPYmogPSBrZXlzVG9PYmooaW5mbGVjdGlvblR5cGVLZXlzKTtcblxuLyoqXG4gKlxuICogQHBhcmFtIHRleHQgcmF3IHRleHQgdG8gcGFyc2VcbiAqIEBwYXJhbSBuYXRpdmUgdXNlIG5hdGl2ZWx5LWNvbXBpbGVkIE1lQ2FiIChDKysgZXhlY3V0YWJsZSkgb3IgTm9kZSB2ZXJzaW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnZva2VNZWNhYih0ZXh0OiBzdHJpbmcsIG5hdGl2ZSA9IHRydWUpOiBQcm9taXNlPHN0cmluZz4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGxldCBzcGF3bmVkID0gbmF0aXZlID8gc3Bhd24oJ21lY2FiJywgWyctZCcsICcvdXNyL2xvY2FsL2xpYi9tZWNhYi9kaWMvdW5pZGljJ10pXG4gICAgICAgICAgICAgICAgICAgICAgICAgOiBzcGF3bignbnB4JywgWydtZWNhYi1lbXNjcmlwdGVuLW5vZGUnLCAnLWQnLCAnL3Vzci9sb2NhbC9saWIvbWVjYWIvZGljL3VuaWRpYyddKTtcbiAgICBzcGF3bmVkLnN0ZGluLndyaXRlKHRleHQpO1xuICAgIHNwYXduZWQuc3RkaW4ud3JpdGUoJ1xcbicpOyAvLyBuZWNlc3NhcnksIG90aGVyd2lzZSBNZUNhYiBzYXlzIGBpbnB1dC1idWZmZXIgb3ZlcmZsb3cuYFxuICAgIHNwYXduZWQuc3RkaW4uZW5kKCk7XG4gICAgbGV0IGFycjogc3RyaW5nW10gPSBbXTtcbiAgICBzcGF3bmVkLnN0ZG91dC5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IGFyci5wdXNoKGRhdGEudG9TdHJpbmcoJ3V0ZjgnKSkpO1xuICAgIHNwYXduZWQuc3RkZXJyLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuICAgICAgY29uc29sZS5sb2coJ3N0ZGVycicsIGRhdGEudG9TdHJpbmcoKSk7XG4gICAgICByZWplY3QoZGF0YSk7XG4gICAgfSk7XG4gICAgc3Bhd25lZC5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyKSA9PiB7XG4gICAgICBpZiAoY29kZSAhPT0gMCkgeyByZWplY3QoY29kZSk7IH1cbiAgICAgIHJlc29sdmUoYXJyLmpvaW4oJycpKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9ycGhlbWUge1xuICBsaXRlcmFsOiBzdHJpbmc7XG4gIHByb251bmNpYXRpb246IHN0cmluZztcbiAgbGVtbWFSZWFkaW5nOiBzdHJpbmc7XG4gIGxlbW1hOiBzdHJpbmc7XG4gIHBhcnRPZlNwZWVjaDogc3RyaW5nW107XG4gIGluZmxlY3Rpb25UeXBlOiBzdHJpbmdbXXxudWxsO1xuICBpbmZsZWN0aW9uOiBzdHJpbmdbXXxudWxsO1xufVxuZXhwb3J0IHR5cGUgTWF5YmVNb3JwaGVtZSA9IE1vcnBoZW1lfG51bGw7XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyh2OiBNYXliZU1vcnBoZW1lW10pOiBNb3JwaGVtZVtdIHsgcmV0dXJuIHYuZmlsdGVyKG8gPT4gISFvKSBhcyBNb3JwaGVtZVtdOyB9XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVNb3JwaGVtZVRvTW9ycGhlbWUobzogTWF5YmVNb3JwaGVtZSk6IE1vcnBoZW1lIHtcbiAgaWYgKG8pIHsgcmV0dXJuIG87IH1cbiAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG1vcnBoZW1lIGZvdW5kJyk7XG59XG5leHBvcnQgZnVuY3Rpb24gbW9ycGhlbWVzRXEoeDogTWF5YmVNb3JwaGVtZSwgeTogTWF5YmVNb3JwaGVtZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gISF4ICYmICEheSAmJiB1bHRyYUNvbXByZXNzTW9ycGhlbWUoeCkgPT09IHVsdHJhQ29tcHJlc3NNb3JwaGVtZSh5KTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1vcnBoZW1lKHJhdzogc3RyaW5nW10pOiBNYXliZU1vcnBoZW1lIHtcbiAgaWYgKHJhdy5sZW5ndGggPT09IDcpIHtcbiAgICBjb25zdCBbbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbiwgbGVtbWFSZWFkaW5nLCBsZW1tYSwgcGFydE9mU3BlZWNoUmF3LCBpbmZsZWN0aW9uVHlwZVJhdywgaW5mbGVjdGlvblJhd10gPSByYXc7XG4gICAgY29uc3QgY2xlYW4gPSAoZGFzaGVkOiBzdHJpbmcsIG9iajogYW55KSA9PiBkYXNoZWQgPT09ICcnID8gbnVsbCA6IGRhc2hlZC5zcGxpdCgnLScpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgcmVzOiBzdHJpbmcgPSBvYmpba2V5XTtcbiAgICAgIGlmICghcmVzKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gTWVDYWIgVW5pZGljIGtleSBlbmNvdW50ZXJlZCwga2V5Jywga2V5LCAnZGFzaGVkJywgZGFzaGVkLCAncmF3JywgcmF3KTtcbiAgICAgICAgLy8gdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIE1lQ2FiIFVuaWRpYyBrZXkgZW5jb3VudGVyZWQnKTtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcztcbiAgICB9KTtcbiAgICBjb25zdCBwYXJ0T2ZTcGVlY2ggPSBjbGVhbihwYXJ0T2ZTcGVlY2hSYXcsIHBhcnRPZlNwZWVjaE9iaik7XG4gICAgaWYgKCFwYXJ0T2ZTcGVlY2gpIHtcbiAgICAgIC8vIHRoaXMgd2lsbCBuZXZlciBoYXBwZW4sIGJ1dCBgY2xlYW5gIGRvZXMgcG90ZW50aWFsbHkgcmV0dXJuIG51bGwgc28gbGV0J3MgY2hlY2sgaXQuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VtcHR5IHBhcnQgb2Ygc3BlZWNoIGVuY291bnRlcmVkJyk7XG4gICAgfVxuICAgIC8vIFRoZXNlIHR3byBjYW4gcG90ZW50aWFsbHkgYmUgbnVsbCwgZm9yIHVuaW5mbGVjdGVkIG1vcnBoZW1lc1xuICAgIGNvbnN0IGluZmxlY3Rpb25UeXBlID0gY2xlYW4oaW5mbGVjdGlvblR5cGVSYXcsIGluZmxlY3Rpb25UeXBlT2JqKTtcbiAgICBjb25zdCBpbmZsZWN0aW9uID0gY2xlYW4oaW5mbGVjdGlvblJhdywgaW5mbGVjdGlvbk9iaik7XG4gICAgcmV0dXJuIHtsaXRlcmFsLCBwcm9udW5jaWF0aW9uLCBsZW1tYVJlYWRpbmcsIGxlbW1hLCBwYXJ0T2ZTcGVlY2gsIGluZmxlY3Rpb25UeXBlLCBpbmZsZWN0aW9ufTtcbiAgfSBlbHNlIGlmIChyYXcubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc29sZS5lcnJvcignTmVpdGhlciAxIG5vciA3JywgcmF3KTtcbiAgcmV0dXJuIG51bGw7XG4gIC8vIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBudW1iZXIgb2YgY29sdW1ucyBpbiBNZUNhYiBVbmlkaWMgb3V0cHV0Jyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1lY2FiKG9yaWdpbmFsOiBzdHJpbmcsIHJlc3VsdDogc3RyaW5nKSB7XG4gIGNvbnN0IHBpZWNlcyA9IHJlc3VsdC50cmltKCkuc3BsaXQoJ1xcbicpLm1hcChsaW5lID0+IHBhcnNlTW9ycGhlbWUobGluZS5zcGxpdCgnXFx0JykpKTtcbiAgLy8gc3BsaXQgYWZ0ZXIgZWFjaCBuZXdsaW5lIChudWxsKSwganVzdCBsaWtlIHRleHRcbiAgY29uc3QgbGluZXMgPSBwYXJ0aXRpb25CeShwaWVjZXMsIChsaW5lLCBpLCBvcmlnKSA9PiAhIShpICYmIG9yaWcgJiYgIW9yaWdbaSAtIDFdKSk7XG4gIHJldHVybiBsaW5lcztcbn1cblxuY29uc3QgTU9SUEhFTUVTRVAgPSAnXFx0JztcbmNvbnN0IEJVTlNFVFNVU0VQID0gJzo6JztcbmNvbnN0IEVMRU1FTlRTRVAgPSAnLSc7XG5cbmV4cG9ydCBmdW5jdGlvbiB1bHRyYUNvbXByZXNzTW9ycGhlbWUobTogTWF5YmVNb3JwaGVtZSk6IHN0cmluZyB7XG4gIHJldHVybiBtID8gW20ubGl0ZXJhbCwgbS5wcm9udW5jaWF0aW9uLCBtLmxlbW1hUmVhZGluZywgbS5sZW1tYSwgbS5wYXJ0T2ZTcGVlY2guam9pbihFTEVNRU5UU0VQKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAobS5pbmZsZWN0aW9uVHlwZSB8fCBbXSkuam9pbihFTEVNRU5UU0VQKSwgKG0uaW5mbGVjdGlvbiB8fCBbXSkuam9pbihFTEVNRU5UU0VQKV0uam9pbihNT1JQSEVNRVNFUCkgOiAnJztcbn1cbmV4cG9ydCBmdW5jdGlvbiB1bHRyYUNvbXByZXNzTW9ycGhlbWVzKG1zOiBNYXliZU1vcnBoZW1lW10pOiBzdHJpbmcge1xuICByZXR1cm4gbXMubWFwKHVsdHJhQ29tcHJlc3NNb3JwaGVtZSkuam9pbihCVU5TRVRTVVNFUCk7XG59XG5leHBvcnQgZnVuY3Rpb24gZGVjb21wcmVzc01vcnBoZW1lKHM6IHN0cmluZyk6IE1heWJlTW9ycGhlbWUge1xuICBjb25zdCBzcGxpdCA9IChzOiBzdHJpbmcpID0+IHMuc3BsaXQoRUxFTUVOVFNFUCk7XG4gIGNvbnN0IG51bGxhYmxlID0gKHY6IGFueVtdKSA9PiB2Lmxlbmd0aCA/IHYgOiBudWxsO1xuICBpZiAocyA9PT0gJycpIHsgcmV0dXJuIG51bGw7IH1cbiAgbGV0IFtsaXRlcmFsLCBwcm9udW5jaWF0aW9uLCBsZW1tYVJlYWRpbmcsIGxlbW1hLCBwYXJ0T2ZTcGVlY2gsIGluZmxlY3Rpb25UeXBlLCBpbmZsZWN0aW9uXSA9IHMuc3BsaXQoTU9SUEhFTUVTRVApO1xuICByZXR1cm4ge1xuICAgIGxpdGVyYWwsXG4gICAgcHJvbnVuY2lhdGlvbixcbiAgICBsZW1tYVJlYWRpbmcsXG4gICAgbGVtbWEsXG4gICAgcGFydE9mU3BlZWNoOiBzcGxpdChwYXJ0T2ZTcGVlY2gpLFxuICAgIGluZmxlY3Rpb25UeXBlOiBudWxsYWJsZShzcGxpdChpbmZsZWN0aW9uVHlwZSB8fCAnJykpLFxuICAgIGluZmxlY3Rpb246IG51bGxhYmxlKHNwbGl0KGluZmxlY3Rpb24gfHwgJycpKVxuICB9O1xufVxuZXhwb3J0IGZ1bmN0aW9uIGRlY29tcHJlc3NNb3JwaGVtZXMoczogc3RyaW5nKTogTWF5YmVNb3JwaGVtZVtdIHsgcmV0dXJuIHMuc3BsaXQoQlVOU0VUU1VTRVApLm1hcChkZWNvbXByZXNzTW9ycGhlbWUpOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBnb29kTW9ycGhlbWVQcmVkaWNhdGUobTogTW9ycGhlbWUpOiBib29sZWFuIHtcbiAgcmV0dXJuICEobS5wYXJ0T2ZTcGVlY2hbMF0gPT09ICdzdXBwbGVtZW50YXJ5X3N5bWJvbCcpICYmXG4gICAgICAgICAhKG0ucGFydE9mU3BlZWNoWzBdID09PSAncGFydGljbGUnICYmIG0ucGFydE9mU3BlZWNoWzFdID09PSAncGhyYXNlX2ZpbmFsJyk7XG59XG5cbi8qKlxuICpcbiAqIEBwYXJhbSB0ZXh0IHJhdyB0ZXh0IHRvIHBhcnNlXG4gKiBAcGFyYW0gbmF0aXZlIHVzZSBuYXRpdmVseS1jb21waWxlZCBNZUNhYiAoQysrIGV4ZWN1dGFibGUpIG9yIE5vZGUgdmVyc2lvblxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2UodGV4dDogc3RyaW5nLCBuYXRpdmUgPSB0cnVlKTogUHJvbWlzZTxNb3JwaGVtZVtdW10+IHtcbiAgY29uc3QgbSA9IHBhcnNlTWVjYWIodGV4dCwgYXdhaXQgaW52b2tlTWVjYWIodGV4dC50cmltKCksIG5hdGl2ZSkpO1xuICByZXR1cm4gbS5tYXAodiA9PiB2LmZpbHRlcih4ID0+IHggIT09IG51bGwpIGFzIE1vcnBoZW1lW10pXG59XG5cbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xuICBjb25zdCByZWFkRmlsZSA9IHJlcXVpcmUoJ2ZzJykucmVhZEZpbGU7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIGNvbnN0IGVhdzoge2xlbmd0aDogKHM6IHN0cmluZykgPT4gbnVtYmVyfSA9IHJlcXVpcmUoJ2Vhc3Rhc2lhbndpZHRoJyk7XG5cbiAgZnVuY3Rpb24gZm9ybWF0Um93KHJvdzogc3RyaW5nW10sIHdpZHRoOiBudW1iZXJbXSkge1xuICAgIHJldHVybiBgfCAke3dpZHRoLm1hcCgobiwgaSkgPT4gKHJvd1tpXSB8fCAnJykgKyAnICcucmVwZWF0KG4gLSBlYXcubGVuZ3RoKHJvd1tpXSB8fCAnJykpKS5qb2luKCcgfCAnKX0gfGA7XG4gIH1cbiAgZnVuY3Rpb24gcHJpbnRNYXJrZG93blRhYmxlKHRhYmxlOiBzdHJpbmdbXVtdLCBoZWFkZXI6IHN0cmluZ1tdID0gW10pIHtcbiAgICBpZiAoaGVhZGVyLmxlbmd0aCAmJiBoZWFkZXIubGVuZ3RoICE9PSB0YWJsZVswXS5sZW5ndGgpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndGFibGUgYW5kIGhlYWRlciBoYXZlIGRpZmZlcmVudCBsZW5ndGhzJyk7XG4gICAgfVxuICAgIGNvbnN0IGNlbGxMZW5ndGhzID1cbiAgICAgICAgdGFibGUuY29uY2F0KFtoZWFkZXJdKS5maWx0ZXIodiA9PiB2Lmxlbmd0aCkubWFwKHJvdyA9PiB7cmV0dXJuIHJvdy5tYXAoY2VsbCA9PiBlYXcubGVuZ3RoKGNlbGwpKX0pO1xuICAgIGxldCB3aWR0aHMgPSBBcnJheS5mcm9tKHRhYmxlWzBdLCAoKSA9PiAwKTtcbiAgICBmb3IgKGNvbnN0IGwgb2YgY2VsbExlbmd0aHMpIHsgd2lkdGhzID0gd2lkdGhzLm1hcCgoY3VyciwgaSkgPT4gTWF0aC5tYXgoY3VyciwgbFtpXSkpOyB9XG5cbiAgICBpZiAoaGVhZGVyLmxlbmd0aCkge1xuICAgICAgY29uc29sZS5sb2coZm9ybWF0Um93KGhlYWRlciwgd2lkdGhzKSk7XG4gICAgICBjb25zb2xlLmxvZyhmb3JtYXRSb3coaGVhZGVyLm1hcCgoaCwgaSkgPT4gJy0nLnJlcGVhdCh3aWR0aHNbaV0pKSwgd2lkdGhzKSlcbiAgICB9XG4gICAgZm9yIChjb25zdCByb3cgb2YgdGFibGUpIHsgY29uc29sZS5sb2coZm9ybWF0Um93KHJvdywgd2lkdGhzKSk7IH1cbiAgfVxuXG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBsZXQgdGV4dCA9ICfku4rml6Xjga/jgIDoia/jgYTlpKnmsJfjgaDjgIJcXG5cXG7jgZ/jga7jgZfjgYTjgafjgZnjgYvjgIJcXG5cXG7kvZXjgafjgY3jgZ/vvJ8nO1xuICAgIGlmIChwcm9jZXNzLmFyZ3YubGVuZ3RoIDw9IDIpIHtcbiAgICAgIC8vIG5vIGFyZ3VtZW50cywgcmVhZCBmcm9tIHN0ZGluLiBJZiBzdGRpbiBpcyBlbXB0eSwgdXNlIGRlZmF1bHQuXG4gICAgICB0ZXh0ID0gKGF3YWl0IGdldFN0ZGluKCkpIHx8IHRleHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRleHQgPSAoYXdhaXQgUHJvbWlzZS5hbGwocHJvY2Vzcy5hcmd2LnNsaWNlKDIpLm1hcChmID0+IHByb21pc2lmeShyZWFkRmlsZSkoZiwgJ3V0ZjgnKSkpKVxuICAgICAgICAgICAgICAgICAuam9pbignXFxuJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnJyk7XG4gICAgfVxuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlTWVjYWIodGV4dCwgYXdhaXQgaW52b2tlTWVjYWIodGV4dC50cmltKCksIHRydWUpKTtcbiAgICB7XG4gICAgICBjb25zdCBhc3NlcnQgPSByZXF1aXJlKCdhc3NlcnQnKTtcbiAgICAgIGNvbnN0IHBhcnNlZE5vZGUgPSBwYXJzZU1lY2FiKHRleHQsIGF3YWl0IGludm9rZU1lY2FiKHRleHQudHJpbSgpLCBmYWxzZSkpO1xuICAgICAgYXNzZXJ0KHBhcnNlZE5vZGUubWFwKHVsdHJhQ29tcHJlc3NNb3JwaGVtZXMpLmpvaW4oJ1xcbicpID09PSBwYXJzZWQubWFwKHVsdHJhQ29tcHJlc3NNb3JwaGVtZXMpLmpvaW4oJ1xcbicpLFxuICAgICAgICAgICAgICdOYXRpdmUgTWVDYWIgYW5kIG1lY2FiLWVtc2NyaXB0ZW4tbm9kZSBtdXN0IHByb2R1Y2Ugc2FtZSBvdXRwdXQnKTtcbiAgICB9XG4gICAgLy8gT3V0cHV0XG4gICAgY29uc3QgdGFibGUgPSBmbGF0dGVuKHBhcnNlZC5tYXAocyA9PiBzLm1hcChtID0+IHtcbiAgICAgIHJldHVybiBtID8gW20ubGl0ZXJhbCwgbS5wcm9udW5jaWF0aW9uLCBtLmxlbW1hUmVhZGluZywgbS5sZW1tYSwgbS5wYXJ0T2ZTcGVlY2guam9pbihFTEVNRU5UU0VQKSxcbiAgICAgICAgICAgICAgICAobS5pbmZsZWN0aW9uVHlwZSB8fCBbXSkuam9pbihFTEVNRU5UU0VQKSwgKG0uaW5mbGVjdGlvbiB8fCBbXSkuam9pbihFTEVNRU5UU0VQKV0gOiBbXTtcbiAgICB9KSkpO1xuICAgIHByaW50TWFya2Rvd25UYWJsZSh0YWJsZSwgJ0xpdGVyYWwsUHJvbi4sTGVtbWEgUmVhZC4sTGVtbWEsUG9TLEluZmwuIFR5cGUsSW5mbC4nLnNwbGl0KCcsJykpO1xuICB9KSgpO1xufVxuIl19