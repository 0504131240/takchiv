# העלאה ל-Google Play

האפליקציה היא PWA, ונארזת לאנדרואיד כ-Trusted Web Activity (TWA): אפליקציה שפותחת את האתר במסך מלא, בלי שורת כתובת.

## כתובות שצריך בטפסים

| מה | כתובת |
|---|---|
| האפליקציה | https://takchiv.vercel.app/ |
| מדיניות פרטיות | https://takchiv.vercel.app/privacy.html |
| מחיקת חשבון ונתונים | https://takchiv.vercel.app/delete.html |

## שלבים

1. **חשבון מפתח:** https://play.google.com/console, תשלום חד-פעמי של 25$ ואימות זהות.
2. **בניית קובץ האפליקציה:** ב-https://www.pwabuilder.com מזינים את כתובת האפליקציה ובוחרים Android ← Generate Package.
   - Package ID: למשל `app.takchiv.budget`. אי אפשר לשנות אותו אחר כך.
   - מורידים את ה-ZIP ושומרים את קובץ ה-signing key ואת הסיסמה במקום בטוח.
3. **קובץ אימות הדומיין:** ב-ZIP יש קובץ `assetlinks.json`, ואחרי ההעלאה ל-Play Console יש גם טביעת אצבע של Play App Signing, תחת Setup ← App signing ← SHA-256. את שני ערכי ה-SHA-256 מכניסים ל-`.well-known/assetlinks.json` באתר. בלי הקובץ הזה תופיע שורת כתובת בראש המסך.
4. **יצירת האפליקציה ב-Play Console** והעלאת קובץ ה-`.aab` מה-ZIP.
5. **בדיקה סגורה:** בחשבון פרטי חדש צריך לפחות 12 בודקים במשך 14 ימים לפני פרסום לכולם. הבודקים מצטרפים דרך קישור שהקונסולה נותנת.
6. **מילוי הטפסים** (פירוט בהמשך) ושליחה לבדיקה.

## טופס בטיחות הנתונים (Data safety)

- **האם האפליקציה אוספת או משתפת נתונים?** כן, אוספת.
- **האם הנתונים מוצפנים בהעברה?** כן (HTTPS).
- **האם אפשר לבקש מחיקה?** כן, מתוך האפליקציה ובכתובת `delete.html`.
- **סוגי נתונים שנאספים:**
  - **Personal info ← Email address:** חובה. מטרות: App functionality, Account management.
  - **Personal info ← Name:** שם הפרופיל שהמשתמש בחר. חובה. מטרה: App functionality.
  - **Financial info ← Other financial info:** ההוצאות וההכנסות שהמשתמש מזין, וחיובים מהטלפון אם הופעלה קליטה. חובה. מטרות: App functionality, Personalization (ניתוח והצעות תקציב).
- **שיתוף (Shared):** לא. Firebase, Vercel, Anthropic ו-Gmail הם ספקי שירות שמעבדים את הנתונים בשביל האפליקציה, וזה לא נחשב שיתוף לפי ההגדרות של Google.
- **מכירת נתונים:** לא.

## שאלות נוספות בקונסולה

- **Ads:** האפליקציה לא מכילה פרסומות.
- **App access:** האפליקציה דורשת התחברות עם Google. צריך לתת לבודקים של Google חשבון Gmail לבדיקה, או להסביר שאפשר להתחבר עם כל חשבון Google.
- **Target audience:** ‏18 ומעלה.
- **Financial features:** ניהול תקציב אישי בלבד, בלי הלוואות, תשלומים או השקעות.
- **Category:** Finance.

## לפני פרסום לכולם

- **תקרת הוצאות ל-Claude:** כדאי להגדיר תקרה ב-console.anthropic.com ← Settings ← Limits.
- **סכום הוצאה על Firebase:** אם עוברים לתוכנית Blaze, להגדיר התראת תקציב ב-Google Cloud Billing.
- **Vercel:** התוכנית החינמית מיועדת לשימוש לא מסחרי. אם האפליקציה תהיה בתשלום, צריך Vercel Pro.
- **Gmail:** חשבון רגיל שולח עד בערך 500 מיילים ביום. מעל כמה מאות משפחות עם סיכום חודשי, צריך לעבור לשירות מיילים ייעודי.
