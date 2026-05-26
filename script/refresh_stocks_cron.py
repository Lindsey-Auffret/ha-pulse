import urllib.request, json, datetime

YF_BASE = "https://query1.finance.yahoo.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; HA-Pulse/1.0)", "Accept": "application/json"}

def yf_fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as r:
        return json.loads(r.read())

def fetch_fx(pair):
    try:
        d = yf_fetch(f"{YF_BASE}/v8/finance/chart/{pair}?interval=1d&range=5d")
        meta = d["chart"]["result"][0]["meta"]
        return meta.get("regularMarketPrice") or meta.get("previousClose")
    except Exception as e:
        print(f"FX {pair} failed: {e}"); return None

def fetch_quote(ticker):
    try:
        d = yf_fetch(f"{YF_BASE}/v8/finance/chart/{ticker}?interval=1d&range=5d")
        return d["chart"]["result"][0]["meta"]
    except Exception as e:
        print(f"Quote {ticker} failed: {e}"); return None

def fetch_history(ticker):
    try:
        d = yf_fetch(f"{YF_BASE}/v8/finance/chart/{ticker}?interval=1wk&range=1y")
        result = d["chart"]["result"][0]
        timestamps = result.get("timestamps") or result.get("timestamp", [])
        closes = result["indicators"]["quote"][0]["close"]
        pts = []
        for i, ts in enumerate(timestamps):
            c = closes[i]
            if c is None or c != c: continue
            pts.append({"date": datetime.datetime.fromtimestamp(ts, datetime.UTC).strftime("%Y-%m-%d"), "close": round(c, 2)})
        return sorted(pts, key=lambda x: x["date"])
    except Exception as e:
        print(f"History {ticker} failed: {e}"); return []

chf_usd = fetch_fx("CHFUSD=X") or 1.12
dkk_usd = fetch_fx("DKKUSD=X") or 0.145
eur_usd = fetch_fx("EURUSD=X") or 1.08

FX_TO_USD = {"CHF": chf_usd, "DKK": dkk_usd, "EUR": eur_usd, "USD": 1.0}

HA_STOCKS = [
    {"ticker": "SOON.SW",    "name": "Sonova Holding AG",  "currency": "CHF", "exchange": "SIX Swiss",           "ciCompany": "Sonova (Phonak)",        "role": "Parent"},
    {"ticker": "DEMANT.CO",  "name": "Demant A/S",         "currency": "DKK", "exchange": "Nasdaq Copenhagen",   "ciCompany": "Demant (Oticon)",        "role": "Parent"},
    {"ticker": "GN.CO",      "name": "GN Audio A/S",       "currency": "DKK", "exchange": "Nasdaq Copenhagen",   "ciCompany": "GN Audio (ReSound/Jabra)", "role": "Direct"},
]

quotes = []
history = {}

for stock in HA_STOCKS:
    meta = fetch_quote(stock["ticker"])
    hist = fetch_history(stock["ticker"])
    native_currency = (meta.get("currency") if meta else None) or stock["currency"]
    fx_to_usd = FX_TO_USD.get(native_currency, 1.0)
    price_native = (meta.get("regularMarketPrice") or meta.get("previousClose") or 0) if meta else 0
    prev_native  = (meta.get("previousClose") or price_native) if meta else 0
    change_native = price_native - prev_native
    change_pct = (change_native / prev_native * 100) if prev_native else 0
    market_cap = (meta.get("marketCap") or None) if meta else None
    print(f"  {stock['ticker']}: {price_native:.2f} {native_currency}")
    quotes.append({
        "ticker": stock["ticker"], "name": stock["name"],
        "currency": native_currency,
        "price": round(price_native, 2),
        "change": round(change_native, 2), "changePercent": round(change_pct, 2),
        "marketCap": round(market_cap) if market_cap else None, "pe": None,
        "yearLow": round((meta.get("fiftyTwoWeekLow") or 0), 2) if meta else 0,
        "yearHigh": round((meta.get("fiftyTwoWeekHigh") or 0), 2) if meta else 0,
        "previousClose": round(prev_native, 2),
        "exchange": (meta.get("exchangeName") or meta.get("fullExchangeName") or stock["exchange"]) if meta else stock["exchange"],
        "ciCompany": stock["ciCompany"], "role": stock["role"],
        "fetchedAt": datetime.datetime.now(datetime.UTC).isoformat(),
        "fxToUsd": round(fx_to_usd, 6),
    })
    history[stock["ticker"]] = hist

payload = {
    "quotes": quotes, "history": history,
    "fxRates": {
        "CHFUSD": round(chf_usd, 6),
        "DKKUSD": round(dkk_usd, 6),
        "EURUSD": round(eur_usd, 6),
        "fetchedAt": datetime.datetime.now(datetime.UTC).isoformat(),
    },
    "lastUpdated": datetime.datetime.now(datetime.UTC).isoformat(),
}

with open("/home/user/workspace/ha-dashboard/stocks.json", "w") as f:
    json.dump(payload, f)
print("stocks.json updated")
