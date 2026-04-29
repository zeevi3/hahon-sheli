# Portfolio Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app (FastAPI + SQLite + Vanilla JS) for tracking a family investment portfolio with full history, real-time FX/crypto prices, and interactive charts.

**Architecture:** FastAPI serves both the single HTML page and a JSON REST API. SQLite stores assets and snapshots via SQLAlchemy ORM. The frontend is pure Vanilla JS — no build step — that fetches from the API and renders everything client-side.

**Tech Stack:** Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2.0, Pydantic v2, Chart.js (CDN), Tailwind CSS (CDN), ExchangeRate-API (free), CoinGecko API (free)

---

## File Map

| File | Responsibility |
|------|---------------|
| `app/database.py` | SQLAlchemy engine, SessionLocal, Base, `init_db()` |
| `app/models.py` | `Asset` and `AssetSnapshot` ORM models |
| `app/schemas.py` | Pydantic request/response schemas |
| `app/crud.py` | All DB read/write operations |
| `app/prices.py` | Fetch FX rates (ExchangeRate-API) and crypto prices (CoinGecko) |
| `app/main.py` | FastAPI app, all routes, static/template mounting |
| `import_csv.py` | One-time CSV import script |
| `templates/index.html` | Single HTML page with sidebar layout |
| `static/style.css` | Additions to Tailwind |
| `static/app.js` | All frontend logic (navigation, tables, charts, popups) |
| `run.py` | Entry point: `python run.py` |
| `requirements.txt` | Dependencies |
| `tests/test_crud.py` | CRUD unit tests against in-memory SQLite |
| `tests/test_api.py` | API integration tests with FastAPI TestClient |
| `tests/test_prices.py` | Price module tests with mocked HTTP |
| `tests/conftest.py` | Shared pytest fixtures |

---

## Task 1: Project Setup

**Files:**
- Create: `requirements.txt`
- Create: `run.py`
- Create: `app/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Create directory structure**

```bash
cd "/Users/yehonatanzeevi/Desktop/קלוד קוד/אפליקציה למעקב נכסים"
mkdir -p app tests static templates
touch app/__init__.py tests/__init__.py
```

- [ ] **Step 2: Write `requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
httpx==0.27.2
jinja2==3.1.4
python-multipart==0.0.12
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Install dependencies**

```bash
pip install -r requirements.txt
```

Expected: all packages install without error.

- [ ] **Step 4: Write `run.py`**

```python
import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
```

- [ ] **Step 5: Write `tests/conftest.py`**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(db_engine):
    TestingSessionLocal = sessionmaker(bind=db_engine)
    session = TestingSessionLocal()
    yield session
    session.close()

@pytest.fixture(scope="function")
def client(db_engine):
    TestingSessionLocal = sessionmaker(bind=db_engine)

    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
```

- [ ] **Step 6: Commit**

```bash
git add requirements.txt run.py app/__init__.py tests/__init__.py tests/conftest.py
git commit -m "feat: project setup and dependencies"
```

---

## Task 2: Database Layer

**Files:**
- Create: `app/database.py`
- Create: `app/models.py`

- [ ] **Step 1: Write `app/database.py`**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

DATABASE_URL = "sqlite:///./portfolio.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 2: Write `app/models.py`**

```python
from datetime import datetime
from sqlalchemy import Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

VALID_CATEGORIES = [
    "פנסיה", "קרן השתלמות", "קופת גמל", "ביטוח מנהלים",
    "מסחר", "קריפטו", "חסכון", "הלוואה"
]
VALID_OWNERS = ["יהונתן", "יעל", "משותף"]

class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    owner: Mapped[str] = mapped_column(String, nullable=False)
    current_value: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="ILS")
    management_fee: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    snapshots: Mapped[list["AssetSnapshot"]] = relationship(
        "AssetSnapshot", back_populates="asset", cascade="all, delete-orphan", order_by="AssetSnapshot.recorded_at"
    )

class AssetSnapshot(Base):
    __tablename__ = "asset_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    asset_id: Mapped[int] = mapped_column(Integer, ForeignKey("assets.id"), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    asset: Mapped["Asset"] = relationship("Asset", back_populates="snapshots")
```

- [ ] **Step 3: Verify models create tables correctly**

```bash
python -c "from app.database import init_db; init_db(); print('OK')"
```

Expected: prints `OK`, creates `portfolio.db`.

```bash
python -c "
import sqlite3
conn = sqlite3.connect('portfolio.db')
tables = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()
print(tables)
"
```

Expected: `[('assets',), ('asset_snapshots',)]`

- [ ] **Step 4: Commit**

```bash
git add app/database.py app/models.py
git commit -m "feat: database models for Asset and AssetSnapshot"
```

---

## Task 3: Schemas and CRUD

**Files:**
- Create: `app/schemas.py`
- Create: `app/crud.py`
- Create: `tests/test_crud.py`

- [ ] **Step 1: Write failing tests in `tests/test_crud.py`**

```python
from datetime import datetime, timedelta
import pytest
from app import crud, models
from app.schemas import AssetCreate, AssetUpdate

def make_asset(name="Test Fund", category="חסכון", owner="יהונתן",
               value=100000.0, currency="ILS"):
    return AssetCreate(name=name, category=category, owner=owner,
                       current_value=value, currency=currency)

def test_create_asset_and_snapshot(db_session):
    asset = crud.create_asset(db_session, make_asset())
    assert asset.id is not None
    assert asset.name == "Test Fund"
    snapshots = crud.get_asset_history(db_session, asset.id)
    assert len(snapshots) == 1
    assert snapshots[0].value == 100000.0

def test_update_asset_adds_snapshot(db_session):
    asset = crud.create_asset(db_session, make_asset(value=100000.0))
    update = AssetUpdate(current_value=120000.0)
    updated = crud.update_asset(db_session, asset.id, update)
    assert updated.current_value == 120000.0
    snapshots = crud.get_asset_history(db_session, asset.id)
    assert len(snapshots) == 2
    assert snapshots[-1].value == 120000.0

def test_get_all_assets(db_session):
    crud.create_asset(db_session, make_asset(name="A"))
    crud.create_asset(db_session, make_asset(name="B"))
    assets = crud.get_assets(db_session)
    assert len(assets) == 2

def test_delete_asset(db_session):
    asset = crud.create_asset(db_session, make_asset())
    crud.delete_asset(db_session, asset.id)
    assert crud.get_assets(db_session) == []

def test_delete_asset_cascades_snapshots(db_session):
    asset = crud.create_asset(db_session, make_asset())
    asset_id = asset.id
    crud.delete_asset(db_session, asset_id)
    snapshots = crud.get_asset_history(db_session, asset_id)
    assert snapshots == []

def test_get_asset_history_ordered(db_session):
    asset = crud.create_asset(db_session, make_asset(value=100.0))
    crud.update_asset(db_session, asset.id, AssetUpdate(current_value=200.0))
    crud.update_asset(db_session, asset.id, AssetUpdate(current_value=300.0))
    history = crud.get_asset_history(db_session, asset.id)
    values = [s.value for s in history]
    assert values == [100.0, 200.0, 300.0]
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pytest tests/test_crud.py -v
```

Expected: `ImportError` or similar — `crud` and `schemas` don't exist yet.

- [ ] **Step 3: Write `app/schemas.py`**

```python
from datetime import datetime
from pydantic import BaseModel

class AssetCreate(BaseModel):
    name: str
    category: str
    owner: str
    current_value: float
    currency: str = "ILS"
    management_fee: float | None = None
    notes: str | None = None

class AssetUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    owner: str | None = None
    current_value: float | None = None
    currency: str | None = None
    management_fee: float | None = None
    notes: str | None = None

class AssetResponse(BaseModel):
    id: int
    name: str
    category: str
    owner: str
    current_value: float
    currency: str
    management_fee: float | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class SnapshotResponse(BaseModel):
    id: int
    asset_id: int
    value: float
    currency: str
    recorded_at: datetime

    model_config = {"from_attributes": True}

class PricesResponse(BaseModel):
    fx: dict[str, float]   # {"USD": 3.7, "EUR": 4.0, "HKD": 0.47}
    crypto: dict[str, float]  # {"BTC": 380000.0, "ADA": 1.2}
    fetched_at: datetime
    error: str | None = None
```

- [ ] **Step 4: Write `app/crud.py`**

```python
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Asset, AssetSnapshot
from app.schemas import AssetCreate, AssetUpdate

def create_asset(db: Session, data: AssetCreate) -> Asset:
    asset = Asset(**data.model_dump())
    db.add(asset)
    db.flush()
    snapshot = AssetSnapshot(asset_id=asset.id, value=asset.current_value, currency=asset.currency)
    db.add(snapshot)
    db.commit()
    db.refresh(asset)
    return asset

def get_assets(db: Session) -> list[Asset]:
    return db.query(Asset).order_by(Asset.category, Asset.name).all()

def get_asset(db: Session, asset_id: int) -> Asset | None:
    return db.query(Asset).filter(Asset.id == asset_id).first()

def update_asset(db: Session, asset_id: int, data: AssetUpdate) -> Asset | None:
    asset = get_asset(db, asset_id)
    if not asset:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(asset, key, value)
    asset.updated_at = datetime.utcnow()
    new_value = update_data.get("current_value", asset.current_value)
    new_currency = update_data.get("currency", asset.currency)
    snapshot = AssetSnapshot(asset_id=asset.id, value=new_value, currency=new_currency)
    db.add(snapshot)
    db.commit()
    db.refresh(asset)
    return asset

def delete_asset(db: Session, asset_id: int) -> bool:
    asset = get_asset(db, asset_id)
    if not asset:
        return False
    db.delete(asset)
    db.commit()
    return True

def get_asset_history(db: Session, asset_id: int) -> list[AssetSnapshot]:
    return (db.query(AssetSnapshot)
            .filter(AssetSnapshot.asset_id == asset_id)
            .order_by(AssetSnapshot.recorded_at)
            .all())
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
pytest tests/test_crud.py -v
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/schemas.py app/crud.py tests/test_crud.py
git commit -m "feat: schemas and CRUD with snapshot history"
```

---

## Task 4: Prices Module

**Files:**
- Create: `app/prices.py`
- Create: `tests/test_prices.py`

- [ ] **Step 1: Write failing tests in `tests/test_prices.py`**

```python
from unittest.mock import patch, MagicMock
from app.prices import fetch_prices

MOCK_FX_RESPONSE = {
    "rates": {"ILS": 1.0, "USD": 0.27, "EUR": 0.25, "HKD": 2.1}
}

MOCK_CRYPTO_RESPONSE = {
    "bitcoin": {"ils": 380000.0},
    "cardano": {"ils": 1.2},
    "polkadot": {"ils": 22.0},
    "iota": {"ils": 0.18},
}

def test_fetch_prices_returns_fx_and_crypto():
    with patch("app.prices.httpx.get") as mock_get:
        fx_mock = MagicMock()
        fx_mock.json.return_value = MOCK_FX_RESPONSE
        fx_mock.raise_for_status.return_value = None

        crypto_mock = MagicMock()
        crypto_mock.json.return_value = MOCK_CRYPTO_RESPONSE
        crypto_mock.raise_for_status.return_value = None

        mock_get.side_effect = [fx_mock, crypto_mock]

        prices = fetch_prices()

    assert prices.fx["USD"] > 0
    assert prices.crypto["BTC"] > 0
    assert prices.error is None

def test_fetch_prices_handles_api_failure():
    with patch("app.prices.httpx.get") as mock_get:
        mock_get.side_effect = Exception("network error")
        prices = fetch_prices()

    assert prices.error is not None
    assert prices.fx == {}
    assert prices.crypto == {}
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pytest tests/test_prices.py -v
```

Expected: `ImportError` — `prices` module doesn't exist.

- [ ] **Step 3: Write `app/prices.py`**

```python
from datetime import datetime
import httpx
from app.schemas import PricesResponse

FX_URL = "https://api.exchangerate-api.com/v4/latest/ILS"
CRYPTO_URL = (
    "https://api.coingecko.com/api/v3/simple/price"
    "?ids=bitcoin,cardano,polkadot,iota&vs_currencies=ils"
)
CRYPTO_ID_MAP = {
    "bitcoin": "BTC",
    "cardano": "ADA",
    "polkadot": "DOT",
    "iota": "IOTA",
}

def fetch_prices() -> PricesResponse:
    try:
        fx_resp = httpx.get(FX_URL, timeout=10)
        fx_resp.raise_for_status()
        fx_data = fx_resp.json()
        # rates are relative to ILS base: rate["USD"] = how many USD per 1 ILS
        # We want ILS per 1 foreign unit → invert
        raw_rates = fx_data.get("rates", {})
        fx = {
            currency: 1.0 / rate
            for currency, rate in raw_rates.items()
            if rate > 0 and currency != "ILS"
        }

        crypto_resp = httpx.get(CRYPTO_URL, timeout=10)
        crypto_resp.raise_for_status()
        crypto_data = crypto_resp.json()
        crypto = {
            CRYPTO_ID_MAP[coin_id]: data["ils"]
            for coin_id, data in crypto_data.items()
            if coin_id in CRYPTO_ID_MAP
        }

        return PricesResponse(fx=fx, crypto=crypto, fetched_at=datetime.utcnow())

    except Exception as e:
        return PricesResponse(fx={}, crypto={}, fetched_at=datetime.utcnow(), error=str(e))
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pytest tests/test_prices.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/prices.py tests/test_prices.py
git commit -m "feat: prices module for FX and crypto"
```

---

## Task 5: FastAPI App and Routes

**Files:**
- Create: `app/main.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Write failing API tests in `tests/test_api.py`**

```python
import pytest

def test_get_assets_empty(client):
    resp = client.get("/api/assets")
    assert resp.status_code == 200
    assert resp.json() == []

def test_create_asset(client):
    payload = {"name": "מגדל גמל", "category": "קופת גמל",
               "owner": "יהונתן", "current_value": 26226.0, "currency": "ILS"}
    resp = client.post("/api/assets", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"] == 1
    assert data["name"] == "מגדל גמל"

def test_update_asset(client):
    client.post("/api/assets", json={"name": "A", "category": "חסכון",
                                     "owner": "יעל", "current_value": 1000.0, "currency": "ILS"})
    resp = client.put("/api/assets/1", json={"current_value": 1500.0})
    assert resp.status_code == 200
    assert resp.json()["current_value"] == 1500.0

def test_update_nonexistent_asset(client):
    resp = client.put("/api/assets/999", json={"current_value": 1000.0})
    assert resp.status_code == 404

def test_delete_asset(client):
    client.post("/api/assets", json={"name": "A", "category": "חסכון",
                                     "owner": "יעל", "current_value": 1000.0, "currency": "ILS"})
    resp = client.delete("/api/assets/1")
    assert resp.status_code == 204
    assert client.get("/api/assets").json() == []

def test_get_asset_history(client):
    client.post("/api/assets", json={"name": "A", "category": "חסכון",
                                     "owner": "יהונתן", "current_value": 1000.0, "currency": "ILS"})
    client.put("/api/assets/1", json={"current_value": 2000.0})
    resp = client.get("/api/assets/1/history")
    assert resp.status_code == 200
    history = resp.json()
    assert len(history) == 2
    assert history[0]["value"] == 1000.0
    assert history[1]["value"] == 2000.0

def test_report_endpoint(client):
    client.post("/api/assets", json={"name": "A", "category": "חסכון",
                                     "owner": "יהונתן", "current_value": 1000.0, "currency": "ILS"})
    resp = client.get("/api/report?range=month")
    assert resp.status_code == 200
    data = resp.json()
    assert "by_category" in data
    assert "by_asset" in data

def test_export_csv(client):
    client.post("/api/assets", json={"name": "קרן א", "category": "חסכון",
                                     "owner": "יהונתן", "current_value": 5000.0, "currency": "ILS"})
    resp = client.get("/api/export")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "קרן א" in resp.text
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pytest tests/test_api.py -v
```

Expected: `ImportError` or connection error — `main.py` doesn't exist.

- [ ] **Step 3: Write `app/main.py`**

```python
import csv
import io
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from sqlalchemy.orm import Session

from app.database import get_db, init_db
from app import crud
from app.schemas import AssetCreate, AssetUpdate, AssetResponse, SnapshotResponse
from app.prices import fetch_prices

app = FastAPI(title="Portfolio Tracker")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.on_event("startup")
def on_startup():
    init_db()

@app.get("/")
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/assets", response_model=list[AssetResponse])
def list_assets(db: Session = Depends(get_db)):
    return crud.get_assets(db)

@app.post("/api/assets", response_model=AssetResponse, status_code=201)
def create_asset(data: AssetCreate, db: Session = Depends(get_db)):
    return crud.create_asset(db, data)

@app.put("/api/assets/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, data: AssetUpdate, db: Session = Depends(get_db)):
    asset = crud.update_asset(db, asset_id, data)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset

@app.delete("/api/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db)):
    if not crud.delete_asset(db, asset_id):
        raise HTTPException(status_code=404, detail="Asset not found")

@app.get("/api/assets/{asset_id}/history", response_model=list[SnapshotResponse])
def asset_history(asset_id: int, db: Session = Depends(get_db)):
    return crud.get_asset_history(db, asset_id)

@app.get("/api/prices")
def prices():
    return fetch_prices()

@app.get("/api/report")
def report(range: str = "all", db: Session = Depends(get_db)):
    range_map = {"week": 7, "month": 30, "quarter": 90, "year": 365}
    days = range_map.get(range)
    cutoff = datetime.utcnow() - timedelta(days=days) if days else None

    assets = crud.get_assets(db)
    by_category: dict[str, dict] = {}
    by_asset: list[dict] = []

    for asset in assets:
        history = crud.get_asset_history(db, asset.id)
        if not history:
            continue
        if cutoff:
            first = next((s for s in history if s.recorded_at >= cutoff), history[0])
        else:
            first = history[0]
        last = history[-1]
        change_abs = last.value - first.value
        change_pct = (change_abs / first.value * 100) if first.value else 0

        by_asset.append({
            "id": asset.id,
            "name": asset.name,
            "category": asset.category,
            "owner": asset.owner,
            "currency": asset.currency,
            "first_value": first.value,
            "current_value": last.value,
            "change_abs": change_abs,
            "change_pct": round(change_pct, 2),
        })

        cat = asset.category
        if cat not in by_category:
            by_category[cat] = {"first_value": 0, "current_value": 0}
        by_category[cat]["first_value"] += first.value if asset.currency == "ILS" else 0
        by_category[cat]["current_value"] += last.value if asset.currency == "ILS" else 0

    for cat, data in by_category.items():
        fv = data["first_value"]
        data["change_abs"] = data["current_value"] - fv
        data["change_pct"] = round((data["change_abs"] / fv * 100) if fv else 0, 2)

    return {"by_category": by_category, "by_asset": by_asset}

@app.get("/api/export")
def export_csv(db: Session = Depends(get_db)):
    assets = crud.get_assets(db)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["שם", "קטגוריה", "בעלות", "ערך נוכחי", "מטבע", "ערך ראשון", "שינוי", "שינוי %", "דמי ניהול", "הערות"])
    for asset in assets:
        history = crud.get_asset_history(db, asset.id)
        first_val = history[0].value if history else asset.current_value
        change = asset.current_value - first_val
        change_pct = (change / first_val * 100) if first_val else 0
        writer.writerow([
            asset.name, asset.category, asset.owner,
            asset.current_value, asset.currency, first_val,
            round(change, 2), round(change_pct, 2),
            asset.management_fee or "", asset.notes or ""
        ])
    content = output.getvalue()
    return Response(content="﻿" + content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=portfolio.csv"})
```

- [ ] **Step 4: Create placeholder static and template files so the app starts**

```bash
touch static/style.css static/app.js
```

Create `templates/index.html` with minimal content:

```html
<!DOCTYPE html>
<html><head><title>Portfolio</title></head>
<body><h1>Portfolio Tracker</h1></body>
</html>
```

- [ ] **Step 5: Run API tests — verify they pass**

```bash
pytest tests/test_api.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Run the server and verify it starts**

```bash
python run.py &
sleep 2
curl http://localhost:8000/api/assets
```

Expected: `[]`

```bash
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add app/main.py tests/test_api.py templates/index.html static/style.css static/app.js
git commit -m "feat: FastAPI app with all REST endpoints"
```

---

## Task 6: CSV Import Script

**Files:**
- Create: `import_csv.py`

- [ ] **Step 1: Write `import_csv.py`**

```python
"""
One-time import from: כסף - גיליון1 (1).csv
Run: python import_csv.py
"""
import csv
import re
import sys
from pathlib import Path
from app.database import SessionLocal, init_db
from app.crud import create_asset
from app.schemas import AssetCreate

CSV_PATH = Path(__file__).parent / "כסף - גיליון1 (1).csv"

def clean_value(raw: str) -> float | None:
    """Convert '₪26,226.00' or '$15,000.00' or '2.05' to float."""
    if not raw or raw.strip() in ("", "--"):
        return None
    cleaned = re.sub(r"[₪$,\s]", "", raw.strip())
    try:
        return float(cleaned)
    except ValueError:
        return None

def extract_fee(text: str) -> float | None:
    """Extract percentage like 0.8% or 2.09% from description text."""
    matches = re.findall(r"(\d+\.?\d*)\s*%", text)
    if matches:
        return float(matches[0])
    return None

def detect_owner(text: str) -> str:
    """Guess owner from name field."""
    if "יעל" in text:
        return "יעל"
    if "יהונתן" in text or "נמרוד" in text or "מאיה" in text or "דניאל" in text:
        return "יהונתן"
    return "משותף"

def detect_currency(value_str: str) -> str:
    if value_str.strip().startswith("$"):
        return "USD"
    return "ILS"

def parse_rows(reader) -> list[AssetCreate]:
    assets = []
    rows = list(reader)
    # Skip header row (row 0 has category names)
    skip_keywords = {"סה\"כ", "סה'כ", "סהכ", ""}

    for row in rows[1:]:
        # Pad row to ensure enough columns
        while len(row) < 20:
            row.append("")

        # --- חסכונות (cols 1-2) ---
        val_str = row[1].strip()
        name = row[2].strip().split("\n")[0].strip()
        val = clean_value(val_str)
        if val is not None and name and not any(k in name for k in skip_keywords):
            currency = detect_currency(val_str)
            assets.append(AssetCreate(
                name=name, category="חסכון",
                owner=detect_owner(name),
                current_value=val, currency=currency,
                management_fee=extract_fee(row[2]),
                notes=None
            ))

        # --- פנסיה / קרנות (cols 4-5) ---
        val_str = row[4].strip()
        name = row[5].strip().split("\n")[0].strip()
        val = clean_value(val_str)
        if val is not None and name and not any(k in name for k in skip_keywords):
            currency = detect_currency(val_str)
            # Categorize pension products
            if "פנסיה" in name or "מבטחים" in name:
                cat = "פנסיה"
            elif "השתלמות" in name:
                cat = "קרן השתלמות"
            elif "גמל" in name or "מור גמ" in name:
                cat = "קופת גמל"
            elif "ביטוח מנהלים" in name or "לחיים" in name:
                cat = "ביטוח מנהלים"
            elif "בנק" in name.lower() or "דיסקונט" in name or "HSBC" in name or "Wise" in name:
                cat = "חסכון"
            else:
                cat = "חסכון"
            assets.append(AssetCreate(
                name=name, category=cat,
                owner=detect_owner(name + row[5]),
                current_value=val, currency=currency,
                management_fee=extract_fee(row[5]),
                notes=None
            ))

        # --- קריפטו (cols 7-8) ---
        amount_str = row[7].strip()
        coin = row[8].strip()
        amount = clean_value(amount_str)
        if amount is not None and coin and coin not in skip_keywords:
            crypto_currency_map = {
                "ביטקויין": "BTC",
                "ADA": "ADA",
                "DOT": "DOT",
                "IOTA": "IOTA",
            }
            currency = crypto_currency_map.get(coin, coin)
            assets.append(AssetCreate(
                name=coin, category="קריפטו",
                owner="משותף",
                current_value=amount, currency=currency,
                management_fee=None, notes=None
            ))

        # --- מניות (cols 10-11) ---
        val_str = row[10].strip()
        name = row[11].strip().split("\n")[0].strip()
        val = clean_value(val_str)
        if val is not None and name and not any(k in name for k in skip_keywords):
            assets.append(AssetCreate(
                name=name, category="מסחר",
                owner="יהונתן",
                current_value=val, currency="ILS",
                management_fee=None, notes=None
            ))

    return assets

def main():
    if not CSV_PATH.exists():
        print(f"ERROR: CSV not found at {CSV_PATH}")
        sys.exit(1)

    init_db()
    db = SessionLocal()

    with open(CSV_PATH, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        assets_to_import = parse_rows(reader)

    imported = 0
    skipped = 0
    for asset_data in assets_to_import:
        try:
            create_asset(db, asset_data)
            print(f"  ✓ {asset_data.category}: {asset_data.name} ({asset_data.current_value} {asset_data.currency})")
            imported += 1
        except Exception as e:
            print(f"  ✗ SKIP {asset_data.name}: {e}")
            skipped += 1

    db.close()
    print(f"\nDone: {imported} imported, {skipped} skipped.")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the import**

```bash
python import_csv.py
```

Expected: list of imported assets printed, ending with `Done: N imported, 0 skipped.`

- [ ] **Step 3: Verify data in DB**

```bash
python -c "
from app.database import SessionLocal
from app.crud import get_assets
db = SessionLocal()
assets = get_assets(db)
print(f'Total assets: {len(assets)}')
for a in assets:
    print(f'  {a.category}: {a.name} = {a.current_value} {a.currency}')
db.close()
"
```

Expected: all assets listed by category.

- [ ] **Step 4: Commit**

```bash
git add import_csv.py
git commit -m "feat: CSV import script for initial data load"
```

---

## Task 7: HTML Template (Full Layout)

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Write full `templates/index.html`**

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portfolio Tracker</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex">

  <!-- Sidebar -->
  <aside id="sidebar" class="w-56 bg-gray-900 border-l border-gray-800 flex flex-col py-6 px-4 fixed h-full">
    <div class="text-indigo-400 font-bold text-lg mb-8">₪ Portfolio</div>
    <nav class="flex flex-col gap-1">
      <button class="nav-btn active" data-screen="dashboard">📊 לוח בקרה</button>
      <button class="nav-btn" data-screen="assets">💼 נכסים</button>
      <button class="nav-btn" data-screen="charts">📈 גרפים</button>
      <button class="nav-btn" data-screen="reports">📄 דוחות</button>
    </nav>
    <div id="prices-status" class="mt-auto text-xs text-gray-500"></div>
  </aside>

  <!-- Main content -->
  <main class="mr-56 flex-1 p-8 min-h-screen">
    <div id="screen-dashboard" class="screen"></div>
    <div id="screen-assets" class="screen hidden"></div>
    <div id="screen-charts" class="screen hidden"></div>
    <div id="screen-reports" class="screen hidden"></div>
  </main>

  <!-- Edit/Add Asset Modal -->
  <div id="modal-overlay" class="hidden fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
    <div class="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md">
      <h3 id="modal-title" class="text-lg font-semibold mb-4">עריכת נכס</h3>
      <form id="asset-form" class="flex flex-col gap-3">
        <input type="hidden" id="form-asset-id">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="text-xs text-gray-400">שם הנכס</label>
            <input id="form-name" type="text" class="form-input w-full" required>
          </div>
          <div>
            <label class="text-xs text-gray-400">קטגוריה</label>
            <select id="form-category" class="form-input w-full">
              <option>פנסיה</option>
              <option>קרן השתלמות</option>
              <option>קופת גמל</option>
              <option>ביטוח מנהלים</option>
              <option>מסחר</option>
              <option>קריפטו</option>
              <option>חסכון</option>
              <option>הלוואה</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-400">בעלות</label>
            <select id="form-owner" class="form-input w-full">
              <option>יהונתן</option>
              <option>יעל</option>
              <option>משותף</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-400">ערך נוכחי</label>
            <input id="form-value" type="number" step="0.01" class="form-input w-full" required>
          </div>
          <div>
            <label class="text-xs text-gray-400">מטבע</label>
            <select id="form-currency" class="form-input w-full">
              <option value="ILS">₪ ILS</option>
              <option value="USD">$ USD</option>
              <option value="EUR">€ EUR</option>
              <option value="HKD">HKD</option>
              <option value="BTC">BTC</option>
              <option value="ADA">ADA</option>
              <option value="DOT">DOT</option>
              <option value="IOTA">IOTA</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-400">דמי ניהול %</label>
            <input id="form-fee" type="number" step="0.01" class="form-input w-full" placeholder="אופציונלי">
          </div>
          <div class="col-span-2">
            <label class="text-xs text-gray-400">הערות</label>
            <input id="form-notes" type="text" class="form-input w-full" placeholder="אופציונלי">
          </div>
        </div>
        <div class="flex justify-between mt-2">
          <button type="button" id="btn-delete" class="text-red-400 text-sm hover:text-red-300 hidden">מחק נכס</button>
          <div class="flex gap-2 mr-auto">
            <button type="button" id="btn-cancel" class="px-4 py-2 text-sm bg-gray-800 rounded-lg hover:bg-gray-700">ביטול</button>
            <button type="submit" class="px-4 py-2 text-sm bg-indigo-600 rounded-lg hover:bg-indigo-500">שמור</button>
          </div>
        </div>
      </form>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" class="hidden fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm z-50"></div>

  <script src="/static/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `static/style.css`**

```css
.nav-btn {
  @apply text-right px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors w-full;
}
.nav-btn.active {
  @apply bg-indigo-600 text-white;
}
.form-input {
  @apply bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500;
}
.stat-card {
  @apply bg-gray-900 border border-gray-800 rounded-xl p-4;
}
.asset-row {
  @apply border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors;
}
.screen { @apply w-full; }
.badge {
  @apply inline-block px-2 py-0.5 rounded text-xs font-medium;
}
```

- [ ] **Step 3: Verify the page loads**

```bash
python run.py &
sleep 2
curl -s http://localhost:8000/ | grep "Portfolio Tracker"
kill %1
```

Expected: prints `<title>Portfolio Tracker</title>`

- [ ] **Step 4: Commit**

```bash
git add templates/index.html static/style.css
git commit -m "feat: full HTML template with sidebar layout"
```

---

## Task 8: Frontend JavaScript

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Write `static/app.js`** (full file)

```javascript
// ─── State ───────────────────────────────────────────────────────────────────
let assets = [];
let prices = { fx: {}, crypto: {}, error: null };
let chartInstances = {};

// ─── Utilities ───────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n) => new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 }).format(n);
const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

function toILS(value, currency) {
  if (currency === 'ILS') return value;
  if (['BTC', 'ADA', 'DOT', 'IOTA'].includes(currency)) {
    return value * (prices.crypto[currency] || 0);
  }
  return value * (prices.fx[currency] || 0);
}

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm z-50 ${isError ? 'bg-red-900 text-red-200' : 'bg-gray-800 text-white'}`;
  setTimeout(() => el.classList.add('hidden'), 3000);
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

// ─── Navigation ──────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.remove('hidden');
  document.querySelector(`[data-screen="${name}"]`).classList.add('active');
  if (name === 'dashboard') renderDashboard();
  if (name === 'assets') renderAssets();
  if (name === 'charts') renderCharts();
  if (name === 'reports') renderReports();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => showScreen(btn.dataset.screen));
});

// ─── API ─────────────────────────────────────────────────────────────────────
async function fetchAssets() {
  const res = await fetch('/api/assets');
  assets = await res.json();
}

async function fetchPrices() {
  try {
    const res = await fetch('/api/prices');
    prices = await res.json();
    const status = document.getElementById('prices-status');
    if (prices.error) {
      status.textContent = '⚠️ מחירים לא עודכנו';
      status.classList.add('text-yellow-600');
    } else {
      status.textContent = 'מחירים עודכנו ✓';
    }
  } catch (e) {
    prices = { fx: {}, crypto: {}, error: e.message };
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
function renderDashboard() {
  const totalILS = assets.reduce((sum, a) => sum + toILS(a.current_value, a.currency), 0);

  const byCategory = {};
  assets.forEach(a => {
    const ils = toILS(a.current_value, a.currency);
    byCategory[a.category] = (byCategory[a.category] || 0) + ils;
  });

  const screen = document.getElementById('screen-dashboard');
  screen.innerHTML = `
    <h2 class="text-2xl font-bold mb-6">לוח בקרה</h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <div class="stat-card col-span-2">
        <div class="text-sm text-gray-400 mb-1">סה"כ תיק</div>
        <div class="text-3xl font-bold text-indigo-400">${fmt(totalILS)}</div>
      </div>
      ${Object.entries(byCategory).map(([cat, val]) => `
        <div class="stat-card">
          <div class="text-xs text-gray-400 mb-1">${cat}</div>
          <div class="text-lg font-semibold">${fmt(val)}</div>
          <div class="text-xs text-gray-500">${((val / totalILS) * 100).toFixed(1)}%</div>
        </div>
      `).join('')}
    </div>
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-6" style="max-width:480px">
      <h3 class="text-sm font-semibold text-gray-400 mb-4">חלוקת תיק לפי קטגוריה</h3>
      <canvas id="pie-chart"></canvas>
    </div>
  `;

  destroyChart('pie-chart');
  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316'];
  chartInstances['pie-chart'] = new Chart(document.getElementById('pie-chart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(byCategory),
      datasets: [{ data: Object.values(byCategory), backgroundColor: COLORS }]
    },
    options: { plugins: { legend: { labels: { color: '#9ca3af' } } } }
  });
}

// ─── Assets Table ─────────────────────────────────────────────────────────────
const CATEGORY_ORDER = ['פנסיה','קרן השתלמות','קופת גמל','ביטוח מנהלים','מסחר','קריפטו','חסכון','הלוואה'];

function renderAssets() {
  const screen = document.getElementById('screen-assets');
  const grouped = {};
  CATEGORY_ORDER.forEach(cat => { grouped[cat] = []; });
  assets.forEach(a => { if (grouped[a.category]) grouped[a.category].push(a); });

  screen.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">נכסים</h2>
      <button onclick="openAddModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm">+ נכס חדש</button>
    </div>
    ${CATEGORY_ORDER.filter(cat => grouped[cat].length > 0).map(cat => `
      <div class="mb-8">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">${cat}</h3>
        <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table class="w-full text-sm">
            <thead class="border-b border-gray-800">
              <tr class="text-xs text-gray-500">
                <th class="text-right py-2 px-4 font-medium">שם</th>
                <th class="text-right py-2 px-4 font-medium">בעלות</th>
                <th class="text-left py-2 px-4 font-medium">ערך מקורי</th>
                <th class="text-left py-2 px-4 font-medium">ערך ₪</th>
                <th class="text-left py-2 px-4 font-medium">דמי ניהול</th>
              </tr>
            </thead>
            <tbody>
              ${grouped[cat].map(a => `
                <tr class="asset-row" onclick="openEditModal(${a.id})">
                  <td class="py-3 px-4">${a.name}</td>
                  <td class="py-3 px-4"><span class="badge bg-gray-800 text-gray-300">${a.owner}</span></td>
                  <td class="py-3 px-4 text-left">${fmtNum(a.current_value)} ${a.currency}</td>
                  <td class="py-3 px-4 text-left font-medium">${fmt(toILS(a.current_value, a.currency))}</td>
                  <td class="py-3 px-4 text-left text-gray-400">${a.management_fee ? a.management_fee + '%' : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('')}
  `;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(asset = null) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-title').textContent = asset ? 'עריכת נכס' : 'נכס חדש';
  document.getElementById('form-asset-id').value = asset?.id || '';
  document.getElementById('form-name').value = asset?.name || '';
  document.getElementById('form-category').value = asset?.category || 'חסכון';
  document.getElementById('form-owner').value = asset?.owner || 'יהונתן';
  document.getElementById('form-value').value = asset?.current_value || '';
  document.getElementById('form-currency').value = asset?.currency || 'ILS';
  document.getElementById('form-fee').value = asset?.management_fee || '';
  document.getElementById('form-notes').value = asset?.notes || '';
  document.getElementById('btn-delete').classList.toggle('hidden', !asset);
}

function openEditModal(id) { openModal(assets.find(a => a.id === id)); }
function openAddModal() { openModal(null); }

document.getElementById('btn-cancel').addEventListener('click', () => {
  document.getElementById('modal-overlay').classList.add('hidden');
});

document.getElementById('btn-delete').addEventListener('click', async () => {
  const id = parseInt(document.getElementById('form-asset-id').value);
  if (!confirm('למחוק את הנכס הזה?')) return;
  await fetch(`/api/assets/${id}`, { method: 'DELETE' });
  document.getElementById('modal-overlay').classList.add('hidden');
  await fetchAssets();
  showScreen('assets');
  showToast('נכס נמחק');
});

document.getElementById('asset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('form-asset-id').value;
  const payload = {
    name: document.getElementById('form-name').value,
    category: document.getElementById('form-category').value,
    owner: document.getElementById('form-owner').value,
    current_value: parseFloat(document.getElementById('form-value').value),
    currency: document.getElementById('form-currency').value,
    management_fee: document.getElementById('form-fee').value ? parseFloat(document.getElementById('form-fee').value) : null,
    notes: document.getElementById('form-notes').value || null,
  };
  const url = id ? `/api/assets/${id}` : '/api/assets';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) { showToast('שגיאה בשמירה', true); return; }
  document.getElementById('modal-overlay').classList.add('hidden');
  await fetchAssets();
  showScreen('assets');
  showToast(id ? 'נכס עודכן' : 'נכס נוסף');
});

// ─── Charts ───────────────────────────────────────────────────────────────────
async function renderCharts() {
  const screen = document.getElementById('screen-charts');
  screen.innerHTML = `
    <h2 class="text-2xl font-bold mb-6">גרפים</h2>
    <div class="flex gap-4 mb-6">
      <select id="chart-asset-select" class="form-input" onchange="loadAssetChart()">
        <option value="">בחר נכס...</option>
        ${assets.map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
      </select>
      <select id="chart-range" class="form-input" onchange="loadAssetChart()">
        <option value="all">הכל</option>
        <option value="year">שנה</option>
        <option value="quarter">רבעון</option>
        <option value="month">חודש</option>
      </select>
    </div>
    <div id="chart-area" class="grid grid-cols-1 gap-6">
      <div class="text-gray-500 text-sm">בחר נכס לצפייה בגרף</div>
    </div>
  `;
}

async function loadAssetChart() {
  const assetId = document.getElementById('chart-asset-select').value;
  if (!assetId) return;
  const range = document.getElementById('chart-range').value;

  const res = await fetch(`/api/assets/${assetId}/history`);
  let history = await res.json();

  // Filter by range
  if (range !== 'all') {
    const days = { month: 30, quarter: 90, year: 365 }[range];
    const cutoff = Date.now() - days * 86400000;
    history = history.filter(s => new Date(s.recorded_at).getTime() >= cutoff);
  }
  if (history.length === 0) { document.getElementById('chart-area').innerHTML = '<div class="text-gray-500 text-sm">אין נתונים בטווח הזה</div>'; return; }

  const labels = history.map(s => new Date(s.recorded_at).toLocaleDateString('he-IL'));
  const values = history.map(s => toILS(s.value, s.currency));
  const firstVal = values[0];
  const pctChanges = values.map(v => firstVal ? ((v - firstVal) / firstVal * 100) : 0);

  destroyChart('value-chart');
  destroyChart('pct-chart');

  document.getElementById('chart-area').innerHTML = `
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div class="text-sm text-gray-400 mb-3">ערך מוחלט (₪)</div>
      <canvas id="value-chart"></canvas>
    </div>
    <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div class="text-sm text-gray-400 mb-3">שינוי באחוזים</div>
      <canvas id="pct-chart"></canvas>
    </div>
  `;

  const chartDefaults = {
    type: 'line',
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } },
        y: { ticks: { color: '#6b7280' }, grid: { color: '#1f2937' } }
      }
    }
  };

  chartInstances['value-chart'] = new Chart(document.getElementById('value-chart'), {
    ...chartDefaults,
    data: { labels, datasets: [{ data: values, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', fill: true, tension: 0.3, pointRadius: 3 }] }
  });

  chartInstances['pct-chart'] = new Chart(document.getElementById('pct-chart'), {
    ...chartDefaults,
    data: { labels, datasets: [{ data: pctChanges, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.3, pointRadius: 3 }] }
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────
async function renderReports(range = 'all') {
  const screen = document.getElementById('screen-reports');
  screen.innerHTML = `<div class="text-gray-400 text-sm">טוען...</div>`;

  const res = await fetch(`/api/report?range=${range}`);
  const data = await res.json();

  const changeCell = (abs, pct) => {
    const color = abs >= 0 ? 'text-green-400' : 'text-red-400';
    return `<td class="px-4 py-3 text-left ${color}">${fmt(abs)}</td><td class="px-4 py-3 text-left ${color}">${fmtPct(pct)}</td>`;
  };

  screen.innerHTML = `
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-2xl font-bold">דוחות</h2>
      <div class="flex gap-3">
        <select class="form-input" onchange="renderReports(this.value)">
          <option value="all">הכל</option>
          <option value="year">שנה</option>
          <option value="quarter">רבעון</option>
          <option value="month">חודש</option>
          <option value="week">שבוע</option>
        </select>
        <a href="/api/export" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">ייצוא CSV ⬇</a>
      </div>
    </div>

    <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">לפי קטגוריה</h3>
    <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-8">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-800">
          <tr class="text-xs text-gray-500">
            <th class="text-right px-4 py-2">קטגוריה</th>
            <th class="text-left px-4 py-2">ערך ראשון ₪</th>
            <th class="text-left px-4 py-2">ערך נוכחי ₪</th>
            <th class="text-left px-4 py-2">שינוי ₪</th>
            <th class="text-left px-4 py-2">שינוי %</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(data.by_category).map(([cat, d]) => `
            <tr class="border-b border-gray-800">
              <td class="px-4 py-3 font-medium">${cat}</td>
              <td class="px-4 py-3 text-left">${fmt(d.first_value)}</td>
              <td class="px-4 py-3 text-left">${fmt(d.current_value)}</td>
              ${changeCell(d.change_abs, d.change_pct)}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">לפי נכס</h3>
    <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-800">
          <tr class="text-xs text-gray-500">
            <th class="text-right px-4 py-2">שם</th>
            <th class="text-right px-4 py-2">קטגוריה</th>
            <th class="text-left px-4 py-2">ערך ראשון</th>
            <th class="text-left px-4 py-2">ערך נוכחי</th>
            <th class="text-left px-4 py-2">שינוי ₪</th>
            <th class="text-left px-4 py-2">שינוי %</th>
          </tr>
        </thead>
        <tbody>
          ${data.by_asset.map(a => `
            <tr class="border-b border-gray-800">
              <td class="px-4 py-3">${a.name}</td>
              <td class="px-4 py-3 text-gray-400">${a.category}</td>
              <td class="px-4 py-3 text-left">${fmtNum(a.first_value)} ${a.currency}</td>
              <td class="px-4 py-3 text-left">${fmtNum(a.current_value)} ${a.currency}</td>
              ${changeCell(a.change_abs, a.change_pct)}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  await Promise.all([fetchAssets(), fetchPrices()]);
  showScreen('dashboard');
})();
```

- [ ] **Step 2: Start server and verify in browser**

```bash
python run.py
```

Open `http://localhost:8000` — verify:
- Sidebar renders with 4 nav buttons
- Dashboard shows total and category cards
- Pie chart renders
- "נכסים" screen shows assets grouped by category
- Clicking a row opens edit popup
- Save updates the asset
- "גרפים" screen — select an asset, chart renders
- "דוחות" screen shows tables, export CSV button downloads file

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "feat: full frontend — dashboard, assets table, charts, reports"
```

---

## Task 9: Final Integration Check

- [ ] **Step 1: Run full test suite**

```bash
pytest -v
```

Expected: all tests PASS.

- [ ] **Step 2: Verify import + live app**

```bash
# If not already imported:
python import_csv.py
python run.py
```

Open `http://localhost:8000` and verify:
- Dashboard shows correct total from imported assets
- Crypto values convert to ILS (or show warning if API failed)
- Edit a pension fund value → history screen shows 2 points on chart
- CSV export downloads correctly and opens in Excel

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: portfolio tracker complete"
```

---

## Running the App

```bash
pip install -r requirements.txt
python import_csv.py      # one time only
python run.py             # http://localhost:8000
```
