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
    result.signs[sign] = {
      date: data.date,
      horoscope,
      horoscope_en,
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
