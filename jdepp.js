"use strict";
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
