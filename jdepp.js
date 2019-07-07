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
const utils_1 = require("./utils");
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
    return utils_1.partitionBy(pieces, v => v.startsWith('*'));
}
exports.parseJdepp = parseJdepp;
function addJdepp(raw, morphemes) {
    return __awaiter(this, void 0, void 0, function* () {
        let jdeppRaw = yield invokeJdepp(raw);
        let jdeppSplit = parseJdepp('', jdeppRaw);
        let bunsetsus = [];
        {
            let added = 0;
            for (let bunsetsu of jdeppSplit) {
                // -1 because each `bunsetsu` array here will contain a header before the morphemes
                bunsetsus.push(morphemes.slice(added, added + bunsetsu.length - 1));
                added += bunsetsu.length - 1;
            }
        }
        return bunsetsus;
    });
}
exports.addJdepp = addJdepp;
