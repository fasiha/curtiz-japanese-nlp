import {existsSync, readFileSync, writeFileSync} from 'fs'
import {ungzip} from 'node-gzip';
import {parseStringPromise} from 'xml2js';

export interface Header {
  file_version: [string];
  database_version: [string];
  date_of_creation: [string];
}
export interface Reading {
  _: string;
  $: {r_type: string};
}
export interface Meaning {
  _: string;
  $: {m_lang: string};
}
export interface ReadingMeaning {
  rmgroup: [{reading?: Reading[], meaning?: (string|Meaning)[]}];
  nanori?: string[];
}
export interface Character {
  literal: [string];
  reading_meaning?: [ReadingMeaning];
}
export interface KanjiDic2 {
  header: [Header];
  character: Character[];
}

export interface SimpleCharacter {
  nanori: string[];
  readings: string[];
  meanings: string[];
  literal: string;
}

const KANJIDIC_FILE = 'kanjidic2.xml.gz';

export async function setup(): Promise<KanjiDic2> {
  if (!existsSync(KANJIDIC_FILE)) {
    console.error(
        `Kanjidic2 missing. Download ${KANJIDIC_FILE} from http://www.edrdg.org/wiki/index.php/KANJIDIC_Project.`);
    process.exit(1);
  }
  const raw = (await ungzip(readFileSync(KANJIDIC_FILE))).toString();
  const obj = await parseStringPromise(raw.slice(raw.indexOf('<kanjidic2>')));
  return obj.kanjidic2;
}

export async function setupSimple(): Promise<Record<string, SimpleCharacter>> {
  const dic = await setup();
  return Object.fromEntries(dic.character.map(c => [c.literal, normalizeCharacter(c)]));
}

export function normalizeCharacter(c: Character): SimpleCharacter {
  try {
    const nanori = c.reading_meaning?.[0].nanori || [];
    const meanings = (c.reading_meaning?.[0].rmgroup[0].meaning?.filter(s => typeof s === 'string') || []) as string[];
    const readings =
        c.reading_meaning?.[0].rmgroup[0].reading?.filter(o => o.$.r_type.startsWith('ja')).map(o => o._) || [];
    return {nanori, readings, meanings, literal: c.literal[0]};
  } catch {
    console.error('FAILED TO PARSE');
    console.error(c);
    console.dir(c.reading_meaning, {depth: null});
    process.exit(1);
  }
}

export function summarizeCharacter(c: Character) {
  const {literal, readings, meanings, nanori} = normalizeCharacter(c);
  return `${literal} ${meanings.join('；')} - ${readings.join(' ')}` +
         (nanori.length ? ` (names: ${nanori.join(' ')})` : '');
}

function normalizeHeader(h: Header): {[k in keyof Header]: string} {
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

    writeFileSync('kanjidic.json', JSON.stringify({
      header: normalizeHeader(dic.header[0]),
      kanjidic2: Object.fromEntries(dic.character.map(c => [c.literal, normalizeCharacter(c)]))
    }));
  })();
}