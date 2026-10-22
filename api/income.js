// Income from another app (e.g. the business app): adds the income to the right month of the budget.
// Authenticated with the profile's personal key (settings → "קליטת חיובים מהטלפון"), which the
// user pastes into the other app; it stays on their device there.
//
// POST /api/income  JSON { key, id, amount, desc?, date? (YYYY-MM-DD) }
//   id      the income's id in the other app; sending the same id again updates it instead of duplicating
// POST /api/income  JSON { key, id, delete: true }   removes it (when it was deleted in the other app)
// POST /api/income  JSON { key, ping: true }         only checks the key
// Every answer names the profile ("profile"), so the other app can show where its income goes.
const admin = require('firebase-admin');
const { israelToday } = require('./_lib/notify');

function db() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin.firestore();
}

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// Budget month of a date, honoring "month starts on day N" (same rule as the app's dateBucket)
function bucket(date, monthStart) {
  const [y, m, d] = date.split('-').map(Number), st = parseInt(monthStart) || 1;
  let mm = m - 1, yy = y;
  if (st > 1 && d < st) { mm--; if (mm < 0) { mm = 11; yy--; } }
  return { y: yy, m: mm };
}

module.exports = async (req, res) => {
  // Called from the business app's page in the browser; the personal key is the authorization
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const key = String(b.key || req.headers['x-budget-key'] || '');
  if (!/^[A-Za-z0-9]{20,64}$/.test(key)) return res.status(401).json({ error: 'key' });
  const ext = clip(b.id, 80);
  if (!ext && !b.ping) return res.status(400).json({ error: 'id is required' });

  const fdb = db();
  const qs = await fdb.collection('profiles').where('ingestKey', '==', key).limit(1).get();
  if (qs.empty) return res.status(401).json({ error: 'key' });
  const prof = qs.docs[0];
  const profile = clip(prof.data().name, 40);
  if (b.ping) return res.status(200).json({ ok: true, profile });
  const data = prof.ref.collection('data');

  // Delete: look for it in this year and last year
  if (b.delete) {
    const y = israelToday().y;
    let removed = 0;
    for (const yy of [y, y - 1]) {
      const ref = data.doc('y' + yy);
      removed += await fdb.runTransaction(async tx => {
        const doc = (await tx.get(ref)).data();
        if (!doc?.mData) return 0;
        let n = 0;
        for (const m of Object.keys(doc.mData)) {
          const inc = doc.mData[m]?.income || [];
          const left = inc.filter(e => e.ext !== ext);
          if (left.length !== inc.length) { doc.mData[m].income = left; n += inc.length - left.length; }
        }
        if (n) tx.update(ref, { mData: doc.mData });
        return n;
      });
    }
    return res.status(200).json({ ok: true, removed, profile });
  }

  const amount = Math.round((parseFloat(b.amount) || 0) * 100) / 100;
  if (!(amount > 0 && amount < 1e8)) return res.status(400).json({ error: 'amount' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : israelToday().str;
  const desc = clip(b.desc, 60) || 'הכנסה מהעסק';
  const { y, m } = bucket(date, prof.data().monthStart);
  const ref = data.doc('y' + y);

  const out = await fdb.runTransaction(async tx => {
    const doc = (await tx.get(ref)).data();
    // A year the app hasn't opened yet has no categories; let the app create it and approve from the pending list
    if (!doc?.mData) return { pending: true };
    // The same income may have moved month (its date changed): remove the old copy first
    let prev = null;
    for (const k of Object.keys(doc.mData)) {
      const inc = doc.mData[k]?.income || [];
      const i = inc.findIndex(e => e.ext === ext);
      if (i >= 0) { prev = inc[i]; inc.splice(i, 1); }
    }
    if (!doc.mData[m]) doc.mData[m] = { income: [] };
    if (!doc.mData[m].income) doc.mData[m].income = [];
    doc.mData[m].income.push({ id: prev?.id || Date.now(), desc, amount, date, src: 'business', ext });
    tx.update(ref, { mData: doc.mData });
    return { updated: !!prev };
  });

  if (out.pending) {
    // Fall back to the pending list in the app
    const inbox = data.doc('inbox');
    await fdb.runTransaction(async tx => {
      const items = ((await tx.get(inbox)).data() || {}).items || [];
      if (!items.some(i => i.ext === ext)) items.push({ id: Date.now(), at: Date.now(), date, amount, cur: 'ILS', merchant: desc, credit: false, income: true, ext, raw: desc });
      tx.set(inbox, { items: items.slice(-100) });
    });
    return res.status(202).json({ ok: true, pending: true, profile });
  }
  return res.status(200).json({ ok: true, month: m + 1, year: y, updated: out.updated, profile });
};
