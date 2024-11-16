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

const CUSTOM_DICTIONARY = {
  "ということ": toIuKoto
};
if (new Set(Object.values(CUSTOM_DICTIONARY).map(o => o.id)).size !== Object.keys(CUSTOM_DICTIONARY).length) {
  throw new Error('repeated keys found in custom dictionary?')
}

export function readingBeginning(_: null, text: string, __ = null): Word[] {
  if ('ということ'.startsWith(text)) { return [CUSTOM_DICTIONARY['ということ']] }
  return [];
}