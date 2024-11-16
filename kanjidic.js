"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const node_gzip_1 = require("node-gzip");
const xml2js_1 = require("xml2js");
const KANJIDIC_FILE = 'kanjidic2.xml.gz';
async function setup() {
    if (!fs_1.existsSync(KANJIDIC_FILE)) {
        console.error(`Kanjidic2 missing. Download ${KANJIDIC_FILE} from http://www.edrdg.org/wiki/index.php/KANJIDIC_Project.`);
        process.exit(1);
    }
    const raw = (await node_gzip_1.ungzip(fs_1.readFileSync(KANJIDIC_FILE))).toString();
    const obj = await xml2js_1.parseStringPromise(raw.slice(raw.indexOf('<kanjidic2>')));
    return obj.kanjidic2;
}
exports.setup = setup;
async function setupSimple() {
    const dic = await setup();
    return Object.fromEntries(dic.character.map(c => [c.literal, normalizeCharacter(c)]));
}
exports.setupSimple = setupSimple;
function normalizeCharacter(c) {
    try {
        const nanori = c.reading_meaning?.[0].nanori || [];
        const meanings = (c.reading_meaning?.[0].rmgroup[0].meaning?.filter(s => typeof s === 'string') || []);
        const readings = c.reading_meaning?.[0].rmgroup[0].reading?.filter(o => o.$.r_type.startsWith('ja')).map(o => o._) || [];
        return { nanori, readings, meanings, literal: c.literal[0] };
    }
    catch {
        console.error('FAILED TO PARSE');
        console.error(c);
        console.dir(c.reading_meaning, { depth: null });
        process.exit(1);
    }
}
exports.normalizeCharacter = normalizeCharacter;
function summarizeCharacter(c) {
    const { literal, readings, meanings, nanori } = normalizeCharacter(c);
    return `${literal} ${meanings.join('；')} - ${readings.join(' ')}` +
        (nanori.length ? ` (names: ${nanori.join(' ')})` : '');
}
exports.summarizeCharacter = summarizeCharacter;
function normalizeHeader(h) {
    return {
        file_version: h.file_version[0],
        database_version: h.database_version[0],
        date_of_creation: h.date_of_creation[0]
    };
}
if (require.main === module) {
    (async function main() {
        const dic = await setup();
        console.log(dic.character.slice(0, 10).map(summarizeCharacter).join('\n'));
        fs_1.writeFileSync('kanjidic.json', JSON.stringify({
            header: normalizeHeader(dic.header[0]),
            kanjidic2: Object.fromEntries(dic.character.map(c => [c.literal, normalizeCharacter(c)]))
        }));
    })();
}
