import fs from "fs";
import path from "path";

const COOKIES_PER_WORKER = 100;
const STORE_OPEN = 6;
const STORE_CLOSE = 22;
const QUEUES = ["sugar", "chocolate-chip", "oatmeal-raisin", "snickerdoodle"];

const utcTimestamp = (year: number, month: number, day: number, hour: number) => {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  return `${year}-${mm}-${dd}T${hh}:00:00Z`;
};

const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

/**
 * Per-day volume caps:
 *   Mon/Tue  -> max 300
 *   Wed/Thu  -> max 400
 *   Fri/Sat  -> max ~700 (peaks above 500)
 *   Sun      -> max 300
 */
const dayVolumeCap = (dow: number) => {
  const caps: Record<number, number> = { 0: 300, 1: 300, 2: 300, 3: 400, 4: 400, 5: 700, 6: 700 };
  return caps[dow] ?? 400;
};

/**
 * Base volume curve by hour, scaled to each day's cap.
 * Returns a value between 0 and the day's max.
 */
const cookieVolume = (hour: number, dayOfWeek: number): number => {
  const cap = dayVolumeCap(dayOfWeek);
  const jitter = () => Math.floor(Math.random() * 30) - 15;

  // Curve as a fraction of cap (0.0 to 1.0)
  let frac: number;
  if (hour < 8)       frac = 0.20 + Math.random() * 0.10;
  else if (hour < 10) frac = 0.50 + Math.random() * 0.10;
  else if (hour < 12) frac = 0.85 + Math.random() * 0.15; // peak
  else if (hour === 12) frac = 0.65 + Math.random() * 0.10; // lunch dip
  else if (hour < 15) frac = 0.90 + Math.random() * 0.10; // afternoon peak
  else if (hour < 17) frac = 0.75 + Math.random() * 0.10;
  else if (hour < 19) frac = 0.55 + Math.random() * 0.10;
  else if (hour < 21) frac = 0.35 + Math.random() * 0.10;
  else                frac = 0.20 + Math.random() * 0.08;

  return Math.max(0, Math.min(cap, Math.round(cap * frac + jitter())));
};

const today = new Date();
const startYear = today.getUTCFullYear();
const startMonth = today.getUTCMonth() + 1;
const startDay = today.getUTCDate();
const maxDay = daysInMonth(startYear, startMonth);

const rows: string[] = ["timestamp,required_headcount,volume,queue"];

for (let d = 0; d < 7; d++) {
  let day = startDay + d;
  let month = startMonth;
  let year = startYear;
  if (day > maxDay) { day -= maxDay; month++; if (month > 12) { month = 1; year++; } }

  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  // Emit all 24 hours; 0 demand outside store hours
  for (let hour = 0; hour < 24; hour++) {
    const ts = utcTimestamp(year, month, day, hour);
    const isOpen = hour >= STORE_OPEN && hour < STORE_CLOSE;
    const volume = isOpen ? cookieVolume(hour, dow) : 0;
    const headcount = isOpen ? Math.ceil(volume / COOKIES_PER_WORKER) : 0;
    const queue = QUEUES[Math.floor(Math.random() * QUEUES.length)];
    rows.push(`${ts},${headcount},${volume},${queue}`);
  }
}

const outDir = path.resolve(__dirname, "../../data");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "demand.csv"), rows.join("\n"));
console.log(`Wrote ${rows.length - 1} demand rows to data/demand.csv`);
