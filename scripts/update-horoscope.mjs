// scripts/update-horoscope.mjs
// Runs in GitHub Actions once a day. Fetches today's horoscope for all 12 signs
// from API Ninjas, translates each to Traditional Chinese, and writes horoscope.json
// to the repo root. The front-end (index.html) only ever reads that static file —
// it never calls any third-party API directly, so there's no CORS, no API key
// exposed in the browser, and no per-visitor cost.

const SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
  'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces',
];

// A curated palette of Traditional-Chinese color names + matching hex values.
// Lucky color/time aren't provided by API Ninjas, so we pick one deterministically
// per sign per day (same sign always gets the same color on the same date, but it
// changes day to day) — a light, reasonable "lucky pick" rather than a real astrological source.
const LUCKY_COLORS = [
  { name: '湖水綠', hex: '#4FB8AF' },
  { name: '珊瑚橘', hex: '#FF7F50' },
  { name: '薰衣草紫', hex: '#B497D6' },
  { name: '鵝黃', hex: '#F7E17B' },
  { name: '霧霾藍', hex: '#7C93AE' },
  { name: '玫瑰粉', hex: '#E8A0BF' },
  { name: '焦糖棕', hex: '#A9714B' },
  { name: '松石綠', hex: '#2E8B8B' },
  { name: '象牙白', hex: '#EDEAE0' },
  { name: '酒紅', hex: '#7B2D42' },
  { name: '深海藍', hex: '#1B3A5C' },
  { name: '奶茶色', hex: '#C9A66B' },
  { name: '薄荷綠', hex: '#98D8C8' },
  { name: '日落橙', hex: '#F4A261' },
  { name: '丁香紫', hex: '#C8A2C8' },
  { name: '銀灰', hex: '#B0B0B0' },
];

const LUCKY_TIMES = [
  '06:00–08:00', '08:00–10:00', '10:00–12:00', '12:00–14:00',
  '14:00–16:00', '16:00–18:00', '18:00–20:00', '20:00–22:00',
];

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickLuckyColor(sign, dateStr) {
  const idx = hashStr(`${dateStr}-${sign}-color`) % LUCKY_COLORS.length;
  return LUCKY_COLORS[idx];
}

function pickLuckyTime(sign, dateStr) {
  const idx = hashStr(`${dateStr}-${sign}-time`) % LUCKY_TIMES.length;
  return LUCKY_TIMES[idx];
}

const API_KEY = process.env.API_NINJAS_KEY;
if (!API_KEY) {
  console.error('Missing API_NINJAS_KEY environment variable (set it as a GitHub Actions secret).');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHoroscope(sign) {
  const res = await fetch(`https://api.api-ninjas.com/v1/horoscope?zodiac=${sign}`, {
    headers: { 'X-Api-Key': API_KEY },
  });
  if (!res.ok) {
    throw new Error(`API Ninjas error for ${sign}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function translateToZhTw(text) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-TW&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = await res.json();
    const translated = (json[0] || []).map((seg) => seg[0]).join('');
    return translated || text;
  } catch (e) {
    console.warn('Translation failed, falling back to English:', e.message);
    return text;
  }
}

async function main() {
  const result = {
    generated_at: new Date().toISOString(),
    signs: {},
  };

  for (const sign of SIGNS) {
    console.log(`Fetching ${sign}...`);
    const data = await fetchHoroscope(sign);
    const horoscope_en = data.horoscope;
    const horoscope = await translateToZhTw(horoscope_en);
    const luckyColor = pickLuckyColor(sign, data.date);
    result.signs[sign] = {
      date: data.date,
      horoscope,
      horoscope_en,
      lucky_color: luckyColor.name,
      lucky_color_hex: luckyColor.hex,
      lucky_time: pickLuckyTime(sign, data.date),
    };
    // Be polite to both free services between requests.
    await sleep(500);
  }

  const fs = await import('node:fs/promises');
  await fs.writeFile('horoscope.json', JSON.stringify(result, null, 2) + '\n', 'utf-8');
  console.log('Wrote horoscope.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
