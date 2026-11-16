/* 정답 비교용: 한글을 자모로 풀고(입헌 = ㅇㅣㅂㅎㅓㄴ) 띄어쓰기·문장부호·대소문자를 무시한 뒤 해시한다.
   브라우저(app.js)와 교사용 빌드 도구(build.js)가 함께 쓴다. */
(function (g) {
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('');
  var JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
  var JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

  function norm(s) {
    s = String(s == null ? '' : s).normalize('NFC').toLowerCase();
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xff10 && c <= 0xff19) c -= 0xfee0; // 전각 숫자
      if (c >= 0xac00 && c <= 0xd7a3) {
        var n = c - 0xac00;
        out += CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
      } else if ((c >= 48 && c <= 57) || (c >= 97 && c <= 122) || (c >= 0x3131 && c <= 0x3163)) {
        out += String.fromCharCode(c);
      }
    }
    return out;
  }

  function hash(s) {
    s = 'mailbag|' + norm(s);
    var h1 = 0xdeadbeef ^ 73, h2 = 0x41c6ce57 ^ 73;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  var api = { norm: norm, hash: hash };
  g.MBHash = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
