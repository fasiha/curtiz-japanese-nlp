"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jmdict_simplified_node_1 = require("jmdict-simplified-node");
const basicDefinition = {
    appliesToKanji: ['*'],
    appliesToKana: ['*'],
    related: [],
    antonym: [],
    field: [],
    dialect: [],
    languageSource: [],
};
const toIuKoto = {
    id: "999000001",
    kanji: [],
    kana: [{ appliesToKanji: ['*'], common: true, text: 'ということ', tags: [] }],
    sense: [{
            ...basicDefinition,
            partOfSpeech: ["exp"],
            misc: ["id"],
            info: ["Custom Curtiz definition. See Bunpro, MaggieSensei, JLPTSensei, etc."],
            gloss: [{ type: jmdict_simplified_node_1.GlossType.explanation, lang: 'eng', text: 'nominalizes a phrase into a noun' }]
        }]
};
const CUSTOM_DICTIONARY = {
    "ということ": toIuKoto
};
if (new Set(Object.values(CUSTOM_DICTIONARY).map(o => o.id)).size !== Object.keys(CUSTOM_DICTIONARY).length) {
    throw new Error('repeated keys found in custom dictionary?');
}
function readingBeginning(_, text, __ = null) {
    if ('ということ'.startsWith(text)) {
        return [CUSTOM_DICTIONARY['ということ']];
    }
    return [];
}
exports.readingBeginning = readingBeginning;
