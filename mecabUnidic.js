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
            for (const sentence of parsed) {
                for (const morpheme of sentence) {
                    if (morpheme) {
                        console.log(ultraCompressMorpheme(morpheme));
                    }
                    else {
                        console.log('---');
                    }
                }
            }
            if (false) {
                const formatter = (arr) => arr.map(arr => '  [ ' + arr.map(x => JSON.stringify(x)).join(',\n    ')).join(' ],\n');
                const ldjsonFormatter = (arr) => arr.map(x => JSON.stringify(x)).join('\n');
                console.log(ldjsonFormatter(parsed));
            }
        });
    })();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWVjYWJVbmlkaWMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJtZWNhYlVuaWRpYy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDLEtBQUssQ0FBQztBQUM3QywrQ0FBeUM7QUFFekMsTUFBTSxnQkFBZ0IsR0FBRztJQUN2QixLQUFLO0lBQ0wsU0FBUztJQUNULElBQUk7SUFDSixRQUFRO0lBQ1IsS0FBSztJQUNMLGdCQUFnQjtJQUNoQixJQUFJO0lBQ0osVUFBVTtJQUNWLEtBQUs7SUFDTCxTQUFTO0lBQ1QsS0FBSztJQUNMLFdBQVc7SUFDWCxNQUFNO0lBQ04sYUFBYTtJQUNiLEtBQUs7SUFDTCxNQUFNO0lBQ04sTUFBTTtJQUNOLFNBQVM7SUFDVCxLQUFLO0lBQ0wsY0FBYztJQUNkLElBQUk7SUFDSixNQUFNO0lBQ04sSUFBSTtJQUNKLFNBQVM7SUFDVCxPQUFPO0lBQ1AsT0FBTztJQUNQLElBQUk7SUFDSixNQUFNO0lBQ04sT0FBTztJQUNQLFdBQVc7SUFDWCxNQUFNO0lBQ04sUUFBUTtJQUNSLElBQUk7SUFDSixNQUFNO0lBQ04sR0FBRztJQUNILFdBQVc7SUFDWCxHQUFHO0lBQ0gsU0FBUztJQUNULElBQUk7SUFDSixPQUFPO0lBQ1AsR0FBRztJQUNILFNBQVM7SUFDVCxJQUFJO0lBQ0osU0FBUztJQUNULE1BQU07SUFDTixRQUFRO0lBQ1IsTUFBTTtJQUNOLGFBQWE7SUFDYixTQUFTO0lBQ1QsbUJBQW1CO0lBQ25CLE1BQU07SUFDTixrQkFBa0I7SUFDbEIsT0FBTztJQUNQLFNBQVM7SUFDVCxPQUFPO0lBQ1AsWUFBWTtJQUNaLEtBQUs7SUFDTCxhQUFhO0lBQ2IsS0FBSztJQUNMLGlCQUFpQjtJQUNqQixJQUFJO0lBQ0osTUFBTTtJQUNOLEtBQUs7SUFDTCxjQUFjO0lBQ2QsTUFBTTtJQUNOLFFBQVE7SUFDUixLQUFLO0lBQ0wsUUFBUTtJ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Q0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDM0YsTUFBTSxlQUFlLEdBQUcsQ0FBQyxHQUFzQixFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDL0YsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQzthQUN0QztRQUNILENBQUM7S0FBQSxDQUFDLEVBQUUsQ0FBQztDQUNOIiwic291cmNlc0NvbnRlbnQiOlsiY29uc3Qgc3Bhd24gPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuc3Bhd247XG5pbXBvcnQge3BhcnRpdGlvbkJ5fSBmcm9tICdjdXJ0aXotdXRpbHMnO1xuXG5jb25zdCBwYXJ0T2ZTcGVlY2hLZXlzID0gW1xuICBcIuS7o+WQjeipnlwiLFxuICBcInByb25vdW5cIixcbiAgXCLlia/oqZ5cIixcbiAgXCJhZHZlcmJcIixcbiAgXCLliqnli5XoqZ5cIixcbiAgXCJhdXhpbGlhcnlfdmVyYlwiLFxuICBcIuWKqeipnlwiLFxuICBcInBhcnRpY2xlXCIsXG4gIFwi5L+C5Yqp6KmeXCIsXG4gIFwiYmluZGluZ1wiLFxuICBcIuWJr+WKqeipnlwiLFxuICBcImFkdmVyYmlhbFwiLFxuICBcIuaOpee2muWKqeipnlwiLFxuICBcImNvbmp1bmN0aXZlXCIsXG4gIFwi5qC85Yqp6KmeXCIsXG4gIFwiY2FzZVwiLFxuICBcIua6luS9k+WKqeipnlwiLFxuICBcIm5vbWluYWxcIixcbiAgXCLntYLliqnoqZ5cIixcbiAgXCJwaHJhc2VfZmluYWxcIixcbiAgXCLli5XoqZ5cIixcbiAgXCJ2ZXJiXCIsXG4gIFwi5LiA6IisXCIsXG4gIFwiZ2VuZXJhbFwiLFxuICBcIumdnuiHqueri+WPr+iDvVwiLFxuICBcImJvdW5kXCIsXG4gIFwi5ZCN6KmeXCIsXG4gIFwibm91blwiLFxuICBcIuWKqeWLleipnuiqnuW5uVwiLFxuICBcImF1eGlsaWFyeVwiLFxuICBcIuWbuuacieWQjeipnlwiLFxuICBcInByb3BlclwiLFxuICBcIuS6uuWQjVwiLFxuICBcIm5hbWVcIixcbiAgXCLlkI1cIixcbiAgXCJmaXJzdG5hbWVcIixcbiAgXCLlp5NcIixcbiAgXCJzdXJuYW1lXCIsXG4gIFwi5Zyw5ZCNXCIsXG4gIFwicGxhY2VcIixcbiAgXCLlm71cIixcbiAgXCJjb3VudHJ5XCIsXG4gIFwi5pWw6KmeXCIsXG4gIFwibnVtZXJhbFwiLFxuICBcIuaZrumAmuWQjeipnlwiLFxuICBcImNvbW1vblwiLFxuICBcIuOCteWkieWPr+iDvVwiLFxuICBcInZlcmJhbF9zdXJ1XCIsXG4gIFwi44K15aSJ5b2i54q26Kme5Y+v6IO9XCIsXG4gIFwidmVyYmFsX2FkamVjdGl2YWxcIixcbiAgXCLlia/oqZ7lj6/og71cIixcbiAgXCJhZHZlcmJpYWxfc3VmZml4XCIsXG4gIFwi5Yqp5pWw6Kme5Y+v6IO9XCIsXG4gIFwiY291bnRlclwiLFxuICBcIuW9oueKtuipnuWPr+iDvVwiLFxuICBcImFkamVjdGl2YWxcIixcbiAgXCLlvaLlrrnoqZ5cIixcbiAgXCJhZGplY3RpdmVfaVwiLFxuICBcIuW9oueKtuipnlwiLFxuICBcImFkamVjdGl2YWxfbm91blwiLFxuICBcIuOCv+ODqlwiLFxuICBcInRhcmlcIixcbiAgXCLmhJ/li5XoqZ5cIixcbiAgXCJpbnRlcmplY3Rpb25cIixcbiAgXCLjg5XjgqPjg6njg7xcIixcbiAgXCJmaWxsZXJcIixcbiAgXCLmjqXlsL7ovp5cIixcbiAgXCJzdWZmaXhcIixcbiAgXCLli5XoqZ7nmoRcIixcbiAgXCJ2ZXJiYWxcIixcbiAgXCLlkI3oqZ7nmoRcIixcbiAgXCJub21pbmFsX3N1ZmZpeFwiLFxuICBcIuWKqeaVsOipnlwiLFxuICBcImNvdW50ZXJfc3VmZml4XCIsXG4gIFwi5b2i5a656Kme55qEXCIsXG4gIFwiYWRqZWN0aXZlX2lfc3VmZml4XCIsXG4gIFwi5b2i54q26Kme55qEXCIsXG4gIFwiYWRqZWN0aXZhbF9ub3VuX3N1ZmZpeFwiLFxuICBcIuaOpee2muipnlwiLFxuICBcImNvbmp1bmN0aW9uXCIsXG4gIFwi5o6l6aCt6L6eXCIsXG4gIFwicHJlZml4XCIsXG4gIFwi56m655m9XCIsXG4gIFwid2hpdGVzcGFjZVwiLFxuICBcIuijnOWKqeiomOWPt1wiLFxuICBcInN1cHBsZW1lbnRhcnlfc3ltYm9sXCIsXG4gIFwi77yh77yhXCIsXG4gIFwiYXNjaWlfYXJ0XCIsXG4gIFwi6aGU5paH5a2XXCIsXG4gIFwiZW1vdGljb25cIixcbiAgXCLlj6XngrlcIixcbiAgXCJwZXJpb2RcIixcbiAgXCLmi6zlvKfplolcIixcbiAgXCJicmFja2V0X29wZW5cIixcbiAgXCLmi6zlvKfplotcIixcbiAgXCJicmFja2V0X2Nsb3NlXCIsXG4gIFwi6Kqt54K5XCIsXG4gIFwiY29tbWFcIixcbiAgXCLoqJjlj7dcIixcbiAgXCJzeW1ib2xcIixcbiAgXCLmloflrZdcIixcbiAgXCJjaGFyYWN0ZXJcIixcbiAgXCLpgKPkvZPoqZ5cIixcbiAgXCJhZG5vbWluYWxcIixcbiAgXCLmnKrnn6Xoqp5cIixcbiAgXCJ1bmtub3duX3dvcmRzXCIsXG4gIFwi44Kr44K/44Kr44OK5paHXCIsXG4gIFwia2F0YWthbmFcIixcbiAgXCLmvKLmlodcIixcbiAgXCJjaGluZXNlX3dyaXRpbmdcIixcbiAgXCLoqIDjgYTjgojjganjgb9cIixcbiAgXCJoZXNpdGF0aW9uXCIsXG4gIFwid2Vi6Kqk6ISxXCIsXG4gIFwiZXJyb3JzX29taXNzaW9uc1wiLFxuICBcIuaWueiogFwiLFxuICBcImRpYWxlY3RcIixcbiAgXCLjg63jg7zjg57lrZfmlodcIixcbiAgXCJsYXRpbl9hbHBoYWJldFwiLFxuICBcIuaWsOimj+acquefpeiqnlwiLFxuICBcIm5ld191bmtub3duX3dvcmRzXCJcbl07XG5cbmNvbnN0IGluZmxlY3Rpb25LZXlzID0gW1xuICBcIuOCr+iqnuazlVwiLCAgICAgXCJrdV93b3JkaW5nXCIsXG4gIFwi5Luu5a6a5b2iXCIsICAgICBcImNvbmRpdGlvbmFsXCIsXG4gIFwi5LiA6IisXCIsICAgICAgIFwiZ2VuZXJhbFwiLFxuICBcIuiejeWQiFwiLCAgICAgICBcImludGVncmF0ZWRcIixcbiAgXCLlkb3ku6TlvaJcIiwgICAgIFwiaW1wZXJhdGl2ZVwiLFxuICBcIuW3sueEtuW9olwiLCAgICAgXCJyZWFsaXNcIixcbiAgXCLoo5zliqlcIiwgICAgICAgXCJhdXhpbGlhcnlfaW5mbGVjdGlvblwiLFxuICBcIuaEj+W/l+aOqOmHj+W9olwiLCBcInZvbGl0aW9uYWxfdGVudGF0aXZlXCIsXG4gIFwi5pyq54S25b2iXCIsICAgICBcImlycmVhbGlzXCIsXG4gIFwi44K1XCIsICAgICAgICAgXCJzYVwiLFxuICBcIuOCu1wiLCAgICAgICAgIFwic2VcIixcbiAgXCLmkqXpn7Pkvr9cIiwgICAgIFwiZXVwaG9uaWNfY2hhbmdlX25cIixcbiAgXCLntYLmraLlvaJcIiwgICAgIFwiY29uY2x1c2l2ZVwiLFxuICBcIuOCpumfs+S+v1wiLCAgICAgXCJldXBob25pY19jaGFuZ2VfdVwiLFxuICBcIuS/g+mfs+S+v1wiLCAgICAgXCJldXBob25pY19jaGFuZ2VfdFwiLFxuICBcIuiqnuW5uVwiLCAgICAgICBcIndvcmRfc3RlbVwiLFxuICBcIumAo+S9k+W9olwiLCAgICAgXCJhdHRyaWJ1dGl2ZVwiLFxuICBcIuOCpOmfs+S+v1wiLCAgICAgXCJldXBob25pY19jaGFuZ2VfaVwiLFxuICBcIuecgeeVpVwiLCAgICAgICBcImFiYnJldmlhdGlvblwiLFxuICBcIumAo+eUqOW9olwiLCAgICAgXCJjb250aW51YXRpdmVcIixcbiAgXCLjg4hcIiwgICAgICAgICBcImNoYW5nZV90b1wiLFxuICBcIuODi1wiLCAgICAgICAgIFwiY2hhbmdlX25pXCIsXG4gIFwi6ZW36Z+zXCIsICAgICAgIFwibG9uZ19zb3VuZFwiLFxuICBcIipcIiwgICAgICAgICAgXCJ1bmluZmxlY3RlZFwiXG5dO1xuXG5jb25zdCBpbmZsZWN0aW9uVHlwZUtleXMgPSBbXG4gIFwi44Om44KvXCIsICAgICAgICAgXCJ5dWt1XCIsXG4gIFwi44OA6KGMXCIsICAgICAgICAgXCJkYV9jb2x1bW5cIixcbiAgXCLjgrbooYzlpInmoLxcIiwgICAgIFwiemFoZW5fdmVyYl9pcnJlZ3VsYXJcIixcbiAgXCLjg4BcIiwgICAgICAgICAgIFwiZGFcIixcbiAgXCLjgr/jgqRcIiwgICAgICAgICBcInRhaVwiLFxuICBcIuaWh+iqnuODqeihjOWkieagvFwiLCBcImNsYXNzaWNhbF9yYV9jb2x1bW5fY2hhbmdlXCIsXG4gIFwi44Ov6KGMXCIsICAgICAgICAgXCJ3YV9jb2x1bW5cIixcbiAgXCLjgrPjgrlcIiwgICAgICAgICBcImtvc3VcIixcbiAgXCLjgq1cIiwgICAgICAgICAgIFwia2lcIixcbiAgXCLmlofoqp7kuIvkuozmrrVcIiwgICBcImNsYXNzaWNhbF9zaGltb25pZGFuX3ZlcmJfZV91X3Jvd1wiLFxuICBcIuOCuVwiLCAgICAgICAgICAgXCJzdVwiLFxuICBcIuODj+ihjFwiLCAgICAgICAgIFwiaGFfY29sdW1uXCIsXG4gIFwi5LiK5LiA5q61XCIsICAgICAgIFwia2FtaWljaGlkYW5fdmVyYl9pX3Jvd1wiLFxuICBcIuOCpOOCr1wiLCAgICAgICAgIFwiaWt1XCIsXG4gIFwi44Oe6KGMXCIsICAgICAgICAgXCJtYV9jb2x1bW5cIixcbiAgXCLliqnli5XoqZ5cIiwgICAgICAgXCJhdXhpbGlhcnlcIixcbiAgXCLjgrfjgq9cIiwgICAgICAgICBcInNoaWt1XCIsXG4gIFwi44OK6KGMXCIsICAgICAgICAgXCJuYV9jb2x1bW5cIixcbiAgXCLjgqzooYxcIiwgICAgICAgICBcImdhX2NvbHVtblwiLFxuICBcIuODoFwiLCAgICAgICAgICAgXCJtdVwiLFxuICBcIuOCouihjFwiLCAgICAgICAgIFwiYV9jb2x1bW5cIixcbiAgXCLjgrbjg7PjgrlcIiwgICAgICAgXCJ6YW5zdVwiLFxuICBcIuaWh+iqnuW9ouWuueipnlwiLCAgIFwiY2xhc3NpY2FsX2FkamVjdGl2ZVwiLFxuICBcIuOCv1wiLCAgICAgICAgICAgXCJ0YVwiLFxuICBcIuS8neiBnlwiLCAgICAgICAgIFwicmVwb3J0ZWRfc3BlZWNoXCIsXG4gIFwi44OK44KkXCIsICAgICAgICAgXCJuYWlcIixcbiAgXCLjg5jjg7NcIiwgICAgICAgICBcImhlblwiLFxuICBcIuaWh+iqnuWKqeWLleipnlwiLCAgIFwiY2xhc3NpY2FsX2F1eGlsaWFyeVwiLFxuICBcIuOCuFwiLCAgICAgICAgICAgXCJqaVwiLFxuICBcIuODr+OCouihjFwiLCAgICAgICBcIndhX2FfY29sdW1uXCIsXG4gIFwi5paH6Kqe44OK6KGM5aSJ5qC8XCIsIFwiY2xhc3NpY2FsX25hX2NvbHVtbl9jaGFuZ2VcIixcbiAgXCLjgqvooYzlpInmoLxcIiwgICAgIFwia2FoZW5fdmVyYl9pcnJlZ3VsYXJcIixcbiAgXCLjg6njgrdcIiwgICAgICAgICBcInJhc2hpXCIsXG4gIFwi44Oe44KkXCIsICAgICAgICAgXCJtYWlcIixcbiAgXCLjgr/jg6pcIiwgICAgICAgICBcInRhcmlcIixcbiAgXCLlkYnjg6zjg6tcIiwgICAgICAgXCJrdXJlcnVcIixcbiAgXCLlvaLlrrnoqZ5cIiwgICAgICAgXCJhZGplY3RpdmVcIixcbiAgXCLjgrLjg4pcIiwgICAgICAgICBcImdlbmFcIixcbiAgXCLkuIDoiKwr44GGXCIsICAgICAgXCJnZW5lcmFsX3VcIixcbiAgXCLjgrbjg57jgrlcIiwgICAgICAgXCJ6YW1hc3VcIixcbiAgXCLjgrTjg4jjgrdcIiwgICAgICAgXCJnb3Rvc2hpXCIsXG4gIFwi44OMXCIsICAgICAgICAgICBcIm51XCIsXG4gIFwi5paH6Kqe5LiK5LqM5q61XCIsICAgXCJjbGFzc2ljYWxfa2FtaW5pZGFuX3ZlcmJfdV9pX3Jvd1wiLFxuICBcIuOCr1wiLCAgICAgICAgICAgXCJrdVwiLFxuICBcIuOCteihjOWkieagvFwiLCAgICAgXCJzYWhlbl92ZXJiX2lycmVndWxhclwiLFxuICBcIuODqeihjFwiLCAgICAgICAgIFwicmFfY29sdW1uXCIsXG4gIFwi5LiL5LiA5q61XCIsICAgICAgIFwic2hpbW9pY2hpZGFuX3ZlcmJfZV9yb3dcIixcbiAgXCLlrozkuoZcIiwgICAgICAgICBcImZpbmFsXCIsXG4gIFwi44Op44K344KkXCIsICAgICAgIFwicmFzaGlpXCIsXG4gIFwi5paH6Kqe5Zub5q61XCIsICAgICBcImNsYXNzaWNhbF95b25kYW5fdmVyYlwiLFxuICBcIuODieOCuVwiLCAgICAgICAgIFwiZG9zdVwiLFxuICBcIuOCtuihjFwiLCAgICAgICAgIFwiemFfY29sdW1uXCIsXG4gIFwi44OEXCIsICAgICAgICAgICBcInNoaVwiLFxuICBcIuODpOOCuVwiLCAgICAgICAgIFwieWFzdVwiLFxuICBcIuODkOihjFwiLCAgICAgICAgIFwiYmFfY29sdW1uXCIsXG4gIFwi5pat5a6aXCIsICAgICAgICAgXCJhc3NlcnRpdmVcIixcbiAgXCLjg4rjg7Pjg4BcIiwgICAgICAgXCJuYW5kYVwiLFxuICBcIuOCseODqlwiLCAgICAgICAgIFwia2VyaVwiLFxuICBcIuaWh+iqnuOCteihjOWkieagvFwiLCBcImNsYXNzaWNhbF9zYV9jb2x1bW5fY2hhbmdlXCIsXG4gIFwi44K/6KGMXCIsICAgICAgICAgXCJ0YV9jb2x1bW5cIixcbiAgXCLjgrHjg6BcIiwgICAgICAgICBcImtlbXVcIixcbiAgXCLjgqvooYxcIiwgICAgICAgICBcImthX2NvbHVtblwiLFxuICBcIuOCsuOCuVwiLCAgICAgICAgIFwiZ2VzdVwiLFxuICBcIuODpOihjFwiLCAgICAgICAgIFwieWFfY29sdW1uXCIsXG4gIFwi44Oe44K5XCIsICAgICAgICAgXCJtYXN1XCIsXG4gIFwi44Os44OrXCIsICAgICAgICAgXCJyZXJ1XCIsXG4gIFwi44K16KGMXCIsICAgICAgICAgXCJzYV9jb2x1bW5cIixcbiAgXCLmlofoqp7kuIvkuIDmrrVcIiwgICBcImNsYXNzaWNhbF9zaGltb2ljaGlkYW5fdmVyYl9lX3Jvd1wiLFxuICBcIuODmeOCt1wiLCAgICAgICAgIFwiYmVzaGlcIixcbiAgXCLjgqLjg6tcIiwgICAgICAgICBcImFydVwiLFxuICBcIuODpFwiLCAgICAgICAgICAgXCJ5YVwiLFxuICBcIuS6lOautVwiLCAgICAgICAgIFwiZ29kYW5fdmVyYlwiLFxuICBcIuS4gOiIrFwiLCAgICAgICAgIFwiZ2VuZXJhbFwiLFxuICBcIuODh+OCuVwiLCAgICAgICAgIFwiZGVzdVwiLFxuICBcIuODqlwiLCAgICAgICAgICAgXCJyaVwiLFxuICBcIuODiuODqlwiLCAgICAgICAgIFwibmFyaVwiLFxuICBcIuaWh+iqnuS4iuS4gOautVwiLCAgIFwiY2xhc3NpY2FsX2thbWlpY2hpZGFuX3ZlcmJfaV9yb3dcIixcbiAgXCLnhKHlpInljJblnotcIiwgICAgIFwidW5pbmZsZWN0ZWRfZm9ybVwiLFxuICBcIuOCulwiLCAgICAgICAgICAgXCJ6dVwiLFxuICBcIuOCuOODo1wiLCAgICAgICAgIFwiamFcIixcbiAgXCLmlofoqp7jgqvooYzlpInmoLxcIiwgXCJjbGFzc2ljYWxfa2FfY29sdW1uX2NoYW5nZVwiLFxuICBcIuOCpOOCplwiLCAgICAgICAgIFwiaXVcIlxuXTtcbmZ1bmN0aW9uIGtleXNUb09iaihrZXlzOiBzdHJpbmdbXSkge1xuICBpZiAoa2V5cy5sZW5ndGggJSAyICE9PSAwKSB7IHRocm93IG5ldyBFcnJvcihcIkV2ZW4gbnVtYmVyIG9mIGtleXMgcmVxdWlyZWRcIik7IH1cbiAgbGV0IHJldDogYW55ID0ge307XG4gIGZvciAobGV0IGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkgKz0gMikgeyByZXRba2V5c1tpXV0gPSBrZXlzW2kgKyAxXTsgfVxuICByZXR1cm4gcmV0O1xufVxuY29uc3QgcGFydE9mU3BlZWNoT2JqID0ga2V5c1RvT2JqKHBhcnRPZlNwZWVjaEtleXMpO1xuY29uc3QgaW5mbGVjdGlvbk9iaiA9IGtleXNUb09iaihpbmZsZWN0aW9uS2V5cyk7XG5jb25zdCBpbmZsZWN0aW9uVHlwZU9iaiA9IGtleXNUb09iaihpbmZsZWN0aW9uVHlwZUtleXMpO1xuXG5leHBvcnQgZnVuY3Rpb24gaW52b2tlTWVjYWIobGluZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBsZXQgc3Bhd25lZCA9IHNwYXduKCdtZWNhYicsIFsnLWQnLCAnL3Vzci9sb2NhbC9saWIvbWVjYWIvZGljL3VuaWRpYyddKTtcbiAgICBzcGF3bmVkLnN0ZGluLndyaXRlKGxpbmUpO1xuICAgIHNwYXduZWQuc3RkaW4ud3JpdGUoJ1xcbicpOyAvLyBuZWNlc3NhcnksIG90aGVyd2lzZSBNZUNhYiBzYXlzIGBpbnB1dC1idWZmZXIgb3ZlcmZsb3cuYFxuICAgIHNwYXduZWQuc3RkaW4uZW5kKCk7XG4gICAgbGV0IGFycjogc3RyaW5nW10gPSBbXTtcbiAgICBzcGF3bmVkLnN0ZG91dC5vbignZGF0YScsIChkYXRhOiBCdWZmZXIpID0+IGFyci5wdXNoKGRhdGEudG9TdHJpbmcoJ3V0ZjgnKSkpO1xuICAgIHNwYXduZWQuc3RkZXJyLm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4ge1xuICAgICAgY29uc29sZS5sb2coJ3N0ZGVycicsIGRhdGEudG9TdHJpbmcoKSk7XG4gICAgICByZWplY3QoZGF0YSk7XG4gICAgfSk7XG4gICAgc3Bhd25lZC5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyKSA9PiB7XG4gICAgICBpZiAoY29kZSAhPT0gMCkgeyByZWplY3QoY29kZSk7IH1cbiAgICAgIHJlc29sdmUoYXJyLmpvaW4oJycpKTtcbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW9ycGhlbWUge1xuICBsaXRlcmFsOiBzdHJpbmc7XG4gIHByb251bmNpYXRpb246IHN0cmluZztcbiAgbGVtbWFSZWFkaW5nOiBzdHJpbmc7XG4gIGxlbW1hOiBzdHJpbmc7XG4gIHBhcnRPZlNwZWVjaDogc3RyaW5nW107XG4gIGluZmxlY3Rpb25UeXBlOiBzdHJpbmdbXXxudWxsO1xuICBpbmZsZWN0aW9uOiBzdHJpbmdbXXxudWxsO1xufVxuZXhwb3J0IHR5cGUgTWF5YmVNb3JwaGVtZSA9IE1vcnBoZW1lfG51bGw7XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVNb3JwaGVtZXNUb01vcnBoZW1lcyh2OiBNYXliZU1vcnBoZW1lW10pOiBNb3JwaGVtZVtdIHsgcmV0dXJuIHYuZmlsdGVyKG8gPT4gISFvKSBhcyBNb3JwaGVtZVtdOyB9XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVNb3JwaGVtZVRvTW9ycGhlbWUobzogTWF5YmVNb3JwaGVtZSk6IE1vcnBoZW1lIHtcbiAgaWYgKG8pIHsgcmV0dXJuIG87IH1cbiAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG1vcnBoZW1lIGZvdW5kJyk7XG59XG5leHBvcnQgZnVuY3Rpb24gbW9ycGhlbWVzRXEoeDogTWF5YmVNb3JwaGVtZSwgeTogTWF5YmVNb3JwaGVtZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gISF4ICYmICEheSAmJiB1bHRyYUNvbXByZXNzTW9ycGhlbWUoeCkgPT09IHVsdHJhQ29tcHJlc3NNb3JwaGVtZSh5KTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1vcnBoZW1lKHJhdzogc3RyaW5nW10pOiBNYXliZU1vcnBoZW1lIHtcbiAgaWYgKHJhdy5sZW5ndGggPT09IDcpIHtcbiAgICBjb25zdCBbbGl0ZXJhbCwgcHJvbnVuY2lhdGlvbiwgbGVtbWFSZWFkaW5nLCBsZW1tYSwgcGFydE9mU3BlZWNoUmF3LCBpbmZsZWN0aW9uVHlwZVJhdywgaW5mbGVjdGlvblJhd10gPSByYXc7XG4gICAgY29uc3QgY2xlYW4gPSAoZGFzaGVkOiBzdHJpbmcsIG9iajogYW55KSA9PiBkYXNoZWQgPT09ICcnID8gbnVsbCA6IGRhc2hlZC5zcGxpdCgnLScpLm1hcChrZXkgPT4ge1xuICAgICAgY29uc3QgcmVzOiBzdHJpbmcgPSBvYmpba2V5XTtcbiAgICAgIGlmICghcmVzKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJ1Vua25vd24gTWVDYWIgVW5pZGljIGtleSBlbmNvdW50ZXJlZCwga2V5Jywga2V5LCAnZGFzaGVkJywgZGFzaGVkLCAncmF3JywgcmF3KTtcbiAgICAgICAgLy8gdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIE1lQ2FiIFVuaWRpYyBrZXkgZW5jb3VudGVyZWQnKTtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcztcbiAgICB9KTtcbiAgICBjb25zdCBwYXJ0T2ZTcGVlY2ggPSBjbGVhbihwYXJ0T2ZTcGVlY2hSYXcsIHBhcnRPZlNwZWVjaE9iaik7XG4gICAgaWYgKCFwYXJ0T2ZTcGVlY2gpIHtcbiAgICAgIC8vIHRoaXMgd2lsbCBuZXZlciBoYXBwZW4sIGJ1dCBgY2xlYW5gIGRvZXMgcG90ZW50aWFsbHkgcmV0dXJuIG51bGwgc28gbGV0J3MgY2hlY2sgaXQuXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0VtcHR5IHBhcnQgb2Ygc3BlZWNoIGVuY291bnRlcmVkJyk7XG4gICAgfVxuICAgIC8vIFRoZXNlIHR3byBjYW4gcG90ZW50aWFsbHkgYmUgbnVsbCwgZm9yIHVuaW5mbGVjdGVkIG1vcnBoZW1lc1xuICAgIGNvbnN0IGluZmxlY3Rpb25UeXBlID0gY2xlYW4oaW5mbGVjdGlvblR5cGVSYXcsIGluZmxlY3Rpb25UeXBlT2JqKTtcbiAgICBjb25zdCBpbmZsZWN0aW9uID0gY2xlYW4oaW5mbGVjdGlvblJhdywgaW5mbGVjdGlvbk9iaik7XG4gICAgcmV0dXJuIHtsaXRlcmFsLCBwcm9udW5jaWF0aW9uLCBsZW1tYVJlYWRpbmcsIGxlbW1hLCBwYXJ0T2ZTcGVlY2gsIGluZmxlY3Rpb25UeXBlLCBpbmZsZWN0aW9ufTtcbiAgfSBlbHNlIGlmIChyYXcubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc29sZS5lcnJvcignTmVpdGhlciAxIG5vciA3JywgcmF3KTtcbiAgcmV0dXJuIG51bGw7XG4gIC8vIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBudW1iZXIgb2YgY29sdW1ucyBpbiBNZUNhYiBVbmlkaWMgb3V0cHV0Jyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1lY2FiKG9yaWdpbmFsOiBzdHJpbmcsIHJlc3VsdDogc3RyaW5nKSB7XG4gIGNvbnN0IHBpZWNlcyA9IHJlc3VsdC50cmltKCkuc3BsaXQoJ1xcbicpLm1hcChsaW5lID0+IHBhcnNlTW9ycGhlbWUobGluZS5zcGxpdCgnXFx0JykpKTtcbiAgLy8gc3BsaXQgYWZ0ZXIgZWFjaCBuZXdsaW5lIChudWxsKSwganVzdCBsaWtlIHRleHRcbiAgY29uc3QgbGluZXMgPSBwYXJ0aXRpb25CeShwaWVjZXMsIChsaW5lLCBpLCBvcmlnKSA9PiAhIShpICYmIG9yaWcgJiYgIW9yaWdbaSAtIDFdKSk7XG4gIHJldHVybiBsaW5lcztcbn1cblxuY29uc3QgTU9SUEhFTUVTRVAgPSAnXFx0JztcbmNvbnN0IEJVTlNFVFNVU0VQID0gJzo6JztcbmNvbnN0IEVMRU1FTlRTRVAgPSAnLSc7XG5cbmV4cG9ydCBmdW5jdGlvbiB1bHRyYUNvbXByZXNzTW9ycGhlbWUobTogTWF5YmVNb3JwaGVtZSk6IHN0cmluZyB7XG4gIHJldHVybiBtID8gW20ubGl0ZXJhbCwgbS5wcm9udW5jaWF0aW9uLCBtLmxlbW1hUmVhZGluZywgbS5sZW1tYSwgbS5wYXJ0T2ZTcGVlY2guam9pbihFTEVNRU5UU0VQKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAobS5pbmZsZWN0aW9uVHlwZSB8fCBbXSkuam9pbihFTEVNRU5UU0VQKSwgKG0uaW5mbGVjdGlvbiB8fCBbXSkuam9pbihFTEVNRU5UU0VQKV0uam9pbihNT1JQSEVNRVNFUCkgOiAnJztcbn1cbmV4cG9ydCBmdW5jdGlvbiB1bHRyYUNvbXByZXNzTW9ycGhlbWVzKG1zOiBNYXliZU1vcnBoZW1lW10pOiBzdHJpbmcge1xuICByZXR1cm4gbXMubWFwKHVsdHJhQ29tcHJlc3NNb3JwaGVtZSkuam9pbihCVU5TRVRTVVNFUCk7XG59XG5leHBvcnQgZnVuY3Rpb24gZGVjb21wcmVzc01vcnBoZW1lKHM6IHN0cmluZyk6IE1heWJlTW9ycGhlbWUge1xuICBjb25zdCBzcGxpdCA9IChzOiBzdHJpbmcpID0+IHMuc3BsaXQoRUxFTUVOVFNFUCk7XG4gIGNvbnN0IG51bGxhYmxlID0gKHY6IGFueVtdKSA9PiB2Lmxlbmd0aCA/IHYgOiBudWxsO1xuICBpZiAocyA9PT0gJycpIHsgcmV0dXJuIG51bGw7IH1cbiAgbGV0IFtsaXRlcmFsLCBwcm9udW5jaWF0aW9uLCBsZW1tYVJlYWRpbmcsIGxlbW1hLCBwYXJ0T2ZTcGVlY2gsIGluZmxlY3Rpb25UeXBlLCBpbmZsZWN0aW9uXSA9IHMuc3BsaXQoTU9SUEhFTUVTRVApO1xuICByZXR1cm4ge1xuICAgIGxpdGVyYWwsXG4gICAgcHJvbnVuY2lhdGlvbixcbiAgICBsZW1tYVJlYWRpbmcsXG4gICAgbGVtbWEsXG4gICAgcGFydE9mU3BlZWNoOiBzcGxpdChwYXJ0T2ZTcGVlY2gpLFxuICAgIGluZmxlY3Rpb25UeXBlOiBudWxsYWJsZShzcGxpdChpbmZsZWN0aW9uVHlwZSB8fCAnJykpLFxuICAgIGluZmxlY3Rpb246IG51bGxhYmxlKHNwbGl0KGluZmxlY3Rpb24gfHwgJycpKVxuICB9O1xufVxuZXhwb3J0IGZ1bmN0aW9uIGRlY29tcHJlc3NNb3JwaGVtZXMoczogc3RyaW5nKTogTWF5YmVNb3JwaGVtZVtdIHsgcmV0dXJuIHMuc3BsaXQoQlVOU0VUU1VTRVApLm1hcChkZWNvbXByZXNzTW9ycGhlbWUpOyB9XG5cbmV4cG9ydCBmdW5jdGlvbiBnb29kTW9ycGhlbWVQcmVkaWNhdGUobTogTW9ycGhlbWUpOiBib29sZWFuIHtcbiAgcmV0dXJuICEobS5wYXJ0T2ZTcGVlY2hbMF0gPT09ICdzdXBwbGVtZW50YXJ5X3N5bWJvbCcpICYmXG4gICAgICAgICAhKG0ucGFydE9mU3BlZWNoWzBdID09PSAncGFydGljbGUnICYmIG0ucGFydE9mU3BlZWNoWzFdID09PSAncGhyYXNlX2ZpbmFsJyk7XG59XG5cbmlmIChyZXF1aXJlLm1haW4gPT09IG1vZHVsZSkge1xuICBjb25zdCByZWFkRmlsZSA9IHJlcXVpcmUoJ2ZzJykucmVhZEZpbGU7XG4gIGNvbnN0IHByb21pc2lmeSA9IHJlcXVpcmUoJ3V0aWwnKS5wcm9taXNpZnk7XG4gIGNvbnN0IGdldFN0ZGluID0gcmVxdWlyZSgnZ2V0LXN0ZGluJyk7XG4gIChhc3luYyBmdW5jdGlvbigpIHtcbiAgICBsZXQgdGV4dCA9ICfku4rml6Xjga/jgIDoia/jgYTlpKnmsJfjgaDjgIJcXG5cXG7jgZ/jga7jgZfjgYTjgafjgZnjgYvjgIJcXG5cXG7kvZXjgafjgY3jgZ/vvJ8nO1xuICAgIGlmIChwcm9jZXNzLmFyZ3YubGVuZ3RoIDw9IDIpIHtcbiAgICAgIC8vIG5vIGFyZ3VtZW50cywgcmVhZCBmcm9tIHN0ZGluLiBJZiBzdGRpbiBpcyBlbXB0eSwgdXNlIGRlZmF1bHQuXG4gICAgICB0ZXh0ID0gKGF3YWl0IGdldFN0ZGluKCkpIHx8IHRleHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRleHQgPSAoYXdhaXQgUHJvbWlzZS5hbGwocHJvY2Vzcy5hcmd2LnNsaWNlKDIpLm1hcChmID0+IHByb21pc2lmeShyZWFkRmlsZSkoZiwgJ3V0ZjgnKSkpKVxuICAgICAgICAgICAgICAgICAuam9pbignXFxuJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAnJyk7XG4gICAgfVxuICAgIGNvbnN0IHBhcnNlZCA9IHBhcnNlTWVjYWIodGV4dCwgYXdhaXQgaW52b2tlTWVjYWIodGV4dC50cmltKCkpKTtcbiAgICBmb3IgKGNvbnN0IHNlbnRlbmNlIG9mIHBhcnNlZCkge1xuICAgICAgZm9yIChjb25zdCBtb3JwaGVtZSBvZiBzZW50ZW5jZSkge1xuICAgICAgICBpZiAobW9ycGhlbWUpIHtcbiAgICAgICAgICBjb25zb2xlLmxvZyh1bHRyYUNvbXByZXNzTW9ycGhlbWUobW9ycGhlbWUpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnLS0tJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZhbHNlKSB7XG4gICAgICBjb25zdCBmb3JtYXR0ZXIgPSAoYXJyOiBNYXliZU1vcnBoZW1lW11bXSkgPT5cbiAgICAgICAgICBhcnIubWFwKGFyciA9PiAnICBbICcgKyBhcnIubWFwKHggPT4gSlNPTi5zdHJpbmdpZnkoeCkpLmpvaW4oJyxcXG4gICAgJykpLmpvaW4oJyBdLFxcbicpO1xuICAgICAgY29uc3QgbGRqc29uRm9ybWF0dGVyID0gKGFycjogTWF5YmVNb3JwaGVtZVtdW10pID0+IGFyci5tYXAoeCA9PiBKU09OLnN0cmluZ2lmeSh4KSkuam9pbignXFxuJyk7XG4gICAgICBjb25zb2xlLmxvZyhsZGpzb25Gb3JtYXR0ZXIocGFyc2VkKSk7XG4gICAgfVxuICB9KSgpO1xufVxuIl19