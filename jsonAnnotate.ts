import {analyzeSentence} from './annotate';
(async function main() {
  const obj = await analyzeSentence('できるできないよりやるやらない', new Map());
  console.log(JSON.stringify(obj, null, 1));
})()