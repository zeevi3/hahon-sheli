# Portfolio Tracker — מפרט עיצוב

**תאריך:** 2026-04-29  
**סטטוס:** מאושר

---

## סקירה כללית

אפליקציית ווב מקומית למעקב אחר תיק השקעות משפחתי. רצה על `localhost`, ללא אימות משתמשים. מייבאת נתונים ראשוניים מ-CSV ומשם כל העדכונים נעשים דרך הממשק.

---

## Stack טכנולוגי

| שכבה | טכנולוגיה |
|------|-----------|
| Backend | FastAPI + Uvicorn |
| Database | SQLite דרך SQLAlchemy ORM |
| Frontend | HTML + Vanilla JS + Tailwind CSS (CDN) |
| גרפים | Chart.js |
| מחירי מטבעות | ExchangeRate-API (חינמי) |
| מחירי קריפטו | CoinGecko API (חינמי) |

---

## מבנה תיקיות

```
אפליקציה למעקב נכסים/
├── app/
│   ├── main.py          # FastAPI app + כל ה-routes
│   ├── models.py        # SQLAlchemy models (Asset, AssetSnapshot)
│   ├── database.py      # DB connection, init, session
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── crud.py          # פעולות DB (get, create, update, delete)
│   └── prices.py        # משיכת מחירים מ-ExchangeRate + CoinGecko
├── static/
│   ├── app.js           # כל לוגיקת ה-frontend
│   └── style.css        # הוספות על Tailwind
├── templates/
│   └── index.html       # דף HTML יחיד
├── import_csv.py        # סקריפט ייבוא חד-פעמי מ-CSV
├── requirements.txt
└── run.py               # python run.py → http://localhost:8000
```

---

## מודל נתונים

### טבלה: `assets`

| עמודה | סוג | תיאור |
|-------|-----|--------|
| id | INTEGER PK | |
| name | TEXT | שם הנכס |
| category | TEXT | פנסיה / קרן השתלמות / קופת גמל / ביטוח מנהלים / מסחר / קריפטו / חסכון / הלוואה |
| owner | TEXT | יהונתן / יעל / משותף |
| current_value | REAL | ערך ביחידות המטבע המקורי |
| currency | TEXT | ILS / USD / EUR / HKD / BTC / ETH / ADA / ... |
| management_fee | REAL | דמי ניהול באחוזים (nullable) |
| notes | TEXT | הערות חופשיות (nullable) |
| created_at | DATETIME | |
| updated_at | DATETIME | |

### טבלה: `asset_snapshots`

| עמודה | סוג | תיאור |
|-------|-----|--------|
| id | INTEGER PK | |
| asset_id | INTEGER FK | references assets.id |
| value | REAL | ערך ביחידות המטבע |
| currency | TEXT | מטבע באותה עת |
| recorded_at | DATETIME | |

כל שמירת ערך (ייבוא ראשוני + כל `PUT /api/assets/{id}`) מוסיפה snapshot חדש עם הערך החדש ו-timestamp. ה-snapshots מהווים את ההיסטוריה המלאה. לעולם לא נמחקים.

---

## API Endpoints

| Method | Path | תיאור |
|--------|------|--------|
| GET | `/api/assets` | כל הנכסים + ערך נוכחי בשקלים (לפי שערי הטעינה) |
| POST | `/api/assets` | הוסף נכס חדש |
| PUT | `/api/assets/{id}` | עדכן נכס (שומר snapshot אוטומטית) |
| DELETE | `/api/assets/{id}` | מחק נכס (ואת כל ה-snapshots שלו) |
| GET | `/api/assets/{id}/history` | היסטוריה מלאה של snapshots |
| GET | `/api/prices` | שערי מטבע + מחירי קריפטו (נטען פעם אחת בטעינת הדף) |
| GET | `/api/report?range=week\|month\|quarter\|year\|all` | דוח רווח/הפסד |
| GET | `/api/export` | הורד CSV של כל הנכסים עם שינויים |

---

## ממשק משתמש

### ניווט
סרגל צד קבוע בצד שמאל עם 4 סעיפים. ניווט בין מסכים מחליף את אזור התוכן ללא טעינת דף.

### מסך 1 — לוח בקרה
- כרטיסיות סיכום: סה"כ תיק (ILS), שינוי חודשי (₪ + %), ופירוק לפי קטגוריה
- גרף עוגה: חלוקת התיק לפי קטגוריות
- הכל מחושב בזמן אמת לפי שערי הטעינה

### מסך 2 — נכסים
- טבלה מחולקת לפי קטגוריות (כותרת לכל קבוצה)
- עמודות: שם, בעלות, ערך מקורי, ערך ב-ILS, דמי ניהול, הערות
- לחיצה על שורה: popup עריכה עם שדות ערך / מטבע / דמי ניהול / הערות + כפתור "שמור"
- כפתור "נכס חדש" — popup טופס הוספה
- כפתור "מחק" בתוך popup (עם אישור)

### מסך 3 — גרפים
- Dropdown לבחירת נכס
- בורר טווח: חודש / רבעון / שנה / הכל
- גרף 1 (קו): ערך מוחלט לאורך זמן
- גרף 2 (קו): אחוז שינוי ביחס לנקודה הראשונה בטווח

### מסך 4 — דוחות
- טבלת רווח/הפסד לפי קטגוריה
- טבלת רווח/הפסד לפי נכס (ניתנת למיון)
- בורר טווח: שבוע / חודש / רבעון / שנה / הכל
- כפתור "ייצוא CSV" — מוריד קובץ עם: שם, קטגוריה, בעלות, ערך נוכחי, ערך ראשון, שינוי ₪, שינוי %

---

## ייבוא ראשוני

`python import_csv.py` — רץ פעם אחת:
1. קורא את `כסף - גיליון1 (1).csv`
2. ממפה עמודות לקטגוריות: חסכונות / פנסיה / קריפטו / מניות / הלוואות
3. יוצר רשומת `Asset` לכל נכס + snapshot ראשון בתאריך הייבוא
4. מדפיס סיכום: כמה יובאו, כמה דולגו (שורות ריקות / סכומי ביניים)

---

## טיפול בשגיאות

| מצב | התנהגות |
|-----|---------|
| API מחירים נכשל | האפליקציה עולה עם שגיאת toast "מחירים לא עודכנו — מוצגים ערכים ללא המרה" |
| שגיאת DB | 500 עם הודעה ברורה ב-JSON |
| ערך לא תקין בעריכה | ולידציה ב-frontend לפני שליחה |
| מחיקת נכס | אישור נדרש ב-popup לפני ביצוע |

---

## הרצה

```bash
pip install -r requirements.txt
python import_csv.py      # פעם אחת
python run.py             # http://localhost:8000
```
