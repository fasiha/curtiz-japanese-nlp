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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiamRlcHAuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJqZGVwcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7OztBQUFBLCtDQUF5QztBQUN6QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQzdDLFNBQWdCLFdBQVcsQ0FBQyxJQUFZO0lBQ3RDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDckMsSUFBSSxPQUFPLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQzdCLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzFCLE9BQU8sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsMkRBQTJEO1FBQ3RGLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEIsSUFBSSxHQUFHLEdBQWEsRUFBRSxDQUFDO1FBQ3ZCLE9BQU8sQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQVksRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM3RSxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLElBQVksRUFBRSxFQUFFO1lBQ25DLElBQUksSUFBSSxLQUFLLENBQUMsRUFBRTtnQkFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7YUFBRTtZQUNqQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3hCLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDO0FBYkQsa0NBYUM7QUFDRCxTQUFnQixVQUFVLENBQUMsUUFBZ0IsRUFBRSxNQUFjO0lBQ3pELE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDbEcsT0FBTywwQkFBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNyRCxDQUFDO0FBSEQsZ0NBR0M7QUFFRCxTQUFzQixRQUFRLENBQVcsR0FBVyxFQUFFLFNBQXFCOztRQUN6RSxJQUFJLFFBQVEsR0FBRyxNQUFNLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUN0QyxJQUFJLFVBQVUsR0FBRyxVQUFVLENBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzFDLElBQUksU0FBUyxHQUFpQixFQUFFLENBQUM7UUFDakM7WUFDRSxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7WUFDZCxLQUFLLElBQUksUUFBUSxJQUFJLFVBQVUsRUFBRTtnQkFDL0IsbUZBQW1GO2dCQUNuRixTQUFTLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssR0FBRyxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3BFLEtBQUssSUFBSSxRQUFRLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQzthQUM5QjtTQUNGO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbkIsQ0FBQztDQUFBO0FBYkQsNEJBYUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge3BhcnRpdGlvbkJ5fSBmcm9tICdjdXJ0aXotdXRpbHMnO1xuY29uc3Qgc3Bhd24gPSByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuc3Bhd247XG5leHBvcnQgZnVuY3Rpb24gaW52b2tlSmRlcHAobGluZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBsZXQgc3Bhd25lZCA9IHNwYXduKCdqZGVwcCcpO1xuICAgIHNwYXduZWQuc3RkaW4ud3JpdGUobGluZSk7XG4gICAgc3Bhd25lZC5zdGRpbi53cml0ZSgnXFxuJyk7IC8vIG5lY2Vzc2FyeSwgb3RoZXJ3aXNlIE1lQ2FiIHNheXMgYGlucHV0LWJ1ZmZlciBvdmVyZmxvdy5gXG4gICAgc3Bhd25lZC5zdGRpbi5lbmQoKTtcbiAgICBsZXQgYXJyOiBzdHJpbmdbXSA9IFtdO1xuICAgIHNwYXduZWQuc3Rkb3V0Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4gYXJyLnB1c2goZGF0YS50b1N0cmluZygndXRmOCcpKSk7XG4gICAgc3Bhd25lZC5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyKSA9PiB7XG4gICAgICBpZiAoY29kZSAhPT0gMCkgeyByZWplY3QoY29kZSk7IH1cbiAgICAgIHJlc29sdmUoYXJyLmpvaW4oJycpKTtcbiAgICB9KTtcbiAgfSk7XG59XG5leHBvcnQgZnVuY3Rpb24gcGFyc2VKZGVwcChvcmlnaW5hbDogc3RyaW5nLCByZXN1bHQ6IHN0cmluZykge1xuICBjb25zdCBwaWVjZXMgPSByZXN1bHQudHJpbSgpLnNwbGl0KCdcXG4nKS5maWx0ZXIocyA9PiAhKHMuc3RhcnRzV2l0aCgnIycpIHx8IHMuc3RhcnRzV2l0aCgnRU9TJykpKTtcbiAgcmV0dXJuIHBhcnRpdGlvbkJ5KHBpZWNlcywgdiA9PiB2LnN0YXJ0c1dpdGgoJyonKSk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhZGRKZGVwcDxNb3JwaGVtZT4ocmF3OiBzdHJpbmcsIG1vcnBoZW1lczogTW9ycGhlbWVbXSk6IFByb21pc2U8TW9ycGhlbWVbXVtdPiB7XG4gIGxldCBqZGVwcFJhdyA9IGF3YWl0IGludm9rZUpkZXBwKHJhdyk7XG4gIGxldCBqZGVwcFNwbGl0ID0gcGFyc2VKZGVwcCgnJywgamRlcHBSYXcpO1xuICBsZXQgYnVuc2V0c3VzOiBNb3JwaGVtZVtdW10gPSBbXTtcbiAge1xuICAgIGxldCBhZGRlZCA9IDA7XG4gICAgZm9yIChsZXQgYnVuc2V0c3Ugb2YgamRlcHBTcGxpdCkge1xuICAgICAgLy8gLTEgYmVjYXVzZSBlYWNoIGBidW5zZXRzdWAgYXJyYXkgaGVyZSB3aWxsIGNvbnRhaW4gYSBoZWFkZXIgYmVmb3JlIHRoZSBtb3JwaGVtZXNcbiAgICAgIGJ1bnNldHN1cy5wdXNoKG1vcnBoZW1lcy5zbGljZShhZGRlZCwgYWRkZWQgKyBidW5zZXRzdS5sZW5ndGggLSAxKSk7XG4gICAgICBhZGRlZCArPSBidW5zZXRzdS5sZW5ndGggLSAxO1xuICAgIH1cbiAgfVxuICByZXR1cm4gYnVuc2V0c3VzO1xufVxuIl19