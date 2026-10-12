// Deletes the signed-in user's account and data (required by Google Play).
// Profiles the user shares with others: only their email is removed, the family keeps its data.
// Profiles where they are the only member: deleted with everything in them.
// Then their AI usage record and their sign-in account are deleted too.
const admin = require('firebase-admin');

function app() {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  return admin;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  let user;
  try {
    user = await app().auth().verifyIdToken((req.headers.authorization || '').replace(/^Bearer /, ''));
  } catch {
    return res.status(401).json({ error: 'צריך להתחבר מחדש' });
  }
  if (!user.email || !user.email_verified) return res.status(401).json({ error: 'צריך להתחבר מחדש' });
  const email = user.email.toLowerCase();
  const fdb = app().firestore();

  try {
    const qs = await fdb.collection('profiles').where('emails', 'array-contains', email).get();
    let deleted = 0, left = 0;
    for (const doc of qs.docs) {
      const others = (doc.data().emails || []).filter(e => e !== email);
      if (others.length) {
        await doc.ref.update({ emails: others });
        left++;
      } else {
        await fdb.recursiveDelete(doc.ref); // the profile and all its data documents
        deleted++;
      }
    }
    await fdb.collection('aiUsage').doc(email).delete();
    await app().auth().deleteUser(user.uid);
    return res.status(200).json({ ok: true, deleted, left });
  } catch (e) {
    console.error('delete-account', e);
    return res.status(500).json({ error: 'המחיקה נכשלה, נסה שוב' });
  }
};
