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
const fs_1 = require("fs");
const node_gzip_1 = require("node-gzip");
const xml2js_1 = require("xml2js");
const KANJIDIC_FILE = 'kanjidic2.xml.gz';
function setup() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs_1.existsSync(KANJIDIC_FILE)) {
            console.error(`Kanjidic2 missing. Download ${KANJIDIC_FILE} from http://www.edrdg.org/wiki/index.php/KANJIDIC_Project.`);
            process.exit(1);
        }
        const raw = (yield node_gzip_1.ungzip(fs_1.readFileSync(KANJIDIC_FILE))).toString();
        const obj = yield xml2js_1.parseStringPromise(raw.slice(raw.indexOf('<kanjidic2>')));
        return obj.kanjidic2;
    });
}
exports.setup = setup;
function setupSimple() {
    return __awaiter(this, void 0, void 0, function* () {
        const dic = yield setup();
        return Object.fromEntries(dic.character.map(c => [c.literal, normalizeCharacter(c)]));
    });
}
exports.setupSimple = setupSimple;
function normalizeCharacter(c) {
    var _a, _b, _c, _d, _e;
    try {
        const nanori = ((_a = c.reading_meaning) === null || _a === void 0 ? void 0 : _a[0].nanori) || [];
        const meanings = (((_c = (_b = c.reading_meaning) === null || _b === void 0 ? void 0 : _b[0].rmgroup[0].meaning) === null || _c === void 0 ? void 0 : _c.filter(s => typeof s === 'string')) || []);
        const readings = ((_e = (_d = c.reading_meaning) === null || _d === void 0 ? void 0 : _d[0].rmgroup[0].reading) === null || _e === void 0 ? void 0 : _e.filter(o => o.$.r_type.startsWith('ja')).map(o => o._)) || [];
        return { nanori, readings, meanings, literal: c.literal[0] };
    }
    catch (_f) {
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
    (function main() {
        return __awaiter(this, void 0, void 0, function* () {
            const dic = yield setup();
            console.log(dic.character.slice(0, 10).map(summarizeCharacter).join('\n'));
            fs_1.writeFileSync('kanjidic.json', JSON.stringify({
                header: normalizeHeader(dic.header[0]),
                kanjidic2: Object.fromEntries(dic.character.map(c => [c.literal, normalizeCharacter(c)]))
            }));
        });
    })();
}
