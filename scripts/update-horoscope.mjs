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

// Fixed reference links to 唐綺陽's official channels — for a real astrologer's
// in-depth take, not something we generate ourselves.
const WEEKLY_REFERENCE = [
  { name: '唐綺陽占星幫（Facebook）', url: 'https://www.facebook.com/JesseTang11/' },
  { name: '唐綺陽官方專屬頻道（YouTube）', url: 'https://www.youtube.com/channel/UCK7LdglLCApOTaylxX8hW2Q' },
];

// Public, publicly-known 2026 astronomical dates (Mercury retrograde windows, Sun
// sign ingress dates) — these are objective astronomical facts, not anyone's
// copyrighted commentary, so the weekly theme below can be generated automatically
// from them every run, with no scraping and no manual update needed during 2026.
// (Needs a fresh set of dates once a year, for 2027 onward.)
const MERCURY_RETROGRADE_2026 = [
  { start: '2026-02-26', end: '2026-03-21', sign: '雙魚座' },
  { start: '2026-06-29', end: '2026-07-23', sign: '巨蟹座' },
  { start: '2026-10-24', end: '2026-11-13', sign: '天蠍座' },
];

const SUN_INGRESS_2026 = [
  { date: '2026-01-20', sign: '水瓶座' },
  { date: '2026-02-19', sign: '雙魚座' },
  { date: '2026-03-20', sign: '牡羊座' },
  { date: '2026-04-20', sign: '金牛座' },
  { date: '2026-05-21', sign: '雙子座' },
  { date: '2026-06-21', sign: '巨蟹座' },
  { date: '2026-07-22', sign: '獅子座' },
  { date: '2026-08-23', sign: '處女座' },
  { date: '2026-09-23', sign: '天秤座' },
  { date: '2026-10-23', sign: '天蠍座' },
  { date: '2026-11-22', sign: '射手座' },
  { date: '2026-12-21', sign: '摩羯座' },
];

function getWeekRangeLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00Z');
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (x) => `${x.getUTCFullYear()}/${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}`;
  return `${fmt(monday)}–${fmt(sunday).slice(5)}`;
}

function buildWeeklyTheme(isoDate) {
  const parts = [];

  const retro = MERCURY_RETROGRADE_2026.find((r) => isoDate >= r.start && isoDate <= r.end);
  if (retro) {
    const fmtShort = (s) => s.slice(5).replace('-', '/');
    parts.push(`水星目前正在逆行（落在${retro.sign}，${fmtShort(retro.start)}–${fmtShort(retro.end)}），這段時間適合放慢腳步、重新確認訊息，避免倉促簽約或做重大決定。`);
  }

  const recentIngress = SUN_INGRESS_2026
    .filter((s) => s.date <= isoDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (recentIngress) {
    const daysSince = Math.round((new Date(isoDate) - new Date(recentIngress.date)) / 86400000);
    if (daysSince >= 0 && daysSince <= 10) {
      parts.push(`太陽剛進入${recentIngress.sign}不久，生活重心可能悄悄轉往${recentIngress.sign}相關的主題與氣氛。`);
    }
  }

  if (!parts.length) {
    parts.push('這段期間沒有特別重大的星象事件，是適合按自己步調安排生活的一週。');
  }

  return { range: getWeekRangeLabel(isoDate), summary: parts.join(' ') };
}

const HOROSCOPE_SOURCE = { name: 'API Ninjas（英翻中）', url: 'https://api-ninjas.com/api/horoscope' };
const LUCKY_DISCLAIMER = '幸運色／幸運時間由本 App 依星座與日期自動生成，非真實命理來源，僅供參考娛樂。';

async function main() {
  const todayIso = new Date().toISOString().slice(0, 10);
  const result = {
    generated_at: new Date().toISOString(),
    weekly_reference: WEEKLY_REFERENCE,
    weekly_theme: buildWeeklyTheme(todayIso),
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
      horoscope_source: HOROSCOPE_SOURCE,
      lucky_color: luckyColor.name,
      lucky_color_hex: luckyColor.hex,
      lucky_time: pickLuckyTime(sign, data.date),
      lucky_disclaimer: LUCKY_DISCLAIMER,
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
