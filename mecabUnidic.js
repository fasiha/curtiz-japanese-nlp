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
function invokeMecab(line) {
    return new Promise((resolve, reject) => {
        let spawned = spawn('mecab', ['-d', '/usr/local/lib/mecab/dic/unidic']);
        spawned.stdin.write(line);
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
if (require.main === module) {
    const readFile = require('fs').readFile;
    const promisify = require('util').promisify;
    const getStdin = require('get-stdin');
    const eaw = require('eastasianwidth');
    function formatRow(row, width) {
        return `| ${width.map((n, i) => (row[i] || '') + ' '.repeat(n - eaw.length(row[i] || ''))).join(' | ')} |`;
    }
    function printMarkdownTable(table, header) {
        if (header && header.length !== table[0].length) {
            throw new Error('table and header have different lengths');
        }
        const cellLengths = table.concat([header]).filter(v => v.length).map(row => { return row.map(cell => eaw.length(cell)); });
        let widths = Array.from(table[0], () => 0);
        for (const l of cellLengths) {
            widths = widths.map((curr, i) => Math.max(curr, l[i]));
        }
        if (header) {
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
            const parsed = parseMecab(text, yield invokeMecab(text.trim()));
            // Output
            const table = curtiz_utils_1.flatten(parsed.map(s => s.map(m => {
                return m ? [m.literal, m.pronunciation, m.lemmaReading, m.lemma, m.partOfSpeech.join(ELEMENTSEP),
                    (m.inflectionType || []).join(ELEMENTSEP), (m.inflection || []).join(ELEMENTSEP)] : [];
            })));
            printMarkdownTable(table, 'Literal,Pron.,Lemma Read.,Lemma,PoS,Infl. Type,Infl.'.split(','));
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVjYWJVbmlkaWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtZWNhYlVuaWRpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUNBLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDN0MsK0NBQWtEO0FBRWxELE1BQU0sZ0JBQWdCLEdBQUc7SUFDdkIsS0FBSztJQUNMLFNBQVM7SUFDVCxJQUFJO0lBQ0osUUFBUTtJQUNSLEtBQUs7SUFDTCxnQkFBZ0I7SUFDaEIsSUFBSTtJQUNKLFVBQVU7SUFDVixLQUFLO0lBQ0wsU0FBUztJQUNULEtBQUs7SUFDTCxXQUFXO0lBQ1gsTUFBTTtJQUNOLGFBQWE7SUFDYixLQUFLO0lBQ0wsTUFBTTtJQUNOLE1BQU07SUFDTixTQUFTO0lBQ1QsS0FBSztJQUNMLGNBQWM7SUFDZCxJQUFJO0lBQ0osTUFBTTtJQUNOLElBQUk7SUFDSixTQUFTO0lBQ1QsT0FBTztJQUNQLE9BQU87SUFDUCxJQUFJO0lBQ0osTUFBTTtJQUNOLE9BQU87SUFDUCxXQUFXO0lBQ1gsTUFBTTtJQUNOLFFBQVE7SUFDUixJQUFJO0lBQ0osTUFBTTtJQUNOLEdBQUc7SUFDSCxXQUFXO0lBQ1gsR0FBRztJQUNILFNBQVM7SUFDVCxJQUFJO0lBQ0osT0FBTztJQUNQLEdBQUc7SUFDSCxTQUFTO0lBQ1QsSUFBSTtJQUNKLFNBQVM7SUFDVCxNQUFNO0lBQ04sUUFBUTtJQUNSLE1BQU07SUFDTixhQUFhO0lBQ2IsU0FBUztJQUNULG1CQUFtQjtJQUNuQixNQUFNO0lBQ04sa0JBQWtCO0lBQ2xCLE9BQU87SUFDUCxTQUFTO0lBQ1QsT0FBTztJQUNQLFlBQVk7SUFDWixLQUFLO0lBQ0wsYUFBYTtJQUNiLEtBQUs7SUFDTCxpQkFBaUI7SUFDakIsSUFBSTtJQUNKLE1BQU07SUFDTixLQUFLO0lBQ0wsY0FBYztJQUNkLE1BQU07SUFDTixRQUFRO0lBQ1IsS0FBSztJQUNMLFFBQVE7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RSxDQUFDLENBQUM7YUFDaEM7WUFDRCxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLE1BQU0sV0FBVyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFDaEUsU0FBUztZQUNULE1BQU0sS0FBSyxHQUFHLHNCQUFPLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUU7Z0JBQzlDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLGFBQWEsRUFBRSxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDO29CQUN0RixDQUFDLENBQUMsQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsSUFBSSxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ25HLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNMLGtCQUFrQixDQUFDLEtBQUssRUFBRSxzREFBc0QsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUMvRixDQUFDO0tBQUEsQ0FBQyxFQUFFLENBQUM7Q0FDTiIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmNvbnN0IHNwYXduID0gcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLnNwYXduO1xuaW1wb3J0IHtwYXJ0aXRpb25CeSwgZmxhdHRlbn0gZnJvbSAnY3VydGl6LXV0aWxzJztcblxuY29uc3QgcGFydE9mU3BlZWNoS2V5cyA9IFtcbiAgXCLku6PlkI3oqZ5cIixcbiAgXCJwcm9ub3VuXCIsXG4gIFwi5Ymv6KmeXCIsXG4gIFwiYWR2ZXJiXCIsXG4gIFwi5Yqp5YuV6KmeXCIsXG4gIFwiYXV4aWxpYXJ5X3ZlcmJcIixcbiAgXCLliqnoqZ5cIixcbiAgXCJwYXJ0aWNsZVwiLFxuICBcIuS/guWKqeipnlwiLFxuICBcImJpbmRpbmdcIixcbiAgXCLlia/liqnoqZ5cIixcbiAgXCJhZHZlcmJpYWxcIixcbiAgXCLmjqXntprliqnoqZ5cIixcbiAgXCJjb25qdW5jdGl2ZVwiLFxuICBcIuagvOWKqeipnlwiLFxuICBcImNhc2VcIixcbiAgXCLmupbkvZPliqnoqZ5cIixcbiAgXCJub21pbmFsXCIsXG4gIFwi57WC5Yqp6KmeXCIsXG4gIFwicGhyYXNlX2ZpbmFsXCIsXG4gIFwi5YuV6KmeXCIsXG4gIFwidmVyYlwiLFxuICBcIuS4gOiIrFwiLFxuICBcImdlbmVyYWxcIixcbiAgXCLpnZ7oh6rnq4vlj6/og71cIixcbiAgXCJib3VuZFwiLFxuICBcIuWQjeipnlwiLFxuICBcIm5vdW5cIixcbiAgXCLliqnli5XoqZ7oqp7lublcIixcbiAgXCJhdXhpbGlhcnlcIixcbiAgXCLlm7rmnInlkI3oqZ5cIixcbiAgXCJwcm9wZXJcIixcbiAgXCLkurrlkI1cIixcbiAgXCJuYW1lXCIsXG4gIFwi5ZCNXCIsXG4gIFwiZmlyc3RuYW1lXCIsXG4gIFwi5aeTXCIsXG4gIFwic3VybmFtZVwiLFxuICBcIuWcsOWQjVwiLFxuICBcInBsYWNlXCIsXG4gIFwi5Zu9XCIsXG4gIFwiY291bnRyeVwiLFxuICBcIuaVsOipnlwiLFxuICBcIm51bWVyYWxcIixcbiAgXCLmma7pgJrlkI3oqZ5cIixcbiAgXCJjb21tb25cIixcbiAgXCLjgrXlpInlj6/og71cIixcbiAgXCJ2ZXJiYWxfc3VydVwiLFxuICBcIuOCteWkieW9oueKtuipnuWPr+iDvVwiLFxuICBcInZlcmJhbF9hZGplY3RpdmFsXCIsXG4gIFwi5Ymv6Kme5Y+v6IO9XCIsXG4gIFwiYWR2ZXJiaWFsX3N1ZmZpeFwiLFxuICBcIuWKqeaVsOipnuWPr+iDvVwiLFxuICBcImNvdW50ZXJcIixcbiAgXCLlvaLnirboqZ7lj6/og71cIixcbiAgXCJhZGplY3RpdmFsXCIsXG4gIFwi5b2i5a656KmeXCIsXG4gIFwiYWRqZWN0aXZlX2lcIixcbiAgXCLlvaLnirboqZ5cIixcbiAgXCJhZGplY3RpdmFsX25vdW5cIixcbiAgXCLjgr/jg6pcIixcbiAgXCJ0YXJpXCIsXG4gIFwi5oSf5YuV6KmeXCIsXG4gIFwiaW50ZXJqZWN0aW9uXCIsXG4gIFwi44OV44Kj44Op44O8XCIsXG4gIFwiZmlsbGVyXCIsXG4gIFwi5o6l5bC+6L6eXCIsXG4gIFwic3VmZml4XCIsXG4gIFwi5YuV6Kme55qEXCIsXG4gIFwidmVyYmFsXCIsXG4gIFwi5ZCN6Kme55qEXCIsXG4gIFwibm9taW5hbF9zdWZmaXhcIixcbiAgXCLliqnmlbDoqZ5cIixcbiAgXCJjb3VudGVyX3N1ZmZpeFwiLFxuICBcIuW9ouWuueipnueahFwiLFxuICBcImFkamVjdGl2ZV9pX3N1ZmZpeFwiLFxuICBcIuW9oueKtuipnueahFwiLFxuICBcImFkamVjdGl2YWxfbm91bl9zdWZmaXhcIixcbiAgXCLmjqXntproqZ5cIixcbiAgXCJjb25qdW5jdGlvblwiLFxuICBcIuaOpemgrei+nlwiLFxuICBcInByZWZpeFwiLFxuICBcIuepuueZvVwiLFxuICBcIndoaXRlc3BhY2VcIixcbiAgXCLoo5zliqnoqJjlj7dcIixcbiAgXCJzdXBwbGVtZW50YXJ5X3N5bWJvbFwiLFxuICBcIu+8oe+8oVwiLFxuICBcImFzY2lpX2FydFwiLFxuICBcIumhlOaWh+Wtl1wiLFxuICBcImVtb3RpY29uXCIsXG4gIFwi5Y+l54K5XCIsXG4gIFwicGVyaW9kXCIsXG4gIFwi5ous5byn6ZaJXCIsXG4gIFwiYnJhY2tldF9vcGVuXCIsXG4gIFwi5ous5byn6ZaLXCIsXG4gIFwiYnJhY2tldF9jbG9zZVwiLFxuICBcIuiqreeCuVwiLFxuICBcImNvbW1hXCIsXG4gIFwi6KiY5Y+3XCIsXG4gIFwic3ltYm9sXCIsXG4gIFwi5paH5a2XXCIsXG4gIFwiY2hhcmFjdGVyXCIsXG4gIFwi6YCj5L2T6KmeXCIsXG4gIFwiYWRub21pbmFsXCIsXG4gIFwi5pyq55+l6KqeXCIsXG4gIFwidW5rbm93bl93b3Jkc1wiLFxuICBcIuOCq+OCv+OCq+ODiuaWh1wiLFxuICBcImthdGFrYW5hXCIsXG4gIFwi5ryi5paHXCIsXG4gIFwiY2hpbmVzZV93cml0aW5nXCIsXG4gIFwi6KiA44GE44KI44Gp44G/XCIsXG4gIFwiaGVzaXRhdGlvblwiLFxuICBcIndlYuiqpOiEsVwiLFxuICBcImVycm9yc19vbWlzc2lvbnNcIixcbiAgXCLmlrnoqIBcIixcbiAgXCJkaWFsZWN0XCIsXG4gIFwi44Ot44O844Oe5a2X5paHXCIsXG4gIFwibGF0aW5fYWxwaGFiZXRcIixcbiAgXCLmlrDopo/mnKrnn6Xoqp5cIixcbiAgXCJuZXdfdW5rbm93bl93b3Jkc1wiXG5dO1xuXG5jb25zdCBpbmZsZWN0aW9uS2V5cyA9IFtcbiAgXCLjgq/oqp7ms5VcIiwgICAgIFwia3Vfd29yZGluZ1wiLFxuICBcIuS7ruWumuW9olwiLCAgICAgXCJjb25kaXRpb25hbFwiLFxuICBcIuS4gOiIrFwiLCAgICAgICBcImdlbmVyYWxcIixcbiAgXCLono3lkIhcIiwgICAgICAgXCJpbnRlZ3JhdGVkXCIsXG4gIFwi5ZG95Luk5b2iXCIsICAgICBcImltcGVyYXRpdmVcIixcbiAgXCLlt7LnhLblvaJcIiwgICAgIFwicmVhbGlzXCIsXG4gIFwi6KOc5YqpXCIsICAgICAgIFwiYXV4aWxpYXJ5X2luZmxlY3Rpb25cIixcbiAgXCLmhI/lv5fmjqjph4/lvaJcIiwgXCJ2b2xpdGlvbmFsX3RlbnRhdGl2ZVwiLFxuICBcIuacqueEtuW9olwiLCAgICAgXCJpcnJlYWxpc1wiLFxuICBcIuOCtVwiLCAgICAgICAgIFwic2FcIixcbiAgXCLjgrtcIiwgICAgICAgICBcInNlXCIsXG4gIFwi5pKl6Z+z5L6/XCIsICAgICBcImV1cGhvbmljX2NoYW5nZV9uXCIsXG4gIFwi57WC5q2i5b2iXCIsICAgICBcImNvbmNsdXNpdmVcIixcbiAgXCLjgqbpn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX3VcIixcbiAgXCLkv4Ppn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX3RcIixcbiAgXCLoqp7lublcIiwgICAgICAgXCJ3b3JkX3N0ZW1cIixcbiAgXCLpgKPkvZPlvaJcIiwgICAgIFwiYXR0cmlidXRpdmVcIixcbiAgXCLjgqTpn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX2lcIixcbiAgXCLnnIHnlaVcIiwgICAgICAgXCJhYmJyZXZpYXRpb25cIixcbiAgXCLpgKPnlKjlvaJcIiwgICAgIFwiY29udGludWF0aXZlXCIsXG4gIFwi44OIXCIsICAgICAgICAgXCJjaGFuZ2VfdG9cIixcbiAgXCLjg4tcIiwgICAgICAgICBcImNoYW5nZV9uaVwiLFxuICBcIumVt+mfs1wiLCAgICAgICBcImxvbmdfc291bmRcIixcbiAgXCIqXCIsICAgICAgICAgIFwidW5pbmZsZWN0ZWRcIlxuXTtcblxuY29uc3QgaW5mbGVjdGlvblR5cGVLZXlzID0gW1xuICBcIuODpuOCr1wiLCAgICAgICAgIFwieXVrdVwiLFxuICBcIuODgOihjFwiLCAgICAgICAgIFwiZGFfY29sdW1uXCIsXG4gIFwi44K26KGM5aSJ5qC8XCIsICAgICBcInphaGVuX3ZlcmJfaXJyZWd1bGFyXCIsXG4gIFwi44OAXCIsICAgICAgICAgICBcImRhXCIsXG4gIFwi44K/44KkXCIsICAgICAgICAgXCJ0YWlcIixcbiAgXCLmlofoqp7jg6nooYzlpInmoLxcIiwgXCJjbGFzc2ljYWxfcmFfY29sdW1uX2NoYW5nZVwiLFxuICBcIuODr+ihjFwiLCAgICAgICAgIFwid2FfY29sdW1uXCIsXG4gIFwi44Kz44K5XCIsICAgICAgICAgXCJrb3N1XCIsXG4gIFwi44KtXCIsICAgICAgICAgICBcImtpXCIsXG4gIFwi5paH6Kqe5LiL5LqM5q61XCIsICAgXCJjbGFzc2ljYWxfc2hpbW9uaWRhbl92ZXJiX2VfdV9yb3dcIixcbiAgXCLjgrlcIiwgICAgICAgICAgIFwic3VcIixcbiAgXCLjg4/ooYxcIiwgICAgICAgICBcImhhX2NvbHVtblwiLFxuICBcIuS4iuS4gOautVwiLCAgICAgICBcImthbWlpY2hpZGFuX3ZlcmJfaV9yb3dcIixcbiAgXCLjgqTjgq9cIiwgICAgICAgICBcImlrdVwiLFxuICBcIuODnuihjFwiLCAgICAgICAgIFwibWFfY29sdW1uXCIsXG4gIFwi5Yqp5YuV6KmeXCIsICAgICAgIFwiYXV4aWxpYXJ5XCIsXG4gIFwi44K344KvXCIsICAgICAgICAgXCJzaGlrdVwiLFxuICBcIuODiuihjFwiLCAgICAgICAgIFwibmFfY29sdW1uXCIsXG4gIFwi44Ks6KGMXCIsICAgICAgICAgXCJnYV9jb2x1bW5cIixcbiAgXCLjg6BcIiwgICAgICAgICAgIFwibXVcIixcbiAgXCLjgqLooYxcIiwgICAgICAgICBcImFfY29sdW1uXCIsXG4gIFwi44K244Oz44K5XCIsICAgICAgIFwiemFuc3VcIixcbiAgXCLmlofoqp7lvaLlrrnoqZ5cIiwgICBcImNsYXNzaWNhbF9hZGplY3RpdmVcIixcbiAgXCLjgr9cIiwgICAgICAgICAgIFwidGFcIixcbiAgXCLkvJ3ogZ5cIiwgICAgICAgICBcInJlcG9ydGVkX3NwZWVjaFwiLFxuICBcIuODiuOCpFwiLCAgICAgICAgIFwibmFpXCIsXG4gIFwi44OY44OzXCIsICAgICAgICAgXCJoZW5cIixcbiAgXCLmlofoqp7liqnli5XoqZ5cIiwgICBcImNsYXNzaWNhbF9hdXhpbGlhcnlcIixcbiAgXCLjgrhcIiwgICAgICAgICAgIFwiamlcIixcbiAgXCLjg6/jgqLooYxcIiwgICAgICAgXCJ3YV9hX2NvbHVtblwiLFxuICBcIuaWh+iqnuODiuihjOWkieagvFwiLCBcImNsYXNzaWNhbF9uYV9jb2x1bW5fY2hhbmdlXCIsXG4gIFwi44Kr6KGM5aSJ5qC8XCIsICAgICBcImthaGVuX3ZlcmJfaXJyZWd1bGFyXCIsXG4gIFwi44Op44K3XCIsICAgICAgICAgXCJyYXNoaVwiLFxuICBcIuODnuOCpFwiLCAgICAgICAgIFwibWFpXCIsXG4gIFwi44K/44OqXCIsICAgICAgICAgXCJ0YXJpXCIsXG4gIFwi5ZGJ44Os44OrXCIsICAgICAgIFwia3VyZXJ1XCIsXG4gIFwi5b2i5a656KmeXCIsICAgICAgIFwiYWRqZWN0aXZlXCIsXG4gIFwi44Ky44OKXCIsICAgICAgICAgXCJnZW5hXCIsXG4gIFwi5LiA6IisK+OBhlwiLCAgICAgIFwiZ2VuZXJhbF91XCIsXG4gIFwi44K244Oe44K5XCIsICAgICAgIFwiemFtYXN1XCIsXG4gIFwi44K044OI44K3XCIsICAgICAgIFwiZ290b3NoaVwiLFxuICBcIuODjFwiLCAgICAgICAgICAgXCJudVwiLFxuICBcIuaWh+iqnuS4iuS6jOautVwiLCAgIFwiY2xhc3NpY2FsX2thbWluaWRhbl92ZXJiX3VfaV9yb3dcIixcbiAgXCLjgq9cIiwgICAgICAgICAgIFwia3VcIixcbiAgXCLjgrXooYzlpInmoLxcIiwgICAgIFwic2FoZW5fdmVyYl9pcnJlZ3VsYXJcIixcbiAgXCLjg6nooYxcIiwgICAgICAgICBcInJhX2NvbHVtblwiLFxuICBcIuS4i+S4gOautVwiLCAgICAgICBcInNoaW1vaWNoaWRhbl92ZXJiX2Vfcm93XCIsXG4gIFwi5a6M5LqGXCIsICAgICAgICAgXCJmaW5hbFwiLFxuICBcIuODqeOCt+OCpFwiLCAgICAgICBcInJhc2hpaVwiLFxuICBcIuaWh+iqnuWbm+autVwiLCAgICAgXCJjbGFzc2ljYWxfeW9uZGFuX3ZlcmJcIixcbiAgXCLjg4njgrlcIiwgICAgICAgICBcImRvc3VcIixcbiAgXCLjgrbooYxcIiwgICAgICAgICBcInphX2NvbHVtblwiLFxuICBcIuODhFwiLCAgICAgICAgICAgXCJzaGlcIixcbiAgXCLjg6TjgrlcIiwgICAgICAgICBcInlhc3VcIixcbiAgXCLjg5DooYxcIiwgICAgICAgICBcImJhX2NvbHVtblwiLFxuICBcIuaWreWumlwiLCAgICAgICAgIFwiYXNzZXJ0aXZlXCIsXG4gIFwi44OK44Oz44OAXCIsICAgICAgIFwibmFuZGFcIixcbiAgXCLjgrHjg6pcIiwgICAgICAgICBcImtlcmlcIixcbiAgXCLmlofoqp7jgrXooYzlpInmoLxcIiwgXCJjbGFzc2ljYWxfc2FfY29sdW1uX2NoYW5nZVwiLFxuICBcIuOCv+ihjFwiLCAgICAgICAgIFwidGFfY29sdW1uXCIsXG4gIFwi44Kx44OgXCIsICAgICAgICAgXCJrZW11XCIsXG4gIFwi44Kr6KGMXCIsICAgICAgICAgXCJrYV9jb2x1bW5cIixcbiAgXCLjgrLjgrlcIiwgICAgICAgICBcImdlc3VcIixcbiAgXCLjg6TooYxcIiwgICAgICAgICBcInlhX2NvbHVtblwiLFxuICBcIuODnuOCuVwiLCAgICAgICAgIFwibWFzdVwiLFxuICBcIuODrOODq1wiLCAgICAgICAgIFwicmVydVwiLFxuICBcIuOCteihjFwiLCAgICAgICAgIFwic2FfY29sdW1uXCIsXG4gIFwi5paH6Kqe5LiL5LiA5q61XCIsICAgXCJjbGFzc2ljYWxfc2hpbW9pY2hpZGFuX3ZlcmJfZV9yb3dcIixcbiAgXCLjg5njgrdcIiwgICAgICAgICBcImJlc2hpXCIsXG4gIFwi44Ki44OrXCIsICAgICAgICAgXCJhcnVcIixcbiAgXCLjg6RcIiwgICAgICAgICAgIFwieWFcIixcbiAgXCLkupTmrrVcIiwgICAgICAgICBcImdvZGFuX3ZlcmJcIixcbiAgXCLkuIDoiKxcIiwgICAgICAgICBcImdlbmVyYWxcIixcbiAgXCLjg4fjgrlcIiwgICAgICAgICBcImRlc3VcIixcbiAgXCLjg6pcIiwgICAgICAgICAgIFwicmlcIixcbiAgXCLjg4rjg6pcIiwgICAgICAgICBcIm5hcmlcIixcbiAgXCLmlofoqp7kuIrkuIDmrrVcIiwgICBcImNsYXNzaWNhbF9rYW1paWNoaWRhbl92ZXJiX2lfcm93XCIsXG4gIFwi54Sh5aSJ5YyW5Z6LXCIsICAgICBcInVuaW5mbGVjdGVkX2Zvcm1cIixcbiAgXCLjgrpcIiwgICAgICAgICAgIFwienVcIixcbiAgXCLjgrjjg6NcIiwgICAgICAgICBcImphXCIsXG4gIFwi5paH6Kqe44Kr6KGM5aSJ5qC8XCIsIFwiY2xhc3NpY2FsX2thX2NvbHVtbl9jaGFuZ2VcIixcbiAgXCLjgqTjgqZcIiwgICAgICAgICBcIml1XCJcbl07XG5mdW5jdGlvbiBrZXlzVG9PYmooa2V5czogc3RyaW5nW10pIHtcbiAgaWYgKGtleXMubGVuZ3RoICUgMiAhPT0gMCkgeyB0aHJvdyBuZXcgRXJyb3IoXCJFdmVuIG51bWJlciBvZiBrZXlzIHJlcXVpcmVkXCIpOyB9XG4gIGxldCByZXQ6IGFueSA9IHt9O1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyBpICs9IDIpIHsgcmV0W2tleXNbaV1dID0ga2V5c1tpICsgMV07IH1cbiAgcmV0dXJuIHJldDtcbn1cbmNvbnN0IHBhcnRPZlNwZWVjaE9iaiA9IGtleXNUb09iaihwYXJ0T2ZTcGVlY2hLZXlzKTtcbmNvbnN0IGluZmxlY3Rpb25PYmogPSBrZXlzVG9PYmooaW5mbGVjdGlvbktleXMpO1xuY29uc3QgaW5mbGVjdGlvblR5cGVPYmogPSBrZXlzVG9PYmooaW5mbGVjdGlvblR5cGVLZXlzKTtcblxuZXhwb3J0IGZ1bmN0aW9uIGludm9rZU1lY2FiKGxpbmU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgbGV0IHNwYXduZWQgPSBzcGF3bignbWVjYWInLCBbJy1kJywgJy91c3IvbG9jYWwvbGliL21lY2FiL2RpYy91bmlkaWMnXSk7XG4gICAgc3Bhd25lZC5zdGRpbi53cml0ZShsaW5lKTtcbiAgICBzcGF3bmVkLnN0ZGluLndyaXRlKCdcXG4nKTsgLy8gbmVjZXNzYXJ5LCBvdGhlcndpc2UgTWVDYWIgc2F5cyBgaW5wdXQtYnVmZmVyIG92ZXJmbG93LmBcbiAgICBzcGF3bmVkLnN0ZGluLmVuZCgpO1xuICAgIGxldCBhcnI6IHN0cmluZ1tdID0gW107XG4gICAgc3Bhd25lZC5zdGRvdXQub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiBhcnIucHVzaChkYXRhLnRvU3RyaW5nKCd1dGY4JykpKTtcbiAgICBzcGF3bmVkLnN0ZGVyci5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKCdzdGRlcnInLCBkYXRhLnRvU3RyaW5nKCkpO1xuICAgICAgcmVqZWN0KGRhdGEpO1xuICAgIH0pO1xuICAgIHNwYXduZWQub24oJ2Nsb3NlJywgKGNvZGU6IG51bWJlcikgPT4ge1xuICAgICAgaWYgKGNvZGUgIT09IDApIHsgcmVqZWN0KGNvZGUpOyB9XG4gICAgICByZXNvbHZlKGFyci5qb2luKCcnKSk7XG4gICAgfSk7XG4gIH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE1vcnBoZW1lIHtcbiAgbGl0ZXJhbDogc3RyaW5nO1xuICBwcm9udW5jaWF0aW9uOiBzdHJpbmc7XG4gIGxlbW1hUmVhZGluZzogc3RyaW5nO1xuICBsZW1tYTogc3RyaW5nO1xuICBwYXJ0T2ZTcGVlY2g6IHN0cmluZ1tdO1xuICBpbmZsZWN0aW9uVHlwZTogc3RyaW5nW118bnVsbDtcbiAgaW5mbGVjdGlvbjogc3RyaW5nW118bnVsbDtcbn1cbmV4cG9ydCB0eXBlIE1heWJlTW9ycGhlbWUgPSBNb3JwaGVtZXxudWxsO1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlTW9ycGhlbWVzVG9Nb3JwaGVtZXModjogTWF5YmVNb3JwaGVtZVtdKTogTW9ycGhlbWVbXSB7IHJldHVybiB2LmZpbHRlcihvID0+ICEhbykgYXMgTW9ycGhlbWVbXTsgfVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlTW9ycGhlbWVUb01vcnBoZW1lKG86IE1heWJlTW9ycGhlbWUpOiBNb3JwaGVtZSB7XG4gIGlmIChvKSB7IHJldHVybiBvOyB9XG4gIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBtb3JwaGVtZSBmb3VuZCcpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1vcnBoZW1lc0VxKHg6IE1heWJlTW9ycGhlbWUsIHk6IE1heWJlTW9ycGhlbWUpOiBib29sZWFuIHtcbiAgcmV0dXJuICEheCAmJiAhIXkgJiYgdWx0cmFDb21wcmVzc01vcnBoZW1lKHgpID09PSB1bHRyYUNvbXByZXNzTW9ycGhlbWUoeSk7XG59XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNb3JwaGVtZShyYXc6IHN0cmluZ1tdKTogTWF5YmVNb3JwaGVtZSB7XG4gIGlmIChyYXcubGVuZ3RoID09PSA3KSB7XG4gICAgY29uc3QgW2xpdGVyYWwsIHByb251bmNpYXRpb24sIGxlbW1hUmVhZGluZywgbGVtbWEsIHBhcnRPZlNwZWVjaFJhdywgaW5mbGVjdGlvblR5cGVSYXcsIGluZmxlY3Rpb25SYXddID0gcmF3O1xuICAgIGNvbnN0IGNsZWFuID0gKGRhc2hlZDogc3RyaW5nLCBvYmo6IGFueSkgPT4gZGFzaGVkID09PSAnJyA/IG51bGwgOiBkYXNoZWQuc3BsaXQoJy0nKS5tYXAoa2V5ID0+IHtcbiAgICAgIGNvbnN0IHJlczogc3RyaW5nID0gb2JqW2tleV07XG4gICAgICBpZiAoIXJlcykge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdVbmtub3duIE1lQ2FiIFVuaWRpYyBrZXkgZW5jb3VudGVyZWQsIGtleScsIGtleSwgJ2Rhc2hlZCcsIGRhc2hlZCwgJ3JhdycsIHJhdyk7XG4gICAgICAgIC8vIHRocm93IG5ldyBFcnJvcignVW5rbm93biBNZUNhYiBVbmlkaWMga2V5IGVuY291bnRlcmVkJyk7XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXM7XG4gICAgfSk7XG4gICAgY29uc3QgcGFydE9mU3BlZWNoID0gY2xlYW4ocGFydE9mU3BlZWNoUmF3LCBwYXJ0T2ZTcGVlY2hPYmopO1xuICAgIGlmICghcGFydE9mU3BlZWNoKSB7XG4gICAgICAvLyB0aGlzIHdpbGwgbmV2ZXIgaGFwcGVuLCBidXQgYGNsZWFuYCBkb2VzIHBvdGVudGlhbGx5IHJldHVybiBudWxsIHNvIGxldCdzIGNoZWNrIGl0LlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdFbXB0eSBwYXJ0IG9mIHNwZWVjaCBlbmNvdW50ZXJlZCcpO1xuICAgIH1cbiAgICAvLyBUaGVzZSB0d28gY2FuIHBvdGVudGlhbGx5IGJlIG51bGwsIGZvciB1bmluZmxlY3RlZCBtb3JwaGVtZXNcbiAgICBjb25zdCBpbmZsZWN0aW9uVHlwZSA9IGNsZWFuKGluZmxlY3Rpb25UeXBlUmF3LCBpbmZsZWN0aW9uVHlwZU9iaik7XG4gICAgY29uc3QgaW5mbGVjdGlvbiA9IGNsZWFuKGluZmxlY3Rpb25SYXcsIGluZmxlY3Rpb25PYmopO1xuICAgIHJldHVybiB7bGl0ZXJhbCwgcHJvbnVuY2lhdGlvbiwgbGVtbWFSZWFkaW5nLCBsZW1tYSwgcGFydE9mU3BlZWNoLCBpbmZsZWN0aW9uVHlwZSwgaW5mbGVjdGlvbn07XG4gIH0gZWxzZSBpZiAocmF3Lmxlbmd0aCA9PT0gMSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGNvbnNvbGUuZXJyb3IoJ05laXRoZXIgMSBub3IgNycsIHJhdyk7XG4gIHJldHVybiBudWxsO1xuICAvLyB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbnVtYmVyIG9mIGNvbHVtbnMgaW4gTWVDYWIgVW5pZGljIG91dHB1dCcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNZWNhYihvcmlnaW5hbDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZykge1xuICBjb25zdCBwaWVjZXMgPSByZXN1bHQudHJpbSgpLnNwbGl0KCdcXG4nKS5tYXAobGluZSA9PiBwYXJzZU1vcnBoZW1lKGxpbmUuc3BsaXQoJ1xcdCcpKSk7XG4gIC8vIHNwbGl0IGFmdGVyIGVhY2ggbmV3bGluZSAobnVsbCksIGp1c3QgbGlrZSB0ZXh0XG4gIGNvbnN0IGxpbmVzID0gcGFydGl0aW9uQnkocGllY2VzLCAobGluZSwgaSwgb3JpZykgPT4gISEoaSAmJiBvcmlnICYmICFvcmlnW2kgLSAxXSkpO1xuICByZXR1cm4gbGluZXM7XG59XG5cbmNvbnN0IE1PUlBIRU1FU0VQID0gJ1xcdCc7XG5jb25zdCBCVU5TRVRTVVNFUCA9ICc6Oic7XG5jb25zdCBFTEVNRU5UU0VQID0gJy0nO1xuXG5leHBvcnQgZnVuY3Rpb24gdWx0cmFDb21wcmVzc01vcnBoZW1lKG06IE1heWJlTW9ycGhlbWUpOiBzdHJpbmcge1xuICByZXR1cm4gbSA/IFttLmxpdGVyYWwsIG0ucHJvbnVuY2lhdGlvbiwgbS5sZW1tYVJlYWRpbmcsIG0ubGVtbWEsIG0ucGFydE9mU3BlZWNoLmpvaW4oRUxFTUVOVFNFUCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgKG0uaW5mbGVjdGlvblR5cGUgfHwgW10pLmpvaW4oRUxFTUVOVFNFUCksIChtLmluZmxlY3Rpb24gfHwgW10pLmpvaW4oRUxFTUVOVFNFUCldLmpvaW4oTU9SUEhFTUVTRVApIDogJyc7XG59XG5leHBvcnQgZnVuY3Rpb24gdWx0cmFDb21wcmVzc01vcnBoZW1lcyhtczogTWF5YmVNb3JwaGVtZVtdKTogc3RyaW5nIHtcbiAgcmV0dXJuIG1zLm1hcCh1bHRyYUNvbXByZXNzTW9ycGhlbWUpLmpvaW4oQlVOU0VUU1VTRVApO1xufVxuZXhwb3J0IGZ1bmN0aW9uIGRlY29tcHJlc3NNb3JwaGVtZShzOiBzdHJpbmcpOiBNYXliZU1vcnBoZW1lIHtcbiAgY29uc3Qgc3BsaXQgPSAoczogc3RyaW5nKSA9PiBzLnNwbGl0KEVMRU1FTlRTRVApO1xuICBjb25zdCBudWxsYWJsZSA9ICh2OiBhbnlbXSkgPT4gdi5sZW5ndGggPyB2IDogbnVsbDtcbiAgaWYgKHMgPT09ICcnKSB7IHJldHVybiBudWxsOyB9XG4gIGxldCBbbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbiwgbGVtbWFSZWFkaW5nLCBsZW1tYSwgcGFydE9mU3BlZWNoLCBpbmZsZWN0aW9uVHlwZSwgaW5mbGVjdGlvbl0gPSBzLnNwbGl0KE1PUlBIRU1FU0VQKTtcbiAgcmV0dXJuIHtcbiAgICBsaXRlcmFsLFxuICAgIHByb251bmNpYXRpb24sXG4gICAgbGVtbWFSZWFkaW5nLFxuICAgIGxlbW1hLFxuICAgIHBhcnRPZlNwZWVjaDogc3BsaXQocGFydE9mU3BlZWNoKSxcbiAgICBpbmZsZWN0aW9uVHlwZTogbnVsbGFibGUoc3BsaXQoaW5mbGVjdGlvblR5cGUgfHwgJycpKSxcbiAgICBpbmZsZWN0aW9uOiBudWxsYWJsZShzcGxpdChpbmZsZWN0aW9uIHx8ICcnKSlcbiAgfTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBkZWNvbXByZXNzTW9ycGhlbWVzKHM6IHN0cmluZyk6IE1heWJlTW9ycGhlbWVbXSB7IHJldHVybiBzLnNwbGl0KEJVTlNFVFNVU0VQKS5tYXAoZGVjb21wcmVzc01vcnBoZW1lKTsgfVxuXG5leHBvcnQgZnVuY3Rpb24gZ29vZE1vcnBoZW1lUHJlZGljYXRlKG06IE1vcnBoZW1lKTogYm9vbGVhbiB7XG4gIHJldHVybiAhKG0ucGFydE9mU3BlZWNoWzBdID09PSAnc3VwcGxlbWVudGFyeV9zeW1ib2wnKSAmJlxuICAgICAgICAgIShtLnBhcnRPZlNwZWVjaFswXSA9PT0gJ3BhcnRpY2xlJyAmJiBtLnBhcnRPZlNwZWVjaFsxXSA9PT0gJ3BocmFzZV9maW5hbCcpO1xufVxuXG5pZiAocmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgY29uc3QgcmVhZEZpbGUgPSByZXF1aXJlKCdmcycpLnJlYWRGaWxlO1xuICBjb25zdCBwcm9taXNpZnkgPSByZXF1aXJlKCd1dGlsJykucHJvbWlzaWZ5O1xuICBjb25zdCBnZXRTdGRpbiA9IHJlcXVpcmUoJ2dldC1zdGRpbicpO1xuICBjb25zdCBlYXc6IHtsZW5ndGg6IChzOiBzdHJpbmcpID0+IG51bWJlcn0gPSByZXF1aXJlKCdlYXN0YXNpYW53aWR0aCcpO1xuXG4gIGZ1bmN0aW9uIGZvcm1hdFJvdyhyb3c6IHN0cmluZ1tdLCB3aWR0aDogbnVtYmVyW10pIHtcbiAgICByZXR1cm4gYHwgJHt3aWR0aC5tYXAoKG4sIGkpID0+IChyb3dbaV0gfHwgJycpICsgJyAnLnJlcGVhdChuIC0gZWF3Lmxlbmd0aChyb3dbaV0gfHwgJycpKSkuam9pbignIHwgJyl9IHxgO1xuICB9XG4gIGZ1bmN0aW9uIHByaW50TWFya2Rvd25UYWJsZSh0YWJsZTogc3RyaW5nW11bXSwgaGVhZGVyOiBzdHJpbmdbXSkge1xuICAgIGlmIChoZWFkZXIgJiYgaGVhZGVyLmxlbmd0aCAhPT0gdGFibGVbMF0ubGVuZ3RoKSB7IHRocm93IG5ldyBFcnJvcigndGFibGUgYW5kIGhlYWRlciBoYXZlIGRpZmZlcmVudCBsZW5ndGhzJyk7IH1cbiAgICBjb25zdCBjZWxsTGVuZ3RocyA9XG4gICAgICAgIHRhYmxlLmNvbmNhdChbaGVhZGVyXSkuZmlsdGVyKHYgPT4gdi5sZW5ndGgpLm1hcChyb3cgPT4ge3JldHVybiByb3cubWFwKGNlbGwgPT4gZWF3Lmxlbmd0aChjZWxsKSl9KTtcbiAgICBsZXQgd2lkdGhzID0gQXJyYXkuZnJvbSh0YWJsZVswXSwgKCkgPT4gMCk7XG4gICAgZm9yIChjb25zdCBsIG9mIGNlbGxMZW5ndGhzKSB7IHdpZHRocyA9IHdpZHRocy5tYXAoKGN1cnIsIGkpID0+IE1hdGgubWF4KGN1cnIsIGxbaV0pKTsgfVxuXG4gICAgaWYgKGhlYWRlcikge1xuICAgICAgY29uc29sZS5sb2coZm9ybWF0Um93KGhlYWRlciwgd2lkdGhzKSk7XG4gICAgICBjb25zb2xlLmxvZyhmb3JtYXRSb3coaGVhZGVyLm1hcCgoaCwgaSkgPT4gJy0nLnJlcGVhdCh3aWR0aHNbaV0pKSwgd2lkdGhzKSlcbiAgICB9XG4gICAgZm9yIChjb25zdCByb3cgb2YgdGFibGUpIHsgY29uc29sZS5sb2coZm9ybWF0Um93KHJvdywgd2lkdGhzKSk7IH1cbiAgfVxuXG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBsZXQgdGV4dCA9ICfku4rml6Xjga/jgIDoia/jgYTlpKnmsJfjgaDjgIJcXG5cXG7jgZ/jga7jgZfjgYTjgafjgZnjgYvjgIJcXG5cXG7kvZXjgafjgY3jgZ/vvJ8nO1xuICAgIGlmIChwcm9jZXNzLmFyZ3YubGVuZ3RoIDw9IDIpIHtcbiAgICAgIC8vIG5vIGFyZ3VtZW50cywgcmVhZCBmcm9tIHN0ZGluLiBJZiBzdGRpbiBpcyBlbXB0eSwgdXNlIGRlZmF1bHQuXG4gICAgICB0ZXh0ID0gKGF3YWl0IGdldFN0ZGluKCkpIHx8IHRleHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRleHQgPSAoYXdhaXQgUHJvbWlzZS5hbGwocHJvY2Vzcy5hcmd2LnNsaWNlKDIpLm1hcChmID0+IHByb21pc2lmeShyZWFkRmlsZSkoZiwgJ3V0ZjgnKSkpKVxuICAgICAgICAgICAgICAgICAuam9pbignXFxuJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnJyk7XG4gICAgfVxuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlTWVjYWIodGV4dCwgYXdhaXQgaW52b2tlTWVjYWIodGV4dC50cmltKCkpKTtcbiAgICAvLyBPdXRwdXRcbiAgICBjb25zdCB0YWJsZSA9IGZsYXR0ZW4ocGFyc2VkLm1hcChzID0+IHMubWFwKG0gPT4ge1xuICAgICAgcmV0dXJuIG0gPyBbbS5saXRlcmFsLCBtLnByb251bmNpYXRpb24sIG0ubGVtbWFSZWFkaW5nLCBtLmxlbW1hLCBtLnBhcnRPZlNwZWVjaC5qb2luKEVMRU1FTlRTRVApLFxuICAgICAgICAgICAgICAgIChtLmluZmxlY3Rpb25UeXBlIHx8IFtdKS5qb2luKEVMRU1FTlRTRVApLCAobS5pbmZsZWN0aW9uIHx8IFtdKS5qb2luKEVMRU1FTlRTRVApXSA6IFtdO1xuICAgIH0pKSk7XG4gICAgcHJpbnRNYXJrZG93blRhYmxlKHRhYmxlLCAnTGl0ZXJhbCxQcm9uLixMZW1tYSBSZWFkLixMZW1tYSxQb1MsSW5mbC4gVHlwZSxJbmZsLicuc3BsaXQoJywnKSk7XG4gIH0pKCk7XG59XG4iXX0=