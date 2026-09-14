/* Hijri ↔ Gregorian, for tender deadlines.

   Saudi government tenders date everything in Hijri: HRDF كراسة 354030 closes
   09/01/1448, إنفاذ closes 09/11/1447. "How many days left" is the highest-
   weighted risk factor in Jadara's own Go/No-Go decks (DAN scored أحمر on
   ضيق المهلة with 7 days), so the conversion has to be computed, not asserted
   by the model.

   Uses the Umm al-Qura calendar via Intl — the civil calendar Saudi Arabia
   actually uses, and the one Etimad dates are issued in. No dependency. */

const UMALQURA = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC'
});

const DAY_MS = 86400000;

export function gregorianToHijri(date) {
  const parts = UMALQURA.formatToParts(date);
  const get = (t) => Number(parts.find(p => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/* Converts a Hijri date to its Gregorian equivalent (UTC midnight).

   Intl can only format Gregorian→Hijri, so this estimates the Gregorian day
   from the mean Hijri year (354.367 days), then converges and finishes with
   an exact ±5 day scan. Returns null rather than a wrong date if no exact
   match exists — an out-of-range or malformed Hijri date must not silently
   become a plausible-looking deadline. */
export function hijriToGregorian(hYear, hMonth, hDay) {
  if (!hYear || !hMonth || !hDay) return null;

  const HIJRI_EPOCH = Date.UTC(622, 6, 19);
  const estimate = Math.floor((hYear - 1) * 354.367) + Math.floor((hMonth - 1) * 29.531) + (hDay - 1);
  let guess = new Date(HIJRI_EPOCH + estimate * DAY_MS);

  for (let i = 0; i < 12; i++) {
    const h = gregorianToHijri(guess);
    const drift = (hYear - h.year) * 354.367 + (hMonth - h.month) * 29.531 + (hDay - h.day);
    if (Math.abs(drift) < 1) break;
    guess = new Date(guess.getTime() + Math.round(drift) * DAY_MS);
  }

  for (let offset = -5; offset <= 5; offset++) {
    const candidate = new Date(guess.getTime() + offset * DAY_MS);
    const h = gregorianToHijri(candidate);
    if (h.year === hYear && h.month === hMonth && h.day === hDay) return candidate;
  }
  return null;
}

// Accepts "09/01/1448", "1448-01-09", "٠٩/٠١/١٤٤٨". Day-first, as written in
// every Etimad tender document.
export function parseHijri(text) {
  if (!text) return null;
  const normalized = String(text).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const nums = normalized.match(/\d+/g);
  if (!nums || nums.length < 3) return null;

  const yearIndex = nums.findIndex(n => n.length === 4);
  if (yearIndex === -1) return null;
  const year = Number(nums[yearIndex]);
  if (year < 1300 || year > 1600) return null;

  const rest = nums.filter((_, i) => i !== yearIndex).map(Number);
  // Leading 4-digit year means ISO order (year-month-day); otherwise day-first.
  const [day, month] = yearIndex === 0 ? [rest[1], rest[0]] : [rest[0], rest[1]];
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 30)) return null;

  return { year, month, day };
}

export function daysUntil(date, from = new Date()) {
  if (!date) return null;
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((a - b) / DAY_MS);
}

/* Resolves whatever the model extracted into a usable deadline. Tenders state
   Hijri, but a non-Etimad RFP (e.g. جامعة الأمير مقرن) may state Gregorian. */
export function resolveDeadline(raw, calendar) {
  if (!raw) return { date: null, hijri: null, daysRemaining: null };

  const hijri = parseHijri(raw);
  const looksHijri = calendar === 'hijri' || (hijri && hijri.year >= 1300 && hijri.year <= 1600);

  if (looksHijri && hijri) {
    const date = hijriToGregorian(hijri.year, hijri.month, hijri.day);
    return {
      date,
      hijri: `${String(hijri.day).padStart(2, '0')}/${String(hijri.month).padStart(2, '0')}/${hijri.year}`,
      daysRemaining: daysUntil(date)
    };
  }

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return { date: null, hijri: null, daysRemaining: null };
  return { date: parsed, hijri: null, daysRemaining: daysUntil(parsed) };
}
