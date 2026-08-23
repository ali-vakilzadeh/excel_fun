// Comprehensive bilingual keyboard mappings
const KEYBOARD_MAPS = {
  'fa-en': {
    name: 'Persian / English',
    isRtl: true,
    enToOther: {
      '`': 'پ', '~': '÷', '1': '۱', '!': '!', '2': '۲', '@': '٬', '3': '۳', '#': '٫',
      '4': '۴', '$': '﷼', '5': '۵', '%': '٪', '6': '۶', '^': '×', '7': '۷', '&': '،',
      '8': '۸', '*': '*', '9': '۹', '(': ')', '0': '۰', ')': '(', '-': '-', '_': '_',
      '=': '=', '+': '+',
      'q': 'ض', 'Q': 'ْ', 'w': 'ص', 'W': 'ٌ', 'e': 'ث', 'E': 'ٍ', 'r': 'ق', 'R': 'ً',
      't': 'ف', 'T': 'ُ', 'y': 'غ', 'Y': 'ِ', 'u': 'ع', 'U': 'َ', 'i': 'ه', 'I': 'ّ',
      'o': 'خ', 'O': ']', 'p': 'ح', 'P': '[', '[': 'ج', '{': '}', ']': 'چ', '}': '{',
      '\\': 'پ', '|': '|',
      'a': 'ش', 'A': 'ؤ', 's': 'س', 'S': 'ئ', 'd': 'ی', 'D': 'ي', 'f': 'ب', 'F': 'إ',
      'g': 'ل', 'G': 'أ', 'h': 'ا', 'H': 'آ', 'j': 'ت', 'J': 'ة', 'k': 'ن', 'K': '»',
      'l': 'م', 'L': '«', ';': 'ک', ':': ':', "'": 'گ', '"': '"',
      'z': 'ظ', 'Z': 'ك', 'x': 'ط', 'X': 'ٓ', 'c': 'ز', 'C': 'ژ', 'v': 'ر', 'V': 'ٰ',
      'b': 'ذ', 'B': '\u200C', 'n': 'د', 'N': 'ٔ', 'm': 'پ', 'M': 'ء', ',': 'و', '<': '>',
      '.': '.', '>': '<', '/': '/', '?': '؟'
    }
  },
  'ar-en': {
    name: 'Arabic / English',
    isRtl: true,
    enToOther: {
      '`': 'ذ', '~': 'ّ', 'q': 'ض', 'Q': 'َ', 'w': 'ص', 'W': 'ً', 'e': 'ث', 'E': 'ُ',
      'r': 'ق', 'R': 'ٌ', 't': 'ف', 'y': 'غ', 'u': 'ع', 'i': 'ه', 'o': 'خ', 'p': 'ح',
      'a': 'ش', 's': 'س', 'd': 'ی', 'f': 'ب', 'g': 'ل', 'h': 'ا', 'j': 'ت', 'k': 'ن',
      'l': 'م', ';': 'ك', "'": 'ط', 'z': 'ئ', 'x': 'ء', 'c': 'ؤ', 'v': 'ر', 'b': 'لا',
      'n': 'ى', 'm': 'ة', ',': 'و', '.': 'ز', '/': 'ظ', '?': '؟'
    }
  },
  'ru-en': {
    name: 'Russian / English',
    isRtl: false,
    enToOther: {
      '`': 'ё', '~': 'Ё', 'q': 'й', 'Q': 'Й', 'w': 'ц', 'W': 'Ц', 'e': 'у', 'E': 'У',
      'r': 'к', 'R': 'К', 't': 'е', 'T': 'Е', 'y': 'н', 'Y': 'Н', 'u': 'г', 'U': 'Г',
      'i': 'ш', 'I': 'Ш', 'o': 'щ', 'O': 'Щ', 'p': 'з', 'P': 'З', '[': 'х', '{': 'Х',
      ']': 'ъ', '}': 'Ъ', 'a': 'ф', 'A': 'Ф', 's': 'ы', 'S': 'Ы', 'd': 'в', 'D': 'В',
      'f': 'а', 'F': 'А', 'g': 'п', 'G': 'П', 'h': 'р', 'H': 'Р', 'j': 'о', 'J': 'О',
      'k': 'л', 'K': 'Л', 'l': 'д', 'L': 'Д', ';': 'ж', ':': 'Ж', "'": 'э', '"': 'Э',
      'z': 'я', 'Z': 'Я', 'x': 'ч', 'X': 'Ч', 'c': 'с', 'C': 'С', 'v': 'м', 'V': 'М',
      'b': 'и', 'B': 'И', 'n': 'т', 'N': 'Т', 'm': 'ь', 'M': 'Ь', ',': 'б', '<': 'Б',
      '.': 'ю', '>': 'Ю', '/': '.', '?': ','
    }
  }
};

// Generate reverse mappings
for (const key in KEYBOARD_MAPS) {
  const item = KEYBOARD_MAPS[key];
  item.otherToEn = {};
  for (const [src, tgt] of Object.entries(item.enToOther)) {
    if (tgt && tgt.length === 1) {
      item.otherToEn[tgt] = src;
    }
  }
}

// Persian specific reverse overrides
if (KEYBOARD_MAPS['fa-en']) {
  const rev = KEYBOARD_MAPS['fa-en'].otherToEn;
  rev['ك'] = 'z';
  rev['ي'] = 'd';
  rev['ژ'] = 'C';
  rev['پ'] = 'm';
  rev['\u200C'] = 'B';
}

function convertBilingualString(text, langPair = 'fa-en') {
  const pair = KEYBOARD_MAPS[langPair] || KEYBOARD_MAPS['fa-en'];
  if (!text) return { result: '', direction: 'toOther' };

  let latinCount = 0;
  let nonLatinCount = 0;
  for (const char of text) {
    if (/[a-zA-Z]/.test(char)) latinCount++;
    else if (char.charCodeAt(0) > 127) nonLatinCount++;
  }

  const direction = nonLatinCount > latinCount ? 'toEn' : 'toOther';
  const map = direction === 'toOther' ? pair.enToOther : pair.otherToEn;

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    result += map[ch] !== undefined ? map[ch] : ch;
  }

  return { result, direction };
}
