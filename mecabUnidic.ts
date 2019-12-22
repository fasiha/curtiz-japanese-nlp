#!/usr/bin/env node
const spawn = require('child_process').spawn;
import {partitionBy, flatten} from 'curtiz-utils';

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
  "ク語法",     "ku_wording",
  "仮定形",     "conditional",
  "一般",       "general",
  "融合",       "integrated",
  "命令形",     "imperative",
  "已然形",     "realis",
  "補助",       "auxiliary_inflection",
  "意志推量形", "volitional_tentative",
  "未然形",     "irrealis",
  "サ",         "sa",
  "セ",         "se",
  "撥音便",     "euphonic_change_n",
  "終止形",     "conclusive",
  "ウ音便",     "euphonic_change_u",
  "促音便",     "euphonic_change_t",
  "語幹",       "word_stem",
  "連体形",     "attributive",
  "イ音便",     "euphonic_change_i",
  "省略",       "abbreviation",
  "連用形",     "continuative",
  "ト",         "change_to",
  "ニ",         "change_ni",
  "長音",       "long_sound",
  "*",          "uninflected"
];

const inflectionTypeKeys = [
  "ユク",         "yuku",
  "ダ行",         "da_column",
  "ザ行変格",     "zahen_verb_irregular",
  "ダ",           "da",
  "タイ",         "tai",
  "文語ラ行変格", "classical_ra_column_change",
  "ワ行",         "wa_column",
  "コス",         "kosu",
  "キ",           "ki",
  "文語下二段",   "classical_shimonidan_verb_e_u_row",
  "ス",           "su",
  "ハ行",         "ha_column",
  "上一段",       "kamiichidan_verb_i_row",
  "イク",         "iku",
  "マ行",         "ma_column",
  "助動詞",       "auxiliary",
  "シク",         "shiku",
  "ナ行",         "na_column",
  "ガ行",         "ga_column",
  "ム",           "mu",
  "ア行",         "a_column",
  "ザンス",       "zansu",
  "文語形容詞",   "classical_adjective",
  "タ",           "ta",
  "伝聞",         "reported_speech",
  "ナイ",         "nai",
  "ヘン",         "hen",
  "文語助動詞",   "classical_auxiliary",
  "ジ",           "ji",
  "ワア行",       "wa_a_column",
  "文語ナ行変格", "classical_na_column_change",
  "カ行変格",     "kahen_verb_irregular",
  "ラシ",         "rashi",
  "マイ",         "mai",
  "タリ",         "tari",
  "呉レル",       "kureru",
  "形容詞",       "adjective",
  "ゲナ",         "gena",
  "一般+う",      "general_u",
  "ザマス",       "zamasu",
  "ゴトシ",       "gotoshi",
  "ヌ",           "nu",
  "文語上二段",   "classical_kaminidan_verb_u_i_row",
  "ク",           "ku",
  "サ行変格",     "sahen_verb_irregular",
  "ラ行",         "ra_column",
  "下一段",       "shimoichidan_verb_e_row",
  "完了",         "final",
  "ラシイ",       "rashii",
  "文語四段",     "classical_yondan_verb",
  "ドス",         "dosu",
  "ザ行",         "za_column",
  "ツ",           "shi",
  "ヤス",         "yasu",
  "バ行",         "ba_column",
  "断定",         "assertive",
  "ナンダ",       "nanda",
  "ケリ",         "keri",
  "文語サ行変格", "classical_sa_column_change",
  "タ行",         "ta_column",
  "ケム",         "kemu",
  "カ行",         "ka_column",
  "ゲス",         "gesu",
  "ヤ行",         "ya_column",
  "マス",         "masu",
  "レル",         "reru",
  "サ行",         "sa_column",
  "文語下一段",   "classical_shimoichidan_verb_e_row",
  "ベシ",         "beshi",
  "アル",         "aru",
  "ヤ",           "ya",
  "五段",         "godan_verb",
  "一般",         "general",
  "デス",         "desu",
  "リ",           "ri",
  "ナリ",         "nari",
  "文語上一段",   "classical_kamiichidan_verb_i_row",
  "無変化型",     "uninflected_form",
  "ズ",           "zu",
  "ジャ",         "ja",
  "文語カ行変格", "classical_ka_column_change",
  "イウ",         "iu"
];
function keysToObj(keys: string[]) {
  if (keys.length % 2 !== 0) { throw new Error("Even number of keys required"); }
  let ret: any = {};
  for (let i = 0; i < keys.length; i += 2) { ret[keys[i]] = keys[i + 1]; }
  return ret;
}
const partOfSpeechObj = keysToObj(partOfSpeechKeys);
const inflectionObj = keysToObj(inflectionKeys);
const inflectionTypeObj = keysToObj(inflectionTypeKeys);

export function invokeMecab(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let spawned = spawn('mecab', ['-d', '/usr/local/lib/mecab/dic/unidic']);
    spawned.stdin.write(text);
    spawned.stdin.write('\n'); // necessary, otherwise MeCab says `input-buffer overflow.`
    spawned.stdin.end();
    let arr: string[] = [];
    spawned.stdout.on('data', (data: Buffer) => arr.push(data.toString('utf8')));
    spawned.stderr.on('data', (data: Buffer) => {
      console.log('stderr', data.toString());
      reject(data);
    });
    spawned.on('close', (code: number) => {
      if (code !== 0) { reject(code); }
      resolve(arr.join(''));
    });
  });
}

export interface Morpheme {
  literal: string;
  pronunciation: string;
  lemmaReading: string;
  lemma: string;
  partOfSpeech: string[];
  inflectionType: string[]|null;
  inflection: string[]|null;
}
export type MaybeMorpheme = Morpheme|null;
export function maybeMorphemesToMorphemes(v: MaybeMorpheme[]): Morpheme[] { return v.filter(o => !!o) as Morpheme[]; }
export function maybeMorphemeToMorpheme(o: MaybeMorpheme): Morpheme {
  if (o) { return o; }
  throw new Error('Invalid morpheme found');
}
export function morphemesEq(x: MaybeMorpheme, y: MaybeMorpheme): boolean {
  return !!x && !!y && ultraCompressMorpheme(x) === ultraCompressMorpheme(y);
}
export function parseMorpheme(raw: string[]): MaybeMorpheme {
  if (raw.length === 7) {
    const [literal, pronunciation, lemmaReading, lemma, partOfSpeechRaw, inflectionTypeRaw, inflectionRaw] = raw;
    const clean = (dashed: string, obj: any) => dashed === '' ? null : dashed.split('-').map(key => {
      const res: string = obj[key];
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
    return {literal, pronunciation, lemmaReading, lemma, partOfSpeech, inflectionType, inflection};
  } else if (raw.length === 1) {
    return null;
  }
  console.error('Neither 1 nor 7', raw);
  return null;
  // throw new Error('Unexpected number of columns in MeCab Unidic output');
}

export function parseMecab(original: string, result: string) {
  const pieces = result.trim().split('\n').map(line => parseMorpheme(line.split('\t')));
  // split after each newline (null), just like text
  const lines = partitionBy(pieces, (line, i, orig) => !!(i && orig && !orig[i - 1]));
  return lines;
}

const MORPHEMESEP = '\t';
const BUNSETSUSEP = '::';
const ELEMENTSEP = '-';

export function ultraCompressMorpheme(m: MaybeMorpheme): string {
  return m ? [m.literal, m.pronunciation, m.lemmaReading, m.lemma, m.partOfSpeech.join(ELEMENTSEP),
                         (m.inflectionType || []).join(ELEMENTSEP), (m.inflection || []).join(ELEMENTSEP)].join(MORPHEMESEP) : '';
}
export function ultraCompressMorphemes(ms: MaybeMorpheme[]): string {
  return ms.map(ultraCompressMorpheme).join(BUNSETSUSEP);
}
export function decompressMorpheme(s: string): MaybeMorpheme {
  const split = (s: string) => s.split(ELEMENTSEP);
  const nullable = (v: any[]) => v.length ? v : null;
  if (s === '') { return null; }
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
export function decompressMorphemes(s: string): MaybeMorpheme[] { return s.split(BUNSETSUSEP).map(decompressMorpheme); }

export function goodMorphemePredicate(m: Morpheme): boolean {
  return !(m.partOfSpeech[0] === 'supplementary_symbol') &&
         !(m.partOfSpeech[0] === 'particle' && m.partOfSpeech[1] === 'phrase_final');
}

export async function parse(text: string): Promise<Morpheme[][]> {
  const m = parseMecab(text, await invokeMecab(text.trim()));
  return m.map(v => v.filter(x => x !== null) as Morpheme[])
}

if (require.main === module) {
  const readFile = require('fs').readFile;
  const promisify = require('util').promisify;
  const getStdin = require('get-stdin');
  const eaw: {length: (s: string) => number} = require('eastasianwidth');

  function formatRow(row: string[], width: number[]) {
    return `| ${width.map((n, i) => (row[i] || '') + ' '.repeat(n - eaw.length(row[i] || ''))).join(' | ')} |`;
  }
  function printMarkdownTable(table: string[][], header: string[] = []) {
    if (header.length && header.length !== table[0].length) {
      throw new Error('table and header have different lengths');
    }
    const cellLengths =
        table.concat([header]).filter(v => v.length).map(row => {return row.map(cell => eaw.length(cell))});
    let widths = Array.from(table[0], () => 0);
    for (const l of cellLengths) { widths = widths.map((curr, i) => Math.max(curr, l[i])); }

    if (header.length) {
      console.log(formatRow(header, widths));
      console.log(formatRow(header.map((h, i) => '-'.repeat(widths[i])), widths))
    }
    for (const row of table) { console.log(formatRow(row, widths)); }
  }

  (async function() {
    let text = '今日は　良い天気だ。\n\nたのしいですか。\n\n何できた？';
    if (process.argv.length <= 2) {
      // no arguments, read from stdin. If stdin is empty, use default.
      text = (await getStdin()) || text;
    } else {
      text = (await Promise.all(process.argv.slice(2).map(f => promisify(readFile)(f, 'utf8'))))
                 .join('\n')
                 .replace(/\r/g, '');
    }
    const parsed = parseMecab(text, await invokeMecab(text.trim()));
    // Output
    const table = flatten(parsed.map(s => s.map(m => {
      return m ? [m.literal, m.pronunciation, m.lemmaReading, m.lemma, m.partOfSpeech.join(ELEMENTSEP),
                (m.inflectionType || []).join(ELEMENTSEP), (m.inflection || []).join(ELEMENTSEP)] : [];
    })));
    printMarkdownTable(table, 'Literal,Pron.,Lemma Read.,Lemma,PoS,Infl. Type,Infl.'.split(','));
  })();
}
