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
function invokeMecab(text) {
    const native = !(process.env["NODE_MECAB"]);
    return new Promise((resolve, reject) => {
        let spawned = native ? spawn('mecab', ['-d', '/usr/local/lib/mecab/dic/unidic']) : spawn('npx', [
            'mecab-emscripten-node', '-d', process.env["UNIDIC"] || '/usr/local/lib/mecab/dic/unidic'
        ].concat(process.env["MECABRC"] ? ['-r', process.env["MECABRC"] || '/usr/local/etc/mecabrc'] : []));
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
function parse(text) {
    return __awaiter(this, void 0, void 0, function* () {
        const m = parseMecab(text, yield invokeMecab(text.trim()));
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
            delete process.env["NODE_MECAB"];
            const parsed = parseMecab(text, yield invokeMecab(text.trim()));
            // Output
            const table = curtiz_utils_1.flatten(parsed.map(s => s.map(m => {
                return m ? [m.literal, m.pronunciation, m.lemmaReading, m.lemma, m.partOfSpeech.join(ELEMENTSEP),
                    (m.inflectionType || []).join(ELEMENTSEP), (m.inflection || []).join(ELEMENTSEP)] : [];
            })));
            printMarkdownTable(table, 'Literal,Pron.,Lemma Read.,Lemma,PoS,Infl. Type,Infl.'.split(','));
            {
                const assert = require('assert');
                process.env["NODE_MECAB"] = '1';
                const parsedNode = parseMecab(text, yield invokeMecab(text.trim()));
                assert(parsedNode.map(ultraCompressMorphemes).join('\n') === parsed.map(ultraCompressMorphemes).join('\n'), 'Native MeCab and mecab-emscripten-node must produce same output');
            }
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVjYWJVbmlkaWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtZWNhYlVuaWRpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7QUFDQSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzdDLCtDQUFrRDtBQUVsRCxNQUFNLGdCQUFnQixHQUFHO0lBQ3ZCLEtBQUs7SUFDTCxTQUFTO0lBQ1QsSUFBSTtJQUNKLFFBQVE7SUFDUixLQUFLO0lBQ0wsZ0JBQWdCO0lBQ2hCLElBQUk7SUFDSixVQUFVO0lBQ1YsS0FBSztJQUNMLFNBQVM7SUFDVCxLQUFLO0lBQ0wsV0FBVztJQUNYLE1BQU07SUFDTixhQUFhO0lBQ2IsS0FBSztJQUNMLE1BQU07SUFDTixNQUFNO0lBQ04sU0FBUztJQUNULEtBQUs7SUFDTCxjQUFjO0lBQ2QsSUFBSTtJQUNKLE1BQU07SUFDTixJQUFJO0lBQ0osU0FBUztJQUNULE9BQU87SUFDUCxPQUFPO0lBQ1AsSUFBSTtJQUNKLE1BQU07SUFDTixPQUFPO0lBQ1AsV0FBVztJQUNYLE1BQU07SUFDTixRQUFRO0lBQ1IsSUFBSTtJQUNKLE1BQU07SUFDTixHQUFHO0lBQ0gsV0FBVztJQUNYLEdBQUc7SUFDSCxTQUFTO0lBQ1QsSUFBSTtJQUNKLE9BQU87SUFDUCxHQUFHO0lBQ0gsU0FBUztJQUNULElBQUk7SUFDSixTQUFTO0lBQ1QsTUFBTTtJQUNOLFFBQVE7SUFDUixNQUFNO0lBQ04sYUFBYTtJQUNiLFNBQVM7SUFDVCxtQkFBbUI7SUFDbkIsTUFBTTtJQUNOLGtCQUFrQjtJQUNsQixPQUFPO0lBQ1AsU0FBUztJQUNULE9BQU87SUFDUCxZQUFZO0lBQ1osS0FBSztJQUNMLGFBQWE7SUFDYixLQUFLO0lBQ0wsaUJBQWlCO0lBQ2pCLElBQUk7SUFDSixNQUFNO0lBQ04sS0FBSztJQUNMLGNBQWM7SUFDZCxNQUFNO0lBQ04sUUFBUTtJQUNSLEtBQUs7SUFDTCxRQUFR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aWxkX3Byb2Nlc3MnKS5zcGF3bjtcbmltcG9ydCB7cGFydGl0aW9uQnksIGZsYXR0ZW59IGZyb20gJ2N1cnRpei11dGlscyc7XG5cbmNvbnN0IHBhcnRPZlNwZWVjaEtleXMgPSBbXG4gIFwi5Luj5ZCN6KmeXCIsXG4gIFwicHJvbm91blwiLFxuICBcIuWJr+ipnlwiLFxuICBcImFkdmVyYlwiLFxuICBcIuWKqeWLleipnlwiLFxuICBcImF1eGlsaWFyeV92ZXJiXCIsXG4gIFwi5Yqp6KmeXCIsXG4gIFwicGFydGljbGVcIixcbiAgXCLkv4LliqnoqZ5cIixcbiAgXCJiaW5kaW5nXCIsXG4gIFwi5Ymv5Yqp6KmeXCIsXG4gIFwiYWR2ZXJiaWFsXCIsXG4gIFwi5o6l57aa5Yqp6KmeXCIsXG4gIFwiY29uanVuY3RpdmVcIixcbiAgXCLmoLzliqnoqZ5cIixcbiAgXCJjYXNlXCIsXG4gIFwi5rqW5L2T5Yqp6KmeXCIsXG4gIFwibm9taW5hbFwiLFxuICBcIue1guWKqeipnlwiLFxuICBcInBocmFzZV9maW5hbFwiLFxuICBcIuWLleipnlwiLFxuICBcInZlcmJcIixcbiAgXCLkuIDoiKxcIixcbiAgXCJnZW5lcmFsXCIsXG4gIFwi6Z2e6Ieq56uL5Y+v6IO9XCIsXG4gIFwiYm91bmRcIixcbiAgXCLlkI3oqZ5cIixcbiAgXCJub3VuXCIsXG4gIFwi5Yqp5YuV6Kme6Kqe5bm5XCIsXG4gIFwiYXV4aWxpYXJ5XCIsXG4gIFwi5Zu65pyJ5ZCN6KmeXCIsXG4gIFwicHJvcGVyXCIsXG4gIFwi5Lq65ZCNXCIsXG4gIFwibmFtZVwiLFxuICBcIuWQjVwiLFxuICBcImZpcnN0bmFtZVwiLFxuICBcIuWnk1wiLFxuICBcInN1cm5hbWVcIixcbiAgXCLlnLDlkI1cIixcbiAgXCJwbGFjZVwiLFxuICBcIuWbvVwiLFxuICBcImNvdW50cnlcIixcbiAgXCLmlbDoqZ5cIixcbiAgXCJudW1lcmFsXCIsXG4gIFwi5pmu6YCa5ZCN6KmeXCIsXG4gIFwiY29tbW9uXCIsXG4gIFwi44K15aSJ5Y+v6IO9XCIsXG4gIFwidmVyYmFsX3N1cnVcIixcbiAgXCLjgrXlpInlvaLnirboqZ7lj6/og71cIixcbiAgXCJ2ZXJiYWxfYWRqZWN0aXZhbFwiLFxuICBcIuWJr+ipnuWPr+iDvVwiLFxuICBcImFkdmVyYmlhbF9zdWZmaXhcIixcbiAgXCLliqnmlbDoqZ7lj6/og71cIixcbiAgXCJjb3VudGVyXCIsXG4gIFwi5b2i54q26Kme5Y+v6IO9XCIsXG4gIFwiYWRqZWN0aXZhbFwiLFxuICBcIuW9ouWuueipnlwiLFxuICBcImFkamVjdGl2ZV9pXCIsXG4gIFwi5b2i54q26KmeXCIsXG4gIFwiYWRqZWN0aXZhbF9ub3VuXCIsXG4gIFwi44K/44OqXCIsXG4gIFwidGFyaVwiLFxuICBcIuaEn+WLleipnlwiLFxuICBcImludGVyamVjdGlvblwiLFxuICBcIuODleOCo+ODqeODvFwiLFxuICBcImZpbGxlclwiLFxuICBcIuaOpeWwvui+nlwiLFxuICBcInN1ZmZpeFwiLFxuICBcIuWLleipnueahFwiLFxuICBcInZlcmJhbFwiLFxuICBcIuWQjeipnueahFwiLFxuICBcIm5vbWluYWxfc3VmZml4XCIsXG4gIFwi5Yqp5pWw6KmeXCIsXG4gIFwiY291bnRlcl9zdWZmaXhcIixcbiAgXCLlvaLlrrnoqZ7nmoRcIixcbiAgXCJhZGplY3RpdmVfaV9zdWZmaXhcIixcbiAgXCLlvaLnirboqZ7nmoRcIixcbiAgXCJhZGplY3RpdmFsX25vdW5fc3VmZml4XCIsXG4gIFwi5o6l57aa6KmeXCIsXG4gIFwiY29uanVuY3Rpb25cIixcbiAgXCLmjqXpoK3ovp5cIixcbiAgXCJwcmVmaXhcIixcbiAgXCLnqbrnmb1cIixcbiAgXCJ3aGl0ZXNwYWNlXCIsXG4gIFwi6KOc5Yqp6KiY5Y+3XCIsXG4gIFwic3VwcGxlbWVudGFyeV9zeW1ib2xcIixcbiAgXCLvvKHvvKFcIixcbiAgXCJhc2NpaV9hcnRcIixcbiAgXCLpoZTmloflrZdcIixcbiAgXCJlbW90aWNvblwiLFxuICBcIuWPpeeCuVwiLFxuICBcInBlcmlvZFwiLFxuICBcIuaLrOW8p+mWiVwiLFxuICBcImJyYWNrZXRfb3BlblwiLFxuICBcIuaLrOW8p+mWi1wiLFxuICBcImJyYWNrZXRfY2xvc2VcIixcbiAgXCLoqq3ngrlcIixcbiAgXCJjb21tYVwiLFxuICBcIuiomOWPt1wiLFxuICBcInN5bWJvbFwiLFxuICBcIuaWh+Wtl1wiLFxuICBcImNoYXJhY3RlclwiLFxuICBcIumAo+S9k+ipnlwiLFxuICBcImFkbm9taW5hbFwiLFxuICBcIuacquefpeiqnlwiLFxuICBcInVua25vd25fd29yZHNcIixcbiAgXCLjgqvjgr/jgqvjg4rmlodcIixcbiAgXCJrYXRha2FuYVwiLFxuICBcIua8ouaWh1wiLFxuICBcImNoaW5lc2Vfd3JpdGluZ1wiLFxuICBcIuiogOOBhOOCiOOBqeOBv1wiLFxuICBcImhlc2l0YXRpb25cIixcbiAgXCJ3ZWLoqqTohLFcIixcbiAgXCJlcnJvcnNfb21pc3Npb25zXCIsXG4gIFwi5pa56KiAXCIsXG4gIFwiZGlhbGVjdFwiLFxuICBcIuODreODvOODnuWtl+aWh1wiLFxuICBcImxhdGluX2FscGhhYmV0XCIsXG4gIFwi5paw6KaP5pyq55+l6KqeXCIsXG4gIFwibmV3X3Vua25vd25fd29yZHNcIlxuXTtcblxuY29uc3QgaW5mbGVjdGlvbktleXMgPSBbXG4gIFwi44Kv6Kqe5rOVXCIsICAgICBcImt1X3dvcmRpbmdcIixcbiAgXCLku67lrprlvaJcIiwgICAgIFwiY29uZGl0aW9uYWxcIixcbiAgXCLkuIDoiKxcIiwgICAgICAgXCJnZW5lcmFsXCIsXG4gIFwi6J6N5ZCIXCIsICAgICAgIFwiaW50ZWdyYXRlZFwiLFxuICBcIuWRveS7pOW9olwiLCAgICAgXCJpbXBlcmF0aXZlXCIsXG4gIFwi5bey54S25b2iXCIsICAgICBcInJlYWxpc1wiLFxuICBcIuijnOWKqVwiLCAgICAgICBcImF1eGlsaWFyeV9pbmZsZWN0aW9uXCIsXG4gIFwi5oSP5b+X5o6o6YeP5b2iXCIsIFwidm9saXRpb25hbF90ZW50YXRpdmVcIixcbiAgXCLmnKrnhLblvaJcIiwgICAgIFwiaXJyZWFsaXNcIixcbiAgXCLjgrVcIiwgICAgICAgICBcInNhXCIsXG4gIFwi44K7XCIsICAgICAgICAgXCJzZVwiLFxuICBcIuaSpemfs+S+v1wiLCAgICAgXCJldXBob25pY19jaGFuZ2VfblwiLFxuICBcIue1guatouW9olwiLCAgICAgXCJjb25jbHVzaXZlXCIsXG4gIFwi44Km6Z+z5L6/XCIsICAgICBcImV1cGhvbmljX2NoYW5nZV91XCIsXG4gIFwi5L+D6Z+z5L6/XCIsICAgICBcImV1cGhvbmljX2NoYW5nZV90XCIsXG4gIFwi6Kqe5bm5XCIsICAgICAgIFwid29yZF9zdGVtXCIsXG4gIFwi6YCj5L2T5b2iXCIsICAgICBcImF0dHJpYnV0aXZlXCIsXG4gIFwi44Kk6Z+z5L6/XCIsICAgICBcImV1cGhvbmljX2NoYW5nZV9pXCIsXG4gIFwi55yB55WlXCIsICAgICAgIFwiYWJicmV2aWF0aW9uXCIsXG4gIFwi6YCj55So5b2iXCIsICAgICBcImNvbnRpbnVhdGl2ZVwiLFxuICBcIuODiFwiLCAgICAgICAgIFwiY2hhbmdlX3RvXCIsXG4gIFwi44OLXCIsICAgICAgICAgXCJjaGFuZ2VfbmlcIixcbiAgXCLplbfpn7NcIiwgICAgICAgXCJsb25nX3NvdW5kXCIsXG4gIFwiKlwiLCAgICAgICAgICBcInVuaW5mbGVjdGVkXCJcbl07XG5cbmNvbnN0IGluZmxlY3Rpb25UeXBlS2V5cyA9IFtcbiAgXCLjg6bjgq9cIiwgICAgICAgICBcInl1a3VcIixcbiAgXCLjg4DooYxcIiwgICAgICAgICBcImRhX2NvbHVtblwiLFxuICBcIuOCtuihjOWkieagvFwiLCAgICAgXCJ6YWhlbl92ZXJiX2lycmVndWxhclwiLFxuICBcIuODgFwiLCAgICAgICAgICAgXCJkYVwiLFxuICBcIuOCv+OCpFwiLCAgICAgICAgIFwidGFpXCIsXG4gIFwi5paH6Kqe44Op6KGM5aSJ5qC8XCIsIFwiY2xhc3NpY2FsX3JhX2NvbHVtbl9jaGFuZ2VcIixcbiAgXCLjg6/ooYxcIiwgICAgICAgICBcIndhX2NvbHVtblwiLFxuICBcIuOCs+OCuVwiLCAgICAgICAgIFwia29zdVwiLFxuICBcIuOCrVwiLCAgICAgICAgICAgXCJraVwiLFxuICBcIuaWh+iqnuS4i+S6jOautVwiLCAgIFwiY2xhc3NpY2FsX3NoaW1vbmlkYW5fdmVyYl9lX3Vfcm93XCIsXG4gIFwi44K5XCIsICAgICAgICAgICBcInN1XCIsXG4gIFwi44OP6KGMXCIsICAgICAgICAgXCJoYV9jb2x1bW5cIixcbiAgXCLkuIrkuIDmrrVcIiwgICAgICAgXCJrYW1paWNoaWRhbl92ZXJiX2lfcm93XCIsXG4gIFwi44Kk44KvXCIsICAgICAgICAgXCJpa3VcIixcbiAgXCLjg57ooYxcIiwgICAgICAgICBcIm1hX2NvbHVtblwiLFxuICBcIuWKqeWLleipnlwiLCAgICAgICBcImF1eGlsaWFyeVwiLFxuICBcIuOCt+OCr1wiLCAgICAgICAgIFwic2hpa3VcIixcbiAgXCLjg4rooYxcIiwgICAgICAgICBcIm5hX2NvbHVtblwiLFxuICBcIuOCrOihjFwiLCAgICAgICAgIFwiZ2FfY29sdW1uXCIsXG4gIFwi44OgXCIsICAgICAgICAgICBcIm11XCIsXG4gIFwi44Ki6KGMXCIsICAgICAgICAgXCJhX2NvbHVtblwiLFxuICBcIuOCtuODs+OCuVwiLCAgICAgICBcInphbnN1XCIsXG4gIFwi5paH6Kqe5b2i5a656KmeXCIsICAgXCJjbGFzc2ljYWxfYWRqZWN0aXZlXCIsXG4gIFwi44K/XCIsICAgICAgICAgICBcInRhXCIsXG4gIFwi5Lyd6IGeXCIsICAgICAgICAgXCJyZXBvcnRlZF9zcGVlY2hcIixcbiAgXCLjg4rjgqRcIiwgICAgICAgICBcIm5haVwiLFxuICBcIuODmOODs1wiLCAgICAgICAgIFwiaGVuXCIsXG4gIFwi5paH6Kqe5Yqp5YuV6KmeXCIsICAgXCJjbGFzc2ljYWxfYXV4aWxpYXJ5XCIsXG4gIFwi44K4XCIsICAgICAgICAgICBcImppXCIsXG4gIFwi44Ov44Ki6KGMXCIsICAgICAgIFwid2FfYV9jb2x1bW5cIixcbiAgXCLmlofoqp7jg4rooYzlpInmoLxcIiwgXCJjbGFzc2ljYWxfbmFfY29sdW1uX2NoYW5nZVwiLFxuICBcIuOCq+ihjOWkieagvFwiLCAgICAgXCJrYWhlbl92ZXJiX2lycmVndWxhclwiLFxuICBcIuODqeOCt1wiLCAgICAgICAgIFwicmFzaGlcIixcbiAgXCLjg57jgqRcIiwgICAgICAgICBcIm1haVwiLFxuICBcIuOCv+ODqlwiLCAgICAgICAgIFwidGFyaVwiLFxuICBcIuWRieODrOODq1wiLCAgICAgICBcImt1cmVydVwiLFxuICBcIuW9ouWuueipnlwiLCAgICAgICBcImFkamVjdGl2ZVwiLFxuICBcIuOCsuODilwiLCAgICAgICAgIFwiZ2VuYVwiLFxuICBcIuS4gOiIrCvjgYZcIiwgICAgICBcImdlbmVyYWxfdVwiLFxuICBcIuOCtuODnuOCuVwiLCAgICAgICBcInphbWFzdVwiLFxuICBcIuOCtOODiOOCt1wiLCAgICAgICBcImdvdG9zaGlcIixcbiAgXCLjg4xcIiwgICAgICAgICAgIFwibnVcIixcbiAgXCLmlofoqp7kuIrkuozmrrVcIiwgICBcImNsYXNzaWNhbF9rYW1pbmlkYW5fdmVyYl91X2lfcm93XCIsXG4gIFwi44KvXCIsICAgICAgICAgICBcImt1XCIsXG4gIFwi44K16KGM5aSJ5qC8XCIsICAgICBcInNhaGVuX3ZlcmJfaXJyZWd1bGFyXCIsXG4gIFwi44Op6KGMXCIsICAgICAgICAgXCJyYV9jb2x1bW5cIixcbiAgXCLkuIvkuIDmrrVcIiwgICAgICAgXCJzaGltb2ljaGlkYW5fdmVyYl9lX3Jvd1wiLFxuICBcIuWujOS6hlwiLCAgICAgICAgIFwiZmluYWxcIixcbiAgXCLjg6njgrfjgqRcIiwgICAgICAgXCJyYXNoaWlcIixcbiAgXCLmlofoqp7lm5vmrrVcIiwgICAgIFwiY2xhc3NpY2FsX3lvbmRhbl92ZXJiXCIsXG4gIFwi44OJ44K5XCIsICAgICAgICAgXCJkb3N1XCIsXG4gIFwi44K26KGMXCIsICAgICAgICAgXCJ6YV9jb2x1bW5cIixcbiAgXCLjg4RcIiwgICAgICAgICAgIFwic2hpXCIsXG4gIFwi44Ok44K5XCIsICAgICAgICAgXCJ5YXN1XCIsXG4gIFwi44OQ6KGMXCIsICAgICAgICAgXCJiYV9jb2x1bW5cIixcbiAgXCLmlq3lrppcIiwgICAgICAgICBcImFzc2VydGl2ZVwiLFxuICBcIuODiuODs+ODgFwiLCAgICAgICBcIm5hbmRhXCIsXG4gIFwi44Kx44OqXCIsICAgICAgICAgXCJrZXJpXCIsXG4gIFwi5paH6Kqe44K16KGM5aSJ5qC8XCIsIFwiY2xhc3NpY2FsX3NhX2NvbHVtbl9jaGFuZ2VcIixcbiAgXCLjgr/ooYxcIiwgICAgICAgICBcInRhX2NvbHVtblwiLFxuICBcIuOCseODoFwiLCAgICAgICAgIFwia2VtdVwiLFxuICBcIuOCq+ihjFwiLCAgICAgICAgIFwia2FfY29sdW1uXCIsXG4gIFwi44Ky44K5XCIsICAgICAgICAgXCJnZXN1XCIsXG4gIFwi44Ok6KGMXCIsICAgICAgICAgXCJ5YV9jb2x1bW5cIixcbiAgXCLjg57jgrlcIiwgICAgICAgICBcIm1hc3VcIixcbiAgXCLjg6zjg6tcIiwgICAgICAgICBcInJlcnVcIixcbiAgXCLjgrXooYxcIiwgICAgICAgICBcInNhX2NvbHVtblwiLFxuICBcIuaWh+iqnuS4i+S4gOautVwiLCAgIFwiY2xhc3NpY2FsX3NoaW1vaWNoaWRhbl92ZXJiX2Vfcm93XCIsXG4gIFwi44OZ44K3XCIsICAgICAgICAgXCJiZXNoaVwiLFxuICBcIuOCouODq1wiLCAgICAgICAgIFwiYXJ1XCIsXG4gIFwi44OkXCIsICAgICAgICAgICBcInlhXCIsXG4gIFwi5LqU5q61XCIsICAgICAgICAgXCJnb2Rhbl92ZXJiXCIsXG4gIFwi5LiA6IisXCIsICAgICAgICAgXCJnZW5lcmFsXCIsXG4gIFwi44OH44K5XCIsICAgICAgICAgXCJkZXN1XCIsXG4gIFwi44OqXCIsICAgICAgICAgICBcInJpXCIsXG4gIFwi44OK44OqXCIsICAgICAgICAgXCJuYXJpXCIsXG4gIFwi5paH6Kqe5LiK5LiA5q61XCIsICAgXCJjbGFzc2ljYWxfa2FtaWljaGlkYW5fdmVyYl9pX3Jvd1wiLFxuICBcIueEoeWkieWMluWei1wiLCAgICAgXCJ1bmluZmxlY3RlZF9mb3JtXCIsXG4gIFwi44K6XCIsICAgICAgICAgICBcInp1XCIsXG4gIFwi44K444OjXCIsICAgICAgICAgXCJqYVwiLFxuICBcIuaWh+iqnuOCq+ihjOWkieagvFwiLCBcImNsYXNzaWNhbF9rYV9jb2x1bW5fY2hhbmdlXCIsXG4gIFwi44Kk44KmXCIsICAgICAgICAgXCJpdVwiXG5dO1xuZnVuY3Rpb24ga2V5c1RvT2JqKGtleXM6IHN0cmluZ1tdKSB7XG4gIGlmIChrZXlzLmxlbmd0aCAlIDIgIT09IDApIHsgdGhyb3cgbmV3IEVycm9yKFwiRXZlbiBudW1iZXIgb2Yga2V5cyByZXF1aXJlZFwiKTsgfVxuICBsZXQgcmV0OiBhbnkgPSB7fTtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSArPSAyKSB7IHJldFtrZXlzW2ldXSA9IGtleXNbaSArIDFdOyB9XG4gIHJldHVybiByZXQ7XG59XG5jb25zdCBwYXJ0T2ZTcGVlY2hPYmogPSBrZXlzVG9PYmoocGFydE9mU3BlZWNoS2V5cyk7XG5jb25zdCBpbmZsZWN0aW9uT2JqID0ga2V5c1RvT2JqKGluZmxlY3Rpb25LZXlzKTtcbmNvbnN0IGluZmxlY3Rpb25UeXBlT2JqID0ga2V5c1RvT2JqKGluZmxlY3Rpb25UeXBlS2V5cyk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnZva2VNZWNhYih0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBuYXRpdmUgPSAhKHByb2Nlc3MuZW52W1wiTk9ERV9NRUNBQlwiXSk7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgbGV0IHNwYXduZWQgPSBuYXRpdmUgPyBzcGF3bignbWVjYWInLCBbJy1kJywgJy91c3IvbG9jYWwvbGliL21lY2FiL2RpYy91bmlkaWMnXSkgOiBzcGF3bignbnB4JywgW1xuICAgICAgJ21lY2FiLWVtc2NyaXB0ZW4tbm9kZScsICctZCcsIHByb2Nlc3MuZW52W1wiVU5JRElDXCJdIHx8ICcvdXNyL2xvY2FsL2xpYi9tZWNhYi9kaWMvdW5pZGljJ1xuICAgIF0uY29uY2F0KHByb2Nlc3MuZW52W1wiTUVDQUJSQ1wiXSA/IFsnLXInLCBwcm9jZXNzLmVudltcIk1FQ0FCUkNcIl0gfHwgJy91c3IvbG9jYWwvZXRjL21lY2FicmMnXSA6IFtdKSk7XG4gICAgc3Bhd25lZC5zdGRpbi53cml0ZSh0ZXh0KTtcbiAgICBzcGF3bmVkLnN0ZGluLndyaXRlKCdcXG4nKTsgLy8gbmVjZXNzYXJ5LCBvdGhlcndpc2UgTWVDYWIgc2F5cyBgaW5wdXQtYnVmZmVyIG92ZXJmbG93LmBcbiAgICBzcGF3bmVkLnN0ZGluLmVuZCgpO1xuICAgIGxldCBhcnI6IHN0cmluZ1tdID0gW107XG4gICAgc3Bhd25lZC5zdGRvdXQub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiBhcnIucHVzaChkYXRhLnRvU3RyaW5nKCd1dGY4JykpKTtcbiAgICBzcGF3bmVkLnN0ZGVyci5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKCdzdGRlcnInLCBkYXRhLnRvU3RyaW5nKCkpO1xuICAgICAgcmVqZWN0KGRhdGEpO1xuICAgIH0pO1xuICAgIHNwYXduZWQub24oJ2Nsb3NlJywgKGNvZGU6IG51bWJlcikgPT4ge1xuICAgICAgaWYgKGNvZGUgIT09IDApIHsgcmVqZWN0KGNvZGUpOyB9XG4gICAgICByZXNvbHZlKGFyci5qb2luKCcnKSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1vcnBoZW1lIHtcbiAgbGl0ZXJhbDogc3RyaW5nO1xuICBwcm9udW5jaWF0aW9uOiBzdHJpbmc7XG4gIGxlbW1hUmVhZGluZzogc3RyaW5nO1xuICBsZW1tYTogc3RyaW5nO1xuICBwYXJ0T2ZTcGVlY2g6IHN0cmluZ1tdO1xuICBpbmZsZWN0aW9uVHlwZTogc3RyaW5nW118bnVsbDtcbiAgaW5mbGVjdGlvbjogc3RyaW5nW118bnVsbDtcbn1cbmV4cG9ydCB0eXBlIE1heWJlTW9ycGhlbWUgPSBNb3JwaGVtZXxudWxsO1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXModjogTWF5YmVNb3JwaGVtZVtdKTogTW9ycGhlbWVbXSB7IHJldHVybiB2LmZpbHRlcihvID0+ICEhbykgYXMgTW9ycGhlbWVbXTsgfVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlTW9ycGhlbWVUb01vcnBoZW1lKG86IE1heWJlTW9ycGhlbWUpOiBNb3JwaGVtZSB7XG4gIGlmIChvKSB7IHJldHVybiBvOyB9XG4gIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBtb3JwaGVtZSBmb3VuZCcpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1vcnBoZW1lc0VxKHg6IE1heWJlTW9ycGhlbWUsIHk6IE1heWJlTW9ycGhlbWUpOiBib29sZWFuIHtcbiAgcmV0dXJuICEheCAmJiAhIXkgJiYgdWx0cmFDb21wcmVzc01vcnBoZW1lKHgpID09PSB1bHRyYUNvbXByZXNzTW9ycGhlbWUoeSk7XG59XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNb3JwaGVtZShyYXc6IHN0cmluZ1tdKTogTWF5YmVNb3JwaGVtZSB7XG4gIGlmIChyYXcubGVuZ3RoID09PSA3KSB7XG4gICAgY29uc3QgW2xpdGVyYWwsIHByb251bmNpYXRpb24sIGxlbW1hUmVhZGluZywgbGVtbWEsIHBhcnRPZlNwZWVjaFJhdywgaW5mbGVjdGlvblR5cGVSYXcsIGluZmxlY3Rpb25SYXddID0gcmF3O1xuICAgIGNvbnN0IGNsZWFuID0gKGRhc2hlZDogc3RyaW5nLCBvYmo6IGFueSkgPT4gZGFzaGVkID09PSAnJyA/IG51bGwgOiBkYXNoZWQuc3BsaXQoJy0nKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHJlczogc3RyaW5nID0gb2JqW2tleV07XG4gICAgICBpZiAoIXJlcykge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdVbmtub3duIE1lQ2FiIFVuaWRpYyBrZXkgZW5jb3VudGVyZWQsIGtleScsIGtleSwgJ2Rhc2hlZCcsIGRhc2hlZCwgJ3JhdycsIHJhdyk7XG4gICAgICAgIC8vIHRocm93IG5ldyBFcnJvcignVW5rbm93biBNZUNhYiBVbmlkaWMga2V5IGVuY291bnRlcmVkJyk7XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXM7XG4gICAgfSk7XG4gICAgY29uc3QgcGFydE9mU3BlZWNoID0gY2xlYW4ocGFydE9mU3BlZWNoUmF3LCBwYXJ0T2ZTcGVlY2hPYmopO1xuICAgIGlmICghcGFydE9mU3BlZWNoKSB7XG4gICAgICAvLyB0aGlzIHdpbGwgbmV2ZXIgaGFwcGVuLCBidXQgYGNsZWFuYCBkb2VzIHBvdGVudGlhbGx5IHJldHVybiBudWxsIHNvIGxldCdzIGNoZWNrIGl0LlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbXB0eSBwYXJ0IG9mIHNwZWVjaCBlbmNvdW50ZXJlZCcpO1xuICAgIH1cbiAgICAvLyBUaGVzZSB0d28gY2FuIHBvdGVudGlhbGx5IGJlIG51bGwsIGZvciB1bmluZmxlY3RlZCBtb3JwaGVtZXNcbiAgICBjb25zdCBpbmZsZWN0aW9uVHlwZSA9IGNsZWFuKGluZmxlY3Rpb25UeXBlUmF3LCBpbmZsZWN0aW9uVHlwZU9iaik7XG4gICAgY29uc3QgaW5mbGVjdGlvbiA9IGNsZWFuKGluZmxlY3Rpb25SYXcsIGluZmxlY3Rpb25PYmopO1xuICAgIHJldHVybiB7bGl0ZXJhbCwgcHJvbnVuY2lhdGlvbiwgbGVtbWFSZWFkaW5nLCBsZW1tYSwgcGFydE9mU3BlZWNoLCBpbmZsZWN0aW9uVHlwZSwgaW5mbGVjdGlvbn07XG4gIH0gZWxzZSBpZiAocmF3Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnNvbGUuZXJyb3IoJ05laXRoZXIgMSBub3IgNycsIHJhdyk7XG4gIHJldHVybiBudWxsO1xuICAvLyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIGNvbHVtbnMgaW4gTWVDYWIgVW5pZGljIG91dHB1dCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNZWNhYihvcmlnaW5hbDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZykge1xuICBjb25zdCBwaWVjZXMgPSByZXN1bHQudHJpbSgpLnNwbGl0KCdcXG4nKS5tYXAobGluZSA9PiBwYXJzZU1vcnBoZW1lKGxpbmUuc3BsaXQoJ1xcdCcpKSk7XG4gIC8vIHNwbGl0IGFmdGVyIGVhY2ggbmV3bGluZSAobnVsbCksIGp1c3QgbGlrZSB0ZXh0XG4gIGNvbnN0IGxpbmVzID0gcGFydGl0aW9uQnkocGllY2VzLCAobGluZSwgaSwgb3JpZykgPT4gISEoaSAmJiBvcmlnICYmICFvcmlnW2kgLSAxXSkpO1xuICByZXR1cm4gbGluZXM7XG59XG5cbmNvbnN0IE1PUlBIRU1FU0VQID0gJ1xcdCc7XG5jb25zdCBCVU5TRVRTVVNFUCA9ICc6Oic7XG5jb25zdCBFTEVNRU5UU0VQID0gJy0nO1xuXG5leHBvcnQgZnVuY3Rpb24gdWx0cmFDb21wcmVzc01vcnBoZW1lKG06IE1heWJlTW9ycGhlbWUpOiBzdHJpbmcge1xuICByZXR1cm4gbSA/IFttLmxpdGVyYWwsIG0ucHJvbnVuY2lhdGlvbiwgbS5sZW1tYVJlYWRpbmcsIG0ubGVtbWEsIG0ucGFydE9mU3BlZWNoLmpvaW4oRUxFTUVOVFNFUCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgKG0uaW5mbGVjdGlvblR5cGUgfHwgW10pLmpvaW4oRUxFTUVOVFNFUCksIChtLmluZmxlY3Rpb24gfHwgW10pLmpvaW4oRUxFTUVOVFNFUCldLmpvaW4oTU9SUEhFTUVTRVApIDogJyc7XG59XG5leHBvcnQgZnVuY3Rpb24gdWx0cmFDb21wcmVzc01vcnBoZW1lcyhtczogTWF5YmVNb3JwaGVtZVtdKTogc3RyaW5nIHtcbiAgcmV0dXJuIG1zLm1hcCh1bHRyYUNvbXByZXNzTW9ycGhlbWUpLmpvaW4oQlVOU0VUU1VTRVApO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGRlY29tcHJlc3NNb3JwaGVtZShzOiBzdHJpbmcpOiBNYXliZU1vcnBoZW1lIHtcbiAgY29uc3Qgc3BsaXQgPSAoczogc3RyaW5nKSA9PiBzLnNwbGl0KEVMRU1FTlRTRVApO1xuICBjb25zdCBudWxsYWJsZSA9ICh2OiBhbnlbXSkgPT4gdi5sZW5ndGggPyB2IDogbnVsbDtcbiAgaWYgKHMgPT09ICcnKSB7IHJldHVybiBudWxsOyB9XG4gIGxldCBbbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbiwgbGVtbWFSZWFkaW5nLCBsZW1tYSwgcGFydE9mU3BlZWNoLCBpbmZsZWN0aW9uVHlwZSwgaW5mbGVjdGlvbl0gPSBzLnNwbGl0KE1PUlBIRU1FU0VQKTtcbiAgcmV0dXJuIHtcbiAgICBsaXRlcmFsLFxuICAgIHByb251bmNpYXRpb24sXG4gICAgbGVtbWFSZWFkaW5nLFxuICAgIGxlbW1hLFxuICAgIHBhcnRPZlNwZWVjaDogc3BsaXQocGFydE9mU3BlZWNoKSxcbiAgICBpbmZsZWN0aW9uVHlwZTogbnVsbGFibGUoc3BsaXQoaW5mbGVjdGlvblR5cGUgfHwgJycpKSxcbiAgICBpbmZsZWN0aW9uOiBudWxsYWJsZShzcGxpdChpbmZsZWN0aW9uIHx8ICcnKSlcbiAgfTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBkZWNvbXByZXNzTW9ycGhlbWVzKHM6IHN0cmluZyk6IE1heWJlTW9ycGhlbWVbXSB7IHJldHVybiBzLnNwbGl0KEJVTlNFVFNVU0VQKS5tYXAoZGVjb21wcmVzc01vcnBoZW1lKTsgfVxuXG5leHBvcnQgZnVuY3Rpb24gZ29vZE1vcnBoZW1lUHJlZGljYXRlKG06IE1vcnBoZW1lKTogYm9vbGVhbiB7XG4gIHJldHVybiAhKG0ucGFydE9mU3BlZWNoWzBdID09PSAnc3VwcGxlbWVudGFyeV9zeW1ib2wnKSAmJlxuICAgICAgICAgIShtLnBhcnRPZlNwZWVjaFswXSA9PT0gJ3BhcnRpY2xlJyAmJiBtLnBhcnRPZlNwZWVjaFsxXSA9PT0gJ3BocmFzZV9maW5hbCcpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2UodGV4dDogc3RyaW5nKTogUHJvbWlzZTxNb3JwaGVtZVtdW10+IHtcbiAgY29uc3QgbSA9IHBhcnNlTWVjYWIodGV4dCwgYXdhaXQgaW52b2tlTWVjYWIodGV4dC50cmltKCkpKTtcbiAgcmV0dXJuIG0ubWFwKHYgPT4gdi5maWx0ZXIoeCA9PiB4ICE9PSBudWxsKSBhcyBNb3JwaGVtZVtdKVxufVxuXG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcmVhZEZpbGUgPSByZXF1aXJlKCdmcycpLnJlYWRGaWxlO1xuICBjb25zdCBwcm9taXNpZnkgPSByZXF1aXJlKCd1dGlsJykucHJvbWlzaWZ5O1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICBjb25zdCBlYXc6IHtsZW5ndGg6IChzOiBzdHJpbmcpID0+IG51bWJlcn0gPSByZXF1aXJlKCdlYXN0YXNpYW53aWR0aCcpO1xuXG4gIGZ1bmN0aW9uIGZvcm1hdFJvdyhyb3c6IHN0cmluZ1tdLCB3aWR0aDogbnVtYmVyW10pIHtcbiAgICByZXR1cm4gYHwgJHt3aWR0aC5tYXAoKG4sIGkpID0+IChyb3dbaV0gfHwgJycpICsgJyAnLnJlcGVhdChuIC0gZWF3Lmxlbmd0aChyb3dbaV0gfHwgJycpKSkuam9pbignIHwgJyl9IHxgO1xuICB9XG4gIGZ1bmN0aW9uIHByaW50TWFya2Rvd25UYWJsZSh0YWJsZTogc3RyaW5nW11bXSwgaGVhZGVyOiBzdHJpbmdbXSA9IFtdKSB7XG4gICAgaWYgKGhlYWRlci5sZW5ndGggJiYgaGVhZGVyLmxlbmd0aCAhPT0gdGFibGVbMF0ubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RhYmxlIGFuZCBoZWFkZXIgaGF2ZSBkaWZmZXJlbnQgbGVuZ3RocycpO1xuICAgIH1cbiAgICBjb25zdCBjZWxsTGVuZ3RocyA9XG4gICAgICAgIHRhYmxlLmNvbmNhdChbaGVhZGVyXSkuZmlsdGVyKHYgPT4gdi5sZW5ndGgpLm1hcChyb3cgPT4ge3JldHVybiByb3cubWFwKGNlbGwgPT4gZWF3Lmxlbmd0aChjZWxsKSl9KTtcbiAgICBsZXQgd2lkdGhzID0gQXJyYXkuZnJvbSh0YWJsZVswXSwgKCkgPT4gMCk7XG4gICAgZm9yIChjb25zdCBsIG9mIGNlbGxMZW5ndGhzKSB7IHdpZHRocyA9IHdpZHRocy5tYXAoKGN1cnIsIGkpID0+IE1hdGgubWF4KGN1cnIsIGxbaV0pKTsgfVxuXG4gICAgaWYgKGhlYWRlci5sZW5ndGgpIHtcbiAgICAgIGNvbnNvbGUubG9nKGZvcm1hdFJvdyhoZWFkZXIsIHdpZHRocykpO1xuICAgICAgY29uc29sZS5sb2coZm9ybWF0Um93KGhlYWRlci5tYXAoKGgsIGkpID0+ICctJy5yZXBlYXQod2lkdGhzW2ldKSksIHdpZHRocykpXG4gICAgfVxuICAgIGZvciAoY29uc3Qgcm93IG9mIHRhYmxlKSB7IGNvbnNvbGUubG9nKGZvcm1hdFJvdyhyb3csIHdpZHRocykpOyB9XG4gIH1cblxuICAoYXN5bmMgZnVuY3Rpb24oKSB7XG4gICAgbGV0IHRleHQgPSAn5LuK5pel44Gv44CA6Imv44GE5aSp5rCX44Gg44CCXFxuXFxu44Gf44Gu44GX44GE44Gn44GZ44GL44CCXFxuXFxu5L2V44Gn44GN44Gf77yfJztcbiAgICBpZiAocHJvY2Vzcy5hcmd2Lmxlbmd0aCA8PSAyKSB7XG4gICAgICAvLyBubyBhcmd1bWVudHMsIHJlYWQgZnJvbSBzdGRpbi4gSWYgc3RkaW4gaXMgZW1wdHksIHVzZSBkZWZhdWx0LlxuICAgICAgdGV4dCA9IChhd2FpdCBnZXRTdGRpbigpKSB8fCB0ZXh0O1xuICAgIH0gZWxzZSB7XG4gICAgICB0ZXh0ID0gKGF3YWl0IFByb21pc2UuYWxsKHByb2Nlc3MuYXJndi5zbGljZSgyKS5tYXAoZiA9PiBwcm9taXNpZnkocmVhZEZpbGUpKGYsICd1dGY4JykpKSlcbiAgICAgICAgICAgICAgICAgLmpvaW4oJ1xcbicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgJycpO1xuICAgIH1cbiAgICBkZWxldGUgcHJvY2Vzcy5lbnZbXCJOT0RFX01FQ0FCXCJdO1xuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlTWVjYWIodGV4dCwgYXdhaXQgaW52b2tlTWVjYWIodGV4dC50cmltKCkpKTtcbiAgICAvLyBPdXRwdXRcbiAgICBjb25zdCB0YWJsZSA9IGZsYXR0ZW4ocGFyc2VkLm1hcChzID0+IHMubWFwKG0gPT4ge1xuICAgICAgcmV0dXJuIG0gPyBbbS5saXRlcmFsLCBtLnByb251bmNpYXRpb24sIG0ubGVtbWFSZWFkaW5nLCBtLmxlbW1hLCBtLnBhcnRPZlNwZWVjaC5qb2luKEVMRU1FTlRTRVApLFxuICAgICAgICAgICAgICAgIChtLmluZmxlY3Rpb25UeXBlIHx8IFtdKS5qb2luKEVMRU1FTlRTRVApLCAobS5pbmZsZWN0aW9uIHx8IFtdKS5qb2luKEVMRU1FTlRTRVApXSA6IFtdO1xuICAgIH0pKSk7XG4gICAgcHJpbnRNYXJrZG93blRhYmxlKHRhYmxlLCAnTGl0ZXJhbCxQcm9uLixMZW1tYSBSZWFkLixMZW1tYSxQb1MsSW5mbC4gVHlwZSxJbmZsLicuc3BsaXQoJywnKSk7XG4gICAge1xuICAgICAgY29uc3QgYXNzZXJ0ID0gcmVxdWlyZSgnYXNzZXJ0Jyk7XG4gICAgICBwcm9jZXNzLmVudltcIk5PREVfTUVDQUJcIl0gPSAnMSc7XG5cbiAgICAgIGNvbnN0IHBhcnNlZE5vZGUgPSBwYXJzZU1lY2FiKHRleHQsIGF3YWl0IGludm9rZU1lY2FiKHRleHQudHJpbSgpKSk7XG4gICAgICBhc3NlcnQocGFyc2VkTm9kZS5tYXAodWx0cmFDb21wcmVzc01vcnBoZW1lcykuam9pbignXFxuJykgPT09IHBhcnNlZC5tYXAodWx0cmFDb21wcmVzc01vcnBoZW1lcykuam9pbignXFxuJyksXG4gICAgICAgICAgICAgJ05hdGl2ZSBNZUNhYiBhbmQgbWVjYWItZW1zY3JpcHRlbi1ub2RlIG11c3QgcHJvZHVjZSBzYW1lIG91dHB1dCcpO1xuICAgIH1cbiAgfSkoKTtcbn1cbiJdfQ==