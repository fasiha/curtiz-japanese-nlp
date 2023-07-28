"use strict";
// Based on Naoko Chino's *All About Particles* (Kodansha)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const idxChinoParticles = fs_1.readFileSync(path_1.default.join(__dirname, 'chino-all-about-particles.txt'), 'utf8')
    .trim()
    .split('\n')
    .map((s, i) => [i + 1, s.split('・')]);
function lookup(raw) {
    const ret = [];
    if (raw.length === 0) {
        return ret;
    }
    const rawAlternative = raw === 'ん' ? 'の' : '';
    for (const [idx, list] of idxChinoParticles) {
        if (list.some(chino => chino.includes(raw) || (rawAlternative && chino.includes(rawAlternative)))) {
            ret.push([idx, list]);
        }
    }
    const scoreMatch = ([_, v]) => {
        const hits = v.filter(s => s.includes(raw) || (rawAlternative && s.includes(rawAlternative)))
            .map(s => Math.abs(s.length - raw.length));
        return [Math.min(...hits), hits.length, v.length];
        // Exact matches come first (minimize superfluous characters).
        // Then total number of matches
        // Finally total number of particles in this group
    };
    ret.sort((a, b) => {
        const a2 = scoreMatch(a);
        const b2 = scoreMatch(b);
        return (a2[0] - b2[0]) || (a2[1] - b2[1]) || (a2[2] - b2[2]);
    });
    return ret;
}
exports.lookup = lookup;
