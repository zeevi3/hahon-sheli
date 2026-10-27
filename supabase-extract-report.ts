// Supabase Edge Function: extract-report
// ---------------------------------------
// מקבל דוח פיננסי (PDF/תמונה) מהאפליקציה, שולח אותו ל־Claude API עם מפתח
// שנשמר כסוד בצד השרת, ומחזיר JSON עם הנתונים שחולצו.
// הדפדפן לעולם לא רואה את מפתח ה־API. הגישה מוגנת ב־Supabase Auth —
// רק משתמש מחובר (אתה) יכול להפעיל את הפונקציה.
//
// הוראות התקנה מלאות: ראה "הקמת-Supabase.md" בתיקיית הפרויקט.

const MODEL = 'claude-haiku-4-5-20251001'; // זול ומהיר; אפשר להחליף ל'claude-sonnet-5' לדיוק גבוה יותר

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROMPT = `קרא את הדוח הפיננסי המצורף (דוח שנתי/רבעוני לעמית, טופס 867, דף חשבון בנק/ברוקר וכדומה) וחלץ ממנו נתונים.

החזר JSON בלבד, בלי שום טקסט נוסף, במבנה הבא:
{
  "account_name_guess": "שם הגוף המנהל או החשבון כפי שמופיע בדוח, או null",
  "currency": "ILS או USD",
  "year": 2025,
  "values": [{"date": "YYYY-MM-DD", "value": 123456.78, "label": "יתרת סגירה"}],
  "flows": [{"date": "YYYY-MM-DD", "amount": 1571, "kind": "deposit"}],
  "dividends": 0,
  "fees": 1234.5,
  "notes": "הערות קצרות בעברית על אי־ודאויות או נתונים שהושמטו"
}

כללים:
- values: יתרות/שווי בנקודות זמן (למשל יתרת פתיחה ויתרת סגירה). date הוא התאריך שאליו מתייחסת היתרה, לא תאריך הפקת הדוח.
- flows: הפקדות (kind="deposit") ומשיכות (kind="withdraw"). אם יש פירוט חודשי — כלול כל שורה בנפרד. amount תמיד מספר חיובי.
- fees: סך דמי ניהול ועמלות שנגבו בתקופת הדוח. dividends: סך דיבידנדים שהתקבלו. אם לא מופיעים — 0.
- תאריכים בפורמט YYYY-MM-DD בלבד. סכומים כמספרים בלבד, בלי פסיקים וסמלי מטבע.
- אל תמציא נתונים. אם ערך לא ברור או מטושטש — השמט אותו וציין זאת ב-notes.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    // אימות: הטוקן חייב להשתייך למשתמש מחובר אמיתי (לא רק anon key)
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
    const userRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get('SUPABASE_ANON_KEY') || '',
      },
    });
    if (!userRes.ok) return json({ error: 'לא מחובר' }, 401);

    const { media_type, data_b64 } = await req.json();
    if (!media_type || !data_b64) return json({ error: 'חסר קובץ' }, 400);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'חסר סוד ANTHROPIC_API_KEY בהגדרות הפונקציה' }, 500);

    const fileBlock = media_type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type, data: data_b64 } }
      : { type: 'image', source: { type: 'base64', media_type, data: data_b64 } };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [fileBlock, { type: 'text', text: PROMPT }],
        }],
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      return json({ error: j?.error?.message || 'שגיאה מול Claude API' }, 502);
    }

    const text = (j.content || []).find((b: { type: string }) => b.type === 'text')?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return json({ error: 'המודל לא החזיר JSON תקין' }, 502);
    try {
      return json(JSON.parse(match[0]));
    } catch {
      return json({ error: 'המודל החזיר JSON שבור — נסה שוב' }, 502);
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
