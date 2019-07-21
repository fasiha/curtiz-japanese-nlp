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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiamRlcHAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJqZGVwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBQUEsK0NBQXlDO0FBQ3pDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxlQUFlLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDN0MsU0FBZ0IsV0FBVyxDQUFDLElBQVk7SUFDdEMsT0FBTyxJQUFJLE9BQU8sQ0FBQyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUNyQyxJQUFJLE9BQU8sR0FBRyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0IsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDMUIsT0FBTyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQywyREFBMkQ7UUFDdEYsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQztRQUNwQixJQUFJLEdBQUcsR0FBYSxFQUFFLENBQUM7UUFDdkIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdFLE9BQU8sQ0FBQyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsSUFBWSxFQUFFLEVBQUU7WUFDbkMsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFO2dCQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUFFO1lBQ2pDLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDeEIsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUM7QUFiRCxrQ0FhQztBQUNELFNBQWdCLFVBQVUsQ0FBQyxRQUFnQixFQUFFLE1BQWM7SUFDekQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNsRyxPQUFPLDBCQUFXLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFIRCxnQ0FHQztBQUVELFNBQXNCLFFBQVEsQ0FBVyxHQUFXLEVBQUUsU0FBcUI7O1FBQ3pFLElBQUksUUFBUSxHQUFHLE1BQU0sV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3RDLElBQUksVUFBVSxHQUFHLFVBQVUsQ0FBQyxFQUFFLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDMUMsSUFBSSxTQUFTLEdBQWlCLEVBQUUsQ0FBQztRQUNqQztZQUNFLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztZQUNkLEtBQUssSUFBSSxRQUFRLElBQUksVUFBVSxFQUFFO2dCQUMvQixtRkFBbUY7Z0JBQ25GLFNBQVMsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDcEUsS0FBSyxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO2FBQzlCO1NBQ0Y7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNuQixDQUFDO0NBQUE7QUFiRCw0QkFhQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7cGFydGl0aW9uQnl9IGZyb20gJ2N1cnRpei11dGlscyc7XG5jb25zdCBzcGF3biA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5zcGF3bjtcbmV4cG9ydCBmdW5jdGlvbiBpbnZva2VKZGVwcChsaW5lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGxldCBzcGF3bmVkID0gc3Bhd24oJ2pkZXBwJyk7XG4gICAgc3Bhd25lZC5zdGRpbi53cml0ZShsaW5lKTtcbiAgICBzcGF3bmVkLnN0ZGluLndyaXRlKCdcXG4nKTsgLy8gbmVjZXNzYXJ5LCBvdGhlcndpc2UgTWVDYWIgc2F5cyBgaW5wdXQtYnVmZmVyIG92ZXJmbG93LmBcbiAgICBzcGF3bmVkLnN0ZGluLmVuZCgpO1xuICAgIGxldCBhcnI6IHN0cmluZ1tdID0gW107XG4gICAgc3Bhd25lZC5zdGRvdXQub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiBhcnIucHVzaChkYXRhLnRvU3RyaW5nKCd1dGY4JykpKTtcbiAgICBzcGF3bmVkLm9uKCdjbG9zZScsIChjb2RlOiBudW1iZXIpID0+IHtcbiAgICAgIGlmIChjb2RlICE9PSAwKSB7IHJlamVjdChjb2RlKTsgfVxuICAgICAgcmVzb2x2ZShhcnIuam9pbignJykpO1xuICAgIH0pO1xuICB9KTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUpkZXBwKG9yaWdpbmFsOiBzdHJpbmcsIHJlc3VsdDogc3RyaW5nKSB7XG4gIGNvbnN0IHBpZWNlcyA9IHJlc3VsdC50cmltKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihzID0+ICEocy5zdGFydHNXaXRoKCcjJykgfHwgcy5zdGFydHNXaXRoKCdFT1MnKSkpO1xuICByZXR1cm4gcGFydGl0aW9uQnkocGllY2VzLCB2ID0+IHYuc3RhcnRzV2l0aCgnKicpKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFkZEpkZXBwPE1vcnBoZW1lPihyYXc6IHN0cmluZywgbW9ycGhlbWVzOiBNb3JwaGVtZVtdKTogUHJvbWlzZTxNb3JwaGVtZVtdW10+IHtcbiAgbGV0IGpkZXBwUmF3ID0gYXdhaXQgaW52b2tlSmRlcHAocmF3KTtcbiAgbGV0IGpkZXBwU3BsaXQgPSBwYXJzZUpkZXBwKCcnLCBqZGVwcFJhdyk7XG4gIGxldCBidW5zZXRzdXM6IE1vcnBoZW1lW11bXSA9IFtdO1xuICB7XG4gICAgbGV0IGFkZGVkID0gMDtcbiAgICBmb3IgKGxldCBidW5zZXRzdSBvZiBqZGVwcFNwbGl0KSB7XG4gICAgICAvLyAtMSBiZWNhdXNlIGVhY2ggYGJ1bnNldHN1YCBhcnJheSBoZXJlIHdpbGwgY29udGFpbiBhIGhlYWRlciBiZWZvcmUgdGhlIG1vcnBoZW1lc1xuICAgICAgYnVuc2V0c3VzLnB1c2gobW9ycGhlbWVzLnNsaWNlKGFkZGVkLCBhZGRlZCArIGJ1bnNldHN1Lmxlbmd0aCAtIDEpKTtcbiAgICAgIGFkZGVkICs9IGJ1bnNldHN1Lmxlbmd0aCAtIDE7XG4gICAgfVxuICB9XG4gIHJldHVybiBidW5zZXRzdXM7XG59XG4iXX0=