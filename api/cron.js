// Daily mail job, run by Vercel Cron (see vercel.json).
// Sends each profile's due reminders and, on the last day of its budget cycle,
// a monthly summary with Claude's analysis — to every email listed on the profile.
//
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   FIREBASE_SERVICE_ACCOUNT  JSON key of a Firebase service account
//   GMAIL_USER                Gmail address the mails are sent from
//   GMAIL_APP_PASSWORD        Google "app password" for that address
//   CRON_SECRET               any random string; Vercel sends it with cron calls
//   ANTHROPIC_API_KEY         for the Claude analysis in the monthly summary (optional)
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const N = require('./_lib/notify');
const { askClaude } = require('./_lib/ai');

function db() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin.firestore();
}

// The whole run must finish within the function's 60 seconds, and each Claude analysis takes
// 10-30s, so profiles are handled several at a time and the analysis is skipped (the summary
// still goes out) once the time budget is used up.
const CONCURRENCY = 8;
const AI_DEADLINE_MS = 40e3; // no new analyses after this point of the run
const AI_TIMEOUT_MS = 30e3;

// Run fn over items with at most n in flight
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

module.exports = async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const started = Date.now();
  const fdb = db();
  const mail = nodemailer.createTransport({ service: 'gmail', pool: true, maxConnections: 3, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
  const from = `"תקציב משפחתי" <${process.env.GMAIL_USER}>`;
  const t = N.israelToday();
  const log = [];

  const profiles = await fdb.collection('profiles').get();
  await pool(profiles.docs, CONCURRENCY, async doc => {
    const p = doc.data();
    const to = (p.emails || []).join(',');
    if (!to || p.lastMailDay === t.str) return; // already handled today
    let sent = 0;
    try {
      const due = N.dueReminders(p.reminders, t);
      if (due.length) {
        await mail.sendMail({ from, to, subject: `⏰ תזכורת: ${due.map(r => r.text).join(', ').slice(0, 80)}`, html: N.remindersHtml(p.name, due) });
        sent++;
      }
      const cycle = p.mailSummary ? N.endingCycle(t, p.monthStart) : null;
      if (cycle) {
        const [yDoc, eDoc] = await Promise.all([
          doc.ref.collection('data').doc('y' + cycle.year).get(),
          doc.ref.collection('data').doc('evt').get(),
        ]);
        const s = N.summarize(yDoc.exists ? yDoc.data() : null, eDoc.exists ? eDoc.data().events : [], cycle);
        const label = N.monthLabel(cycle.month, p.monthStart);
        // Claude's analysis of the month; the summary goes out without it if the call fails or time is short
        let ai = null;
        if (process.env.ANTHROPIC_API_KEY && Date.now() - started < AI_DEADLINE_MS) {
          const left = Math.min(AI_TIMEOUT_MS, 55e3 - (Date.now() - started));
          try { ai = await N.withTimeout(askClaude(N.monthlyPrompt(label, cycle.year, s), N.AI_SUMMARY_SCHEMA, 4000, { timeout: left, maxRetries: 0 }), left); }
          catch (e) { console.error('monthly ai', doc.id, e.message); }
        }
        await mail.sendMail({ from, to, subject: `📊 סיכום חודש ${label} ${cycle.year}`, html: N.summaryHtml(p.name, label, cycle.year, s, ai) });
        sent++;
      }
      if (sent) await doc.ref.update({ lastMailDay: t.str });
      log.push({ profile: doc.id, sent });
    } catch (e) {
      console.error('profile', doc.id, e);
      log.push({ profile: doc.id, error: String(e.message || e) });
    }
  });
  mail.close?.();
  res.status(200).json({ day: t.str, ms: Date.now() - started, log });
};
