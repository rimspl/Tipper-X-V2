const POSITION_MASTER = [
  {
    code: 'FL',
    name: 'Front Left',
    aliases: ['FL', 'F L', 'FRONT LEFT', 'LEFT FRONT', 'SAMNE LEFT', 'AAGE LEFT', 'FRONT L']
  },
  {
    code: 'FR',
    name: 'Front Right',
    aliases: ['FR', 'F R', 'FRONT RIGHT', 'RIGHT FRONT', 'SAMNE RIGHT', 'AAGE RIGHT', 'FRONT R']
  },
  {
    code: 'FL2',
    name: 'Front Left 2',
    aliases: ['FL2', 'FRONT LEFT 2', 'SECOND FRONT LEFT', 'FRONT LEFT TWO', 'LEFT FRONT TWO']
  },
  {
    code: 'FR2',
    name: 'Front Right 2',
    aliases: ['FR2', 'FRONT RIGHT 2', 'SECOND FRONT RIGHT', 'FRONT RIGHT TWO', 'RIGHT FRONT TWO']
  },
  {
    code: 'AX3LO',
    name: 'Axle 3 Left Outer',
    aliases: ['AX3LO', 'AXLE 3 LEFT OUTER', 'AXLE THREE LEFT OUTER', '3 LEFT OUTER', 'LEFT OUTER 3']
  },
  {
    code: 'AX3LI',
    name: 'Axle 3 Left Inner',
    aliases: ['AX3LI', 'AXLE 3 LEFT INNER', 'AXLE THREE LEFT INNER', '3 LEFT INNER', 'LEFT INNER 3']
  },
  {
    code: 'AX3RO',
    name: 'Axle 3 Right Outer',
    aliases: ['AX3RO', 'AXLE 3 RIGHT OUTER', 'AXLE THREE RIGHT OUTER', '3 RIGHT OUTER', 'RIGHT OUTER 3']
  },
  {
    code: 'AX3RI',
    name: 'Axle 3 Right Inner',
    aliases: ['AX3RI', 'AXLE 3 RIGHT INNER', 'AXLE THREE RIGHT INNER', '3 RIGHT INNER', 'RIGHT INNER 3']
  },
  {
    code: 'AX4LO',
    name: 'Axle 4 Left Outer',
    aliases: ['AX4LO', 'AXLE 4 LEFT OUTER', 'AXLE FOUR LEFT OUTER', '4 LEFT OUTER', 'LEFT OUTER 4']
  },
  {
    code: 'AX4LI',
    name: 'Axle 4 Left Inner',
    aliases: ['AX4LI', 'AXLE 4 LEFT INNER', 'AXLE FOUR LEFT INNER', '4 LEFT INNER', 'LEFT INNER 4']
  },
  {
    code: 'AX4RO',
    name: 'Axle 4 Right Outer',
    aliases: ['AX4RO', 'AXLE 4 RIGHT OUTER', 'AXLE FOUR RIGHT OUTER', '4 RIGHT OUTER', 'RIGHT OUTER 4']
  },
  {
    code: 'AX4RI',
    name: 'Axle 4 Right Inner',
    aliases: ['AX4RI', 'AXLE 4 RIGHT INNER', 'AXLE FOUR RIGHT INNER', '4 RIGHT INNER', 'RIGHT INNER 4']
  }
];

const RAW_TYRE_SIZES = [
  '12.00-24',
  '12X24',
  '295/95R20',
  '12R22.5',
  '295/80R22.5',
  '10R20',
  '27.00R49',
  '33.00R51',
  '24.00R35',
  '18.00R33',
  '21.00R35',
  '14.00R24',
  '14.00R25',
  '17.5R25',
  '20.5R25',
  '23.5R25'
];

const MAKE_MASTER = [
  { code: 'Michelin', aliases: ['MI', 'MICHELIN', 'MICHEL', 'MICHELLIN', 'MISHELIN', 'MISHLEN', 'MICHLEN', 'MICHLIN', 'MUSLIM', 'MUSLEEN'] },
  { code: 'Bridgestone', aliases: ['BS', 'BRIDGESTONE', 'BRIDGE STONE', 'BRIDGSTON', 'BRIDSTONE', 'BRIJ STONE'] },
  { code: 'BKT', aliases: ['BKT', 'BALKRISHNA', 'BK', 'BEEKAYTI'] },
  { code: 'CEAT', aliases: ['CEAT', 'SEET', 'SEAT', 'CEET'] },
  { code: 'Apollo', aliases: ['APOLLO', 'APOLO', 'APPOLLO'] },
  { code: 'MRF', aliases: ['MRF', 'EMAAREF', 'EM AR EF'] },
  { code: 'JK Tyre', aliases: ['JK', 'JKTYRE', 'JK TYRE', 'JAYKEY'] },
  { code: 'Yokohama', aliases: ['YOKOHAMA', 'YOKO', 'YOKOHMA'] },
  { code: 'Continental', aliases: ['CONTINENTAL', 'CONTI'] },
  { code: 'Goodyear', aliases: ['GOODYEAR', 'GOOD YEAR', 'GY'] },
  { code: 'Maxam', aliases: ['MAXAM', 'MAXXAM', 'MAKSAM'] }
];

const MODEL_MASTER = [
  { code: 'XDR3-B', aliases: ['XDR3-B', 'XDR3B', 'XDR 3 B', 'X D R 3 B', 'X D R THREE B', 'XDR THREE B'] },
  { code: 'V-STEEL R-LUG S', aliases: ['V-STEEL R-LUG S', 'VSTEELRLUGS', 'V STEEL R LUG S', 'V STEEL R-LUG S', 'V STEEL R LUX S', 'V STEEL R LOG S'] },
  { code: 'VREP', aliases: ['VREP', 'V REP', 'V-REP', 'VEE REP'] },
  { code: 'MS 403', aliases: ['MS 403', 'MS403', 'M S 403', 'M S FOUR ZERO THREE', 'M S FOUR HUNDRED THREE'] }
];

export const POSITION_CODES = POSITION_MASTER.map((item) => item.code);
export const TYRE_SIZE_MASTER = RAW_TYRE_SIZES.slice();
export const MAKE_CODES = MAKE_MASTER.map((item) => item.code);
export const MODEL_CODES = MODEL_MASTER.map((item) => item.code);

const POSITION_ALIAS_INDEX = POSITION_MASTER.flatMap((item) => {
  const baseAliases = [item.code, item.name, ...(item.aliases || [])];
  return baseAliases
    .map((alias) => compactKey(alias))
    .filter(Boolean)
    .map((aliasKey) => ({ code: item.code, aliasKey }));
});

const SIZE_CANONICAL_LOOKUP = new Map(
  TYRE_SIZE_MASTER.map((value) => [compactSizeKey(value), value])
);

const MODEL_ALIAS_INDEX = MODEL_MASTER.flatMap((item) => {
  const baseAliases = [item.code, ...(item.aliases || [])];
  return baseAliases
    .map((alias) => compactKey(alias))
    .filter(Boolean)
    .map((aliasKey) => ({ code: item.code, aliasKey }));
});

const SPOKEN_SIZE_PHRASES = [
  [/\bTWO\s+NINE\s+FIVE\b/g, '295'],
  [/\bDO\s+NAU\s+PANCH\b/g, '295'],
  [/\bNINE\s+FIVE\b/g, '95'],
  [/\bNINETY\s+FIVE\b/g, '95'],
  [/\bEIGHTY\b/g, '80'],
  [/\bASSI\b/g, '80'],
  [/\bASI\b/g, '80'],
  [/\bTWENTY\s+SEVEN\b/g, '27'],
  [/\bSATAIS\b/g, '27'],
  [/\bSATTAIS\b/g, '27'],
  [/\bFORTY\s+NINE\b/g, '49'],
  [/\bUNCHAAS\b/g, '49'],
  [/\bFIFTY\s+ONE\b/g, '51'],
  [/\bIKYAAVAN\b/g, '51'],
  [/\bTHIRTY\s+THREE\b/g, '33'],
  [/\bTAINTIS\b/g, '33'],
  [/\bTHIRTY\s+FIVE\b/g, '35'],
  [/\bPAINTIS\b/g, '35'],
  [/\bTWENTY\s+TWO\b/g, '22'],
  [/\bBAIS\b/g, '22'],
  [/\bBAYIS\b/g, '22'],
  [/\bTWENTY\s+FIVE\b/g, '25'],
  [/\bPACHIS\b/g, '25'],
  [/\bTWENTY\s+FOUR\b/g, '24'],
  [/\bCHAUBIS\b/g, '24'],
  [/\bCHOBIS\b/g, '24'],
  [/\bTWENTY\s+ONE\b/g, '21'],
  [/\bIKKIS\b/g, '21'],
  [/\bTWENTY\b/g, '20'],
  [/\bBEES\b/g, '20'],
  [/\bEIGHTEEN\b/g, '18'],
  [/\bATHAARAH\b/g, '18'],
  [/\bSEVENTEEN\b/g, '17'],
  [/\bSATRAH\b/g, '17'],
  [/\bFOURTEEN\b/g, '14'],
  [/\bCHAUDAH\b/g, '14'],
  [/\bTWELVE\b/g, '12'],
  [/\bBARAH\b/g, '12'],
  [/\bTEN\b/g, '10'],
  [/\bDAS\b/g, '10']
];

const SPOKEN_TOKEN_MAP = {
  ZERO: '0',
  ONE: '1',
  TWO: '2',
  THREE: '3',
  FOUR: '4',
  FIVE: '5',
  SIX: '6',
  SEVEN: '7',
  EIGHT: '8',
  NINE: '9',
  TEN: '10',
  ELEVEN: '11',
  TWELVE: '12',
  EK: '1',
  DO: '2',
  TEEN: '3',
  CHAR: '4',
  CHAAR: '4',
  PANCH: '5',
  PAANCH: '5',
  CHHE: '6',
  CHE: '6',
  SAAT: '7',
  AATH: '8',
  NAU: '9',
  DASH: '10',
  DAS: '10',
  R: 'R',
  RADIAL: 'R',
  SLASH: '/',
  BY: 'X',
  INTO: 'X',
  CROSS: 'X',
  X: 'X',
  POINT: '.',
  DOT: '.',
  DECIMAL: '.'
};

const ENGLISH_NUMBER_UNITS = {
  ZERO: 0,
  OH: 0,
  O: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
  ELEVEN: 11,
  TWELVE: 12,
  THIRTEEN: 13,
  FOURTEEN: 14,
  FIFTEEN: 15,
  SIXTEEN: 16,
  SEVENTEEN: 17,
  EIGHTEEN: 18,
  NINETEEN: 19
};

const ENGLISH_NUMBER_TENS = {
  TWENTY: 20,
  THIRTY: 30,
  FORTY: 40,
  FIFTY: 50,
  SIXTY: 60,
  SEVENTY: 70,
  EIGHTY: 80,
  NINETY: 90
};

const HINDI_NUMBER_VARIANTS = [
  [0, ['SHUNYA', 'SIFAR', 'ZERO']],
  [1, ['EK', 'IK']],
  [2, ['DO']],
  [3, ['TEEN', 'TIN']],
  [4, ['CHAR', 'CHAAR']],
  [5, ['PANCH', 'PAANCH']],
  [6, ['CHHE', 'CHE', 'CHHEY']],
  [7, ['SAAT']],
  [8, ['AATH']],
  [9, ['NAU', 'NOU']],
  [10, ['DAS', 'DASH']],
  [11, ['GYARAH', 'GYARA']],
  [12, ['BARAH', 'BARA']],
  [13, ['TERAH', 'TERA']],
  [14, ['CHAUDAH', 'CHAUDA']],
  [15, ['PANDRAH', 'PANDRA']],
  [16, ['SOLAH', 'SOLA']],
  [17, ['SATRAH', 'SATRA']],
  [18, ['ATHARAH', 'ATHARA', 'ATHAARAH']],
  [19, ['UNNIS', 'UNNISH']],
  [20, ['BEES']],
  [21, ['IKKIS', 'IKKEES']],
  [22, ['BAIS', 'BAYIS']],
  [23, ['TEIS', 'TEYIS']],
  [24, ['CHAUBIS', 'CHOBIS']],
  [25, ['PACHIS', 'PACHEES']],
  [26, ['CHHABBIS', 'CHABBIS']],
  [27, ['SATTAIS', 'SATAIS']],
  [28, ['ATTHAIS', 'ATHAIS']],
  [29, ['UNATIS', 'UNTIS']],
  [30, ['TEES']],
  [31, ['IKATTIS', 'IKATIS']],
  [32, ['BATTIS', 'BATIS']],
  [33, ['TAINTIS', 'TETIS']],
  [34, ['CHAUNTIS', 'CHAUTIS']],
  [35, ['PAINTIS', 'PENTIS']],
  [36, ['CHHATTIS', 'CHATTIS']],
  [37, ['SAINTIS', 'SENTIS']],
  [38, ['ADTIS', 'ARTIS']],
  [39, ['UNTALIS', 'UNTALEES']],
  [40, ['CHALIS', 'CHALEES']],
  [41, ['IKTALIS', 'IKTALEES']],
  [42, ['BAYALIS', 'BAYALEES']],
  [43, ['TAINTALIS', 'TETALEES']],
  [44, ['CHAINTALIS', 'CHAUNTALEES']],
  [45, ['PAINTALIS', 'PENTALEES']],
  [46, ['CHHIYALIS', 'CHIYALEES']],
  [47, ['SENTALIS', 'SANTALEES']],
  [48, ['ADTALIS', 'ARTALEES']],
  [49, ['UNCHAAS', 'UNCHAS']],
  [50, ['PACHAAS', 'PACHAS']],
  [51, ['IKYAAVAN', 'IKYAVAN']],
  [52, ['BAAVAN', 'BAVAN']],
  [53, ['TIRPAN', 'TEERPAN']],
  [54, ['CHAUVAN', 'CHAWAN']],
  [55, ['PACHPAN', 'PACHPAN']],
  [56, ['CHHAPPAN', 'CHAPPAN']],
  [57, ['SATTAAVAN', 'SATTAVAN']],
  [58, ['ATTHAAVAN', 'ATHAVAN']],
  [59, ['UNSATH', 'UNSAATH']],
  [60, ['SAATH', 'SATH']],
  [61, ['IKSATH', 'IKSAATH']],
  [62, ['BAASATH', 'BASAATH']],
  [63, ['TIRSATH', 'TIRSAATH']],
  [64, ['CHAUNSATH', 'CHAUNSAATH']],
  [65, ['PANSATH', 'PANSAATH']],
  [66, ['CHHIYASATH', 'CHIYASAATH']],
  [67, ['SADSATH', 'SADSAATH']],
  [68, ['ADSATH', 'ADSAATH']],
  [69, ['UNHATTAR', 'UNHATAR']],
  [70, ['SATTAR']],
  [71, ['IKHATTAR', 'IKHATAR']],
  [72, ['BAHATTAR', 'BAHATAR']],
  [73, ['TIHATTAR', 'TIHATAR']],
  [74, ['CHAUHATTAR', 'CHAUHATAR']],
  [75, ['PACHHATTAR', 'PACHHATAR']],
  [76, ['CHHIHATTAR', 'CHHIHATAR']],
  [77, ['SATTAHATTAR', 'SATTAHATAR']],
  [78, ['ATHAHATTAR', 'ATHAHATAR']],
  [79, ['UNYASI', 'UNYAASI']],
  [80, ['ASSI', 'ASI']],
  [81, ['IKYASI', 'IKYAASI']],
  [82, ['BAYAASI', 'BAYASI']],
  [83, ['TIRASI', 'TIRAASI']],
  [84, ['CHAURASI', 'CHORAASI']],
  [85, ['PACHAASI', 'PACHASI']],
  [86, ['CHHIYASI', 'CHIYAASI']],
  [87, ['SATTAASI', 'SATTASI']],
  [88, ['ATTHASI', 'ATHASI']],
  [89, ['NAVASI', 'NAVAASI']],
  [90, ['NABBE']],
  [91, ['IKYANVE', 'IKYANWE']],
  [92, ['BAANVE', 'BAANWE']],
  [93, ['TIRANVE', 'TIRANWE']],
  [94, ['CHAURANVE', 'CHAURANWE']],
  [95, ['PACHANVE', 'PACHANWE']],
  [96, ['CHHIYANVE', 'CHIYANWE']],
  [97, ['SATTANVE', 'SATTANWE']],
  [98, ['ATTHANVE', 'ATHANWE']],
  [99, ['NINYANVE', 'NINYANWE']]
];

const HINDI_NUMBER_LOOKUP = buildHindiNumberLookup(HINDI_NUMBER_VARIANTS);
const SCALE_WORD_VALUES = {
  HUNDRED: 100,
  SAU: 100,
  THOUSAND: 1000,
  HAZAR: 1000,
  HAZAAR: 1000,
  LAKH: 100000,
  LAKHS: 100000,
  LAC: 100000,
  LACS: 100000
};

const DECIMAL_WORDS = new Set(['POINT', 'DOT', 'DECIMAL']);
const JOINER_WORDS = new Set(['AND']);

function toUpperText(value) {
  return String(value || '').trim().toUpperCase();
}

function compactKey(value) {
  return toUpperText(value).replace(/[^A-Z0-9]/g, '');
}

function compactSizeKey(value) {
  return toUpperText(value)
    .replace(/\u00D7/g, 'X')
    .replace(/[^A-Z0-9.]/g, '');
}

function normalizeIndicDigits(value) {
  return String(value || '')
    .replace(/[०-९]/g, (digit) => String('०१२३४५६७८९'.indexOf(digit)));
}

function buildHindiNumberLookup(entries) {
  const lookup = new Map();
  for (const [value, aliases] of entries) {
    for (const alias of aliases) {
      const key = toUpperText(alias).replace(/[^A-Z0-9]/g, '');
      if (key) {
        lookup.set(key, value);
      }
    }
  }
  return lookup;
}

function normalizeSpeechToken(token) {
  return normalizeIndicDigits(token)
    .toUpperCase()
    .replace(/[^A-Z0-9.]/g, '')
    .trim();
}

function resolveDigitWordToken(token) {
  const normalized = normalizeSpeechToken(token);
  if (!normalized) return null;
  if (/^\d$/.test(normalized)) return normalized;
  if (Object.prototype.hasOwnProperty.call(ENGLISH_NUMBER_UNITS, normalized) && ENGLISH_NUMBER_UNITS[normalized] >= 0 && ENGLISH_NUMBER_UNITS[normalized] <= 9) {
    return String(ENGLISH_NUMBER_UNITS[normalized]);
  }
  const hindiValue = HINDI_NUMBER_LOOKUP.get(normalized);
  if (Number.isFinite(hindiValue) && hindiValue >= 0 && hindiValue <= 9) {
    return String(hindiValue);
  }
  return null;
}

function resolveNumberWordValue(token) {
  const normalized = normalizeSpeechToken(token);
  if (!normalized) return null;
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Object.prototype.hasOwnProperty.call(ENGLISH_NUMBER_UNITS, normalized)) {
    return ENGLISH_NUMBER_UNITS[normalized];
  }
  if (Object.prototype.hasOwnProperty.call(ENGLISH_NUMBER_TENS, normalized)) {
    return ENGLISH_NUMBER_TENS[normalized];
  }
  if (HINDI_NUMBER_LOOKUP.has(normalized)) {
    return HINDI_NUMBER_LOOKUP.get(normalized);
  }
  return null;
}

function isNumberSequenceToken(token) {
  const normalized = normalizeSpeechToken(token);
  if (!normalized) return false;
  return Number.isFinite(resolveNumberWordValue(normalized))
    || Object.prototype.hasOwnProperty.call(SCALE_WORD_VALUES, normalized)
    || DECIMAL_WORDS.has(normalized)
    || JOINER_WORDS.has(normalized);
}

function parseIntegerNumberTokens(tokens = []) {
  const digitSequence = [];
  let onlyDigitTokens = tokens.length > 0;

  for (const rawToken of tokens) {
    const token = normalizeSpeechToken(rawToken);
    if (!token || JOINER_WORDS.has(token)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(SCALE_WORD_VALUES, token)) {
      onlyDigitTokens = false;
      break;
    }

    const digitToken = resolveDigitWordToken(token);
    if (!digitToken) {
      onlyDigitTokens = false;
      break;
    }

    digitSequence.push(digitToken);
  }

  if (onlyDigitTokens && digitSequence.length >= 2) {
    const joined = Number(digitSequence.join(''));
    if (Number.isFinite(joined)) {
      return joined;
    }
  }

  let total = 0;
  let current = 0;
  let consumed = false;

  for (const rawToken of tokens) {
    const token = normalizeSpeechToken(rawToken);
    if (!token || JOINER_WORDS.has(token)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(SCALE_WORD_VALUES, token)) {
      const scale = SCALE_WORD_VALUES[token];
      if (scale === 100) {
        current = (current || 1) * scale;
      } else {
        total += (current || 1) * scale;
        current = 0;
      }
      consumed = true;
      continue;
    }

    const value = resolveNumberWordValue(token);
    if (!Number.isFinite(value)) {
      continue;
    }

    current += value;
    consumed = true;
  }

  if (!consumed) {
    return null;
  }

  return total + current;
}

function parseNumberTokenSequence(tokens = []) {
  const normalizedTokens = tokens
    .map((token) => normalizeSpeechToken(token))
    .filter(Boolean);

  if (normalizedTokens.length === 0) {
    return null;
  }

  const decimalIndex = normalizedTokens.findIndex((token) => DECIMAL_WORDS.has(token) || token === '.');
  if (decimalIndex >= 0) {
    const whole = parseIntegerNumberTokens(normalizedTokens.slice(0, decimalIndex));
    const decimalDigits = normalizedTokens
      .slice(decimalIndex + 1)
      .map((token) => resolveDigitWordToken(token))
      .filter(Boolean)
      .join('');

    if (!Number.isFinite(whole) || !decimalDigits) {
      return whole;
    }

    const parsed = Number(`${whole}.${decimalDigits}`);
    return Number.isFinite(parsed) ? parsed : whole;
  }

  return parseIntegerNumberTokens(normalizedTokens);
}

function dedupeNumericCandidates(values = []) {
  const seen = new Set();
  const results = [];
  for (const value of values) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    const key = numeric.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(numeric);
  }
  return results;
}

function resolveAlphaNumericDigitSegment(token) {
  const normalized = normalizeSpeechToken(token);
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    return normalized;
  }
  return resolveDigitWordToken(normalized);
}

function scoreModel(rawText, modelCode) {
  const compactInput = compactKey(normalizeSpokenAlphaNumeric(rawText) || rawText);
  if (!compactInput) return 0;

  const aliases = MODEL_ALIAS_INDEX.filter((item) => item.code === modelCode);
  let best = 0;
  for (const alias of aliases) {
    if (!alias.aliasKey) continue;
    if (compactInput === alias.aliasKey) {
      return 1;
    }
    if (compactInput.includes(alias.aliasKey) || alias.aliasKey.includes(compactInput)) {
      best = Math.max(best, 0.9);
      continue;
    }
    best = Math.max(best, similarityScore(compactInput, alias.aliasKey));
  }
  return best;
}

function normalizePositionSpeech(value) {
  let text = toUpperText(value)
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return '';
  }

  const replacements = [
    [/\bSAMNE\b/g, 'FRONT'],
    [/\bAAGE\b/g, 'FRONT'],
    [/\bBAAYE\b/g, 'LEFT'],
    [/\bBAYE\b/g, 'LEFT'],
    [/\bLEFT\b/g, 'LEFT'],
    [/\bDAAYE\b/g, 'RIGHT'],
    [/\bDAYE\b/g, 'RIGHT'],
    [/\bRIGHT\b/g, 'RIGHT'],
    [/\bBAHAR\b/g, 'OUTER'],
    [/\bOUTAR\b/g, 'OUTER'],
    [/\bOUTSIDE\b/g, 'OUTER'],
    [/\bANDAR\b/g, 'INNER'],
    [/\bINDER\b/g, 'INNER'],
    [/\bAKSAL\b/g, 'AXLE'],
    [/\bAXAL\b/g, 'AXLE'],
    [/\bAXEL\b/g, 'AXLE'],
    [/\bTHREE\b/g, '3'],
    [/\bTEEN\b/g, '3'],
    [/\bFOUR\b/g, '4'],
    [/\bCHAR\b/g, '4'],
    [/\bCHAAR\b/g, '4'],
    [/\bTWO\b/g, '2'],
    [/\bDO\b/g, '2']
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text.replace(/\s+/g, ' ').trim();
}

function normalizeSizeSpeech(value) {
  let text = toUpperText(value)
    .replace(/\u00D7/g, 'X')
    .replace(/[,:;()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return '';
  }

  for (const [pattern, replacement] of SPOKEN_SIZE_PHRASES) {
    text = text.replace(pattern, replacement);
  }

  const tokens = text
    .split(' ')
    .map((token) => SPOKEN_TOKEN_MAP[token] || token)
    .filter(Boolean);

  return tokens.join(' ').replace(/\s+/g, ' ').trim();
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left) return right.length;
  if (!right) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function similarityScore(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 ? (1 - distance / maxLen) : 0;
}

function normalizePositionFromText(rawText) {
  const normalized = normalizePositionSpeech(rawText);
  const compact = compactKey(normalized);
  if (!compact) return null;

  const directCodeMatch = compact.match(/\b(FL2?|FR2?|AX[34](?:L|R)(?:O|I))\b/);
  if (directCodeMatch && POSITION_CODES.includes(directCodeMatch[1])) {
    return directCodeMatch[1];
  }

  if (normalized.includes('FRONT LEFT 2') || normalized.includes('SECOND FRONT LEFT')) return 'FL2';
  if (normalized.includes('FRONT RIGHT 2') || normalized.includes('SECOND FRONT RIGHT')) return 'FR2';
  if (normalized.includes('FRONT LEFT')) return 'FL';
  if (normalized.includes('FRONT RIGHT')) return 'FR';

  const axleMatch = normalized.match(/AXLE\s*([34])\s*(LEFT|RIGHT)\s*(OUTER|INNER)/);
  if (axleMatch) {
    const axle = axleMatch[1];
    const side = axleMatch[2] === 'LEFT' ? 'L' : 'R';
    const ring = axleMatch[3] === 'OUTER' ? 'O' : 'I';
    const code = `AX${axle}${side}${ring}`;
    if (POSITION_CODES.includes(code)) {
      return code;
    }
  }

  return null;
}

function normalizeTyreSizeFromText(rawText) {
  const text = toUpperText(rawText)
    .replace(/\u00D7/g, 'X')
    .replace(/\s+/g, '')
    .trim();

  if (!text) {
    return null;
  }

  const direct = SIZE_CANONICAL_LOOKUP.get(compactSizeKey(text));
  if (direct) {
    return direct;
  }

  const numericGroups = text.match(/\d+(?:\.\d+)?/g) || [];
  const hasR = text.includes('R');

  if (numericGroups.length >= 3) {
    const candidate = `${numericGroups[0]}/${numericGroups[1]}R${numericGroups[2]}`;
    const normalizedCandidate = SIZE_CANONICAL_LOOKUP.get(compactSizeKey(candidate));
    if (normalizedCandidate) {
      return normalizedCandidate;
    }
  }

  if (numericGroups.length >= 2) {
    const candidate = hasR
      ? `${numericGroups[0]}R${numericGroups[1]}`
      : `${numericGroups[0]}X${numericGroups[1]}`;
    const normalizedCandidate = SIZE_CANONICAL_LOOKUP.get(compactSizeKey(candidate));
    if (normalizedCandidate) {
      return normalizedCandidate;
    }
  }

  // Fallback: accept ANY well-formed size pattern (e.g. 12.00-24, 14.00R25,
  // 295/80R22.5) even when not present in the master list, so a captured size
  // is never silently dropped to null/Unknown.
  if (numericGroups.length >= 3) {
    return `${numericGroups[0]}/${numericGroups[1]}R${numericGroups[2]}`;
  }
  if (numericGroups.length >= 2) {
    return hasR
      ? `${numericGroups[0]}R${numericGroups[1]}`
      : `${numericGroups[0]}X${numericGroups[1]}`;
  }

  return null;
}

function scorePosition(rawText, code) {
  const normalized = normalizePositionSpeech(rawText);
  const inputKey = compactKey(normalized);
  if (!inputKey) return 0;

  const aliases = POSITION_ALIAS_INDEX.filter((item) => item.code === code);
  let best = 0;
  for (const alias of aliases) {
    if (!alias.aliasKey) continue;
    if (inputKey === alias.aliasKey) {
      return 1;
    }
    if (inputKey.includes(alias.aliasKey) || alias.aliasKey.includes(inputKey)) {
      best = Math.max(best, 0.9);
      continue;
    }
    best = Math.max(best, similarityScore(inputKey, alias.aliasKey));
  }
  return best;
}

function scoreTyreSize(rawText, sizeValue) {
  const normalized = normalizeSizeSpeech(rawText);
  const inputKey = compactSizeKey(normalized);
  const sizeKey = compactSizeKey(sizeValue);
  if (!inputKey || !sizeKey) return 0;
  if (inputKey === sizeKey) return 1;

  if (inputKey.includes(sizeKey) || sizeKey.includes(inputKey)) {
    return 0.9;
  }

  return similarityScore(inputKey, sizeKey);
}

export function suggestPositionCodes(rawValue, limit = 3) {
  const scores = POSITION_CODES
    .map((code) => ({ value: code, score: scorePosition(rawValue, code) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scores.slice(0, Math.max(1, Number(limit) || 3));
}

export function normalizePositionCode(rawValue) {
  const direct = normalizePositionFromText(rawValue);
  if (direct) {
    return direct;
  }

  const best = suggestPositionCodes(rawValue, 1)[0];
  if (best && best.score >= 0.62) {
    return best.value;
  }

  return null;
}

export function suggestTyreSizes(rawValue, limit = 3) {
  const scores = TYRE_SIZE_MASTER
    .map((sizeValue) => ({ value: sizeValue, score: scoreTyreSize(rawValue, sizeValue) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scores.slice(0, Math.max(1, Number(limit) || 3));
}

export function normalizeTyreSize(rawValue) {
  const direct = normalizeTyreSizeFromText(rawValue);
  if (direct) {
    return direct;
  }

  const spoken = normalizeSizeSpeech(rawValue);
  const spokenDirect = normalizeTyreSizeFromText(spoken);
  if (spokenDirect) {
    return spokenDirect;
  }

  const best = suggestTyreSizes(rawValue, 1)[0]
    || suggestTyreSizes(spoken, 1)[0];
  if (best && best.score >= 0.58) {
    return best.value;
  }

  return null;
}

export function deriveTyreTypeFromSize(rawSize) {
  const normalizedSize = normalizeTyreSize(rawSize)
    || toUpperText(rawSize).replace(/\s+/g, '');
  if (!normalizedSize) {
    return null;
  }
  return normalizedSize.includes('R') ? 'Radial' : 'Bias';
}

export function normalizeMake(rawValue) {
  const input = toUpperText(rawValue).replace(/[^A-Z0-9\s]/g, '').trim();
  if (!input) return null;

  // Direct match
  for (const item of MAKE_MASTER) {
    if (input === item.code.toUpperCase()) return item.code;
    for (const alias of item.aliases) {
      if (input === alias) return item.code;
    }
  }

  // Fuzzy match — check if input contains an alias
  for (const item of MAKE_MASTER) {
    for (const alias of item.aliases) {
      if (input.includes(alias) || alias.includes(input)) {
        return item.code;
      }
    }
  }

  // Similarity match for close voice transcriptions
  let bestMatch = null;
  let bestScore = 0;
  for (const item of MAKE_MASTER) {
    for (const alias of item.aliases) {
      const score = similarityScore(compactKey(input), compactKey(alias));
      if (score > bestScore && score >= 0.7) {
        bestScore = score;
        bestMatch = item.code;
      }
    }
  }

  return bestMatch;
}

export function normalizeTyreModel(rawValue) {
  const compactInput = compactKey(normalizeSpokenAlphaNumeric(rawValue) || rawValue);
  if (!compactInput) return null;

  for (const item of MODEL_MASTER) {
    const aliases = [item.code, ...(item.aliases || [])];
    for (const alias of aliases) {
      if (compactInput === compactKey(alias)) {
        return item.code;
      }
    }
  }

  let bestMatch = null;
  let bestScore = 0;
  for (const item of MODEL_MASTER) {
    const score = scoreModel(rawValue, item.code);
    if (score > bestScore && score >= 0.64) {
      bestScore = score;
      bestMatch = item.code;
    }
  }

  return bestMatch;
}

export function suggestTyreModels(rawValue, limit = 3) {
  const scores = MODEL_CODES
    .map((modelCode) => ({ value: modelCode, score: scoreModel(rawValue, modelCode) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scores.slice(0, Math.max(1, Number(limit) || 3));
}

export function normalizeSpokenAlphaNumeric(rawValue) {
  const normalized = normalizeIndicDigits(rawValue)
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return null;
  }

  const compactParts = [];
  let currentNumberTokens = [];
  const flushNumberTokens = () => {
    if (currentNumberTokens.length === 0) {
      return;
    }

    const digitSequence = currentNumberTokens
      .map((token) => resolveAlphaNumericDigitSegment(token))
      .filter(Boolean);

    if (digitSequence.length === currentNumberTokens.length) {
      compactParts.push(digitSequence.join(''));
      currentNumberTokens = [];
      return;
    }

    const parsed = parseNumberTokenSequence(currentNumberTokens);
    if (Number.isFinite(parsed)) {
      compactParts.push(String(Math.round(parsed)));
      currentNumberTokens = [];
      return;
    }

    compactParts.push(
      ...currentNumberTokens
        .map((token) => normalizeSpeechToken(token))
        .filter(Boolean)
    );
    currentNumberTokens = [];
  };

  for (const token of normalized.split(' ').filter(Boolean)) {
    if (isNumberSequenceToken(token)) {
      currentNumberTokens.push(token);
      continue;
    }

    flushNumberTokens();
    const normalizedToken = normalizeSpeechToken(token);
    if (normalizedToken) {
      compactParts.push(normalizedToken);
    }
  }
  flushNumberTokens();

  const compact = compactParts
    .join('')
    .replace(/[^A-Z0-9]/g, '');

  return compact || null;
}

export function extractSpokenNumberCandidates(rawValue) {
  const text = normalizeIndicDigits(rawValue);
  const directMatches = Array.from(String(text || '').matchAll(/\d+(?:\.\d+)?/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));

  const rawTokens = String(text || '')
    .toUpperCase()
    .replace(/[,:;()\[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const parsedMatches = [];
  let current = [];
  const flushCurrent = () => {
    if (current.length === 0) return;
    const parsed = parseNumberTokenSequence(current);
    if (Number.isFinite(parsed)) {
      parsedMatches.push(parsed);
    }
    current = [];
  };

  for (const token of rawTokens) {
    if (isNumberSequenceToken(token)) {
      current.push(token);
      continue;
    }
    flushCurrent();
  }
  flushCurrent();

  return dedupeNumericCandidates([...directMatches, ...parsedMatches]);
}

export function listPositionMasters() {
  return POSITION_MASTER.map((item) => ({ code: item.code, name: item.name }));
}

export function listTyreSizeMasters() {
  return TYRE_SIZE_MASTER.slice();
}

export function listMakeMasters() {
  return MAKE_MASTER.map((item) => ({ code: item.code, aliases: item.aliases }));
}

export function listTyreModelMasters() {
  return MODEL_MASTER.map((item) => ({ code: item.code, aliases: item.aliases }));
}
