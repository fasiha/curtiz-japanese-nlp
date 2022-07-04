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
const curtiz_utils_1 = require("curtiz-utils");
const spawn = require('child_process').spawn;
function invokeJdepp(line) {
    return new Promise((resolve, reject) => {
        let spawned = spawn('jdepp');
        spawned.stdin.write(line);
        spawned.stdin.write('\n'); // necessary, otherwise MeCab says `input-buffer overflow.`
        spawned.stdin.end();
        let arr = [];
        spawned.stdout.on('data', (data) => arr.push(data.toString('utf8')));
        spawned.on('close', (code) => {
            if (code !== 0) {
                reject(code);
            }
            resolve(arr.join(''));
        });
    });
}
exports.invokeJdepp = invokeJdepp;
function parseJdepp(original, result) {
    const pieces = result.trim().split('\n').filter(s => !(s.startsWith('#') || s.startsWith('EOS')));
    return curtiz_utils_1.partitionBy(pieces, v => v.startsWith('*'));
}
exports.parseJdepp = parseJdepp;
function addJdepp(raw, morphemes) {
    return __awaiter(this, void 0, void 0, function* () {
        const jdeppRaw = yield invokeJdepp(raw);
        const jdeppSplit = parseJdepp('', jdeppRaw);
        const bunsetsus = [];
        {
            let added = 0;
            for (let bunsetsu of jdeppSplit) {
                // -1 because each `bunsetsu` array here will contain a header before the morphemes
                const thisMorphemes = morphemes.slice(added, added + bunsetsu.length - 1);
                const match = bunsetsu[0].match(/^\*\s+(?<child>[0-9]+)\s+(?<parent>[-0-9]+)D/);
                if (!(match === null || match === void 0 ? void 0 : match.groups)) {
                    throw new Error('problem parsing Jdepp output');
                }
                const { child, parent } = match.groups;
                bunsetsus.push({ morphemes: thisMorphemes, idx: +child, parent: +parent });
                added += bunsetsu.length - 1;
            }
        }
        return bunsetsus;
    });
}
exports.addJdepp = addJdepp;
