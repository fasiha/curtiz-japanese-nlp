"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const curtiz_utils_1 = require("curtiz-utils");
const spawn = require('child_process').spawn;
function invokeJdepp(line) {
    return new Promise((resolve, reject) => {
        let spawned = spawn('jdepp');
        spawned.stdin.write(line);
        spawned.stdin.write('\nEOS\n');
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
async function addJdepp(raw, morphemes) {
    const jdeppRaw = await invokeJdepp(raw);
    const jdeppSplit = parseJdepp('', jdeppRaw);
    const bunsetsus = [];
    {
        let added = 0;
        for (let bunsetsu of jdeppSplit) {
            // -1 because each `bunsetsu` array here will contain a header before the morphemes
            const thisMorphemes = morphemes.slice(added, added + bunsetsu.length - 1);
            const match = bunsetsu[0].match(/^\*\s+(?<child>[0-9]+)\s+(?<parent>[-0-9]+)D/);
            if (!match?.groups) {
                throw new Error('problem parsing Jdepp output');
            }
            const { child, parent } = match.groups;
            bunsetsus.push({ morphemes: thisMorphemes, idx: +child, parent: +parent });
            added += bunsetsu.length - 1;
        }
    }
    return bunsetsus;
}
exports.addJdepp = addJdepp;
