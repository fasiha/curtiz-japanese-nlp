import {GlossType, Word} from "jmdict-simplified-node";

const basicDefinition = {
  appliesToKanji: ['*'],
  appliesToKana: ['*'],
  related: [],
  antonym: [],
  field: [],
  dialect: [],
  languageSource: [],
}

const toIuKoto: Word = {
  id: "999000001",
  kanji: [],
  kana: [{appliesToKanji: ['*'], common: true, text: 'ということ', tags: []}],
  sense: [{
    ...basicDefinition,
    partOfSpeech: ["exp"], // expression
    misc: ["id"],          // idiom
    info: ["Custom Curtiz definition. See Bunpro, MaggieSensei, JLPTSensei, etc."],
    gloss: [{type: GlossType.explanation, lang: 'eng', text: 'nominalizes a phrase into a noun'}]
  }]
};
const niIku: Word = {
  id: "999000002",
  kanji: [{text: 'に行く', common: false, tags: []}],
  kana: [{appliesToKanji: ['*'], common: true, text: 'にいく', tags: []}],
  sense: [{
    ...basicDefinition,
    partOfSpeech: ["gramm"], // grammar
    misc: [],
    info: ["Custom Curtiz definition. See Bunpro and JLPTSensei."],
    gloss: [{type: GlossType.explanation, lang: 'eng', text: 'to go to ~ (do something)'}]
  }]
};
const niKuru: Word = {
  id: "999000003",
  kanji: [{text: 'に来る', common: false, tags: []}],
  kana: [{appliesToKanji: ['*'], common: true, text: 'にくる', tags: []}],
  sense: [{
    ...basicDefinition,
    partOfSpeech: ["gramm"], // grammar
    misc: [],
    info: ["Custom Curtiz definition. See Kanshudo."],
    gloss: [{type: GlossType.explanation, lang: 'eng', text: 'to come to ~ (do something)'}]
  }]
};

const CUSTOM_DICTIONARY = {
  "ということ": toIuKoto,
  "に行く": niIku,
  "に来る": niKuru,
};
if (new Set(Object.values(CUSTOM_DICTIONARY).map(o => o.id)).size !== Object.keys(CUSTOM_DICTIONARY).length) {
  throw new Error('repeated keys found in custom dictionary?')
}

export function readingBeginning(_: null, text: string, __ = null): Word[] {
  if ('ということ'.startsWith(text)) { return [CUSTOM_DICTIONARY['ということ']] }
  if ('にいく'.startsWith(text)) { return [CUSTOM_DICTIONARY['に行く']] }
  if ('にくる'.startsWith(text)) { return [CUSTOM_DICTIONARY['に来る']] }
  return [];
}