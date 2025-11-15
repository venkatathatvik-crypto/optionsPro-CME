# backend/main.py
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from apscheduler.schedulers.background import BackgroundScheduler
from database import get_db, engine
from models import OptionData, StockData, Base
from services.ingestion import fetch_and_store
from services.ai_analyzer import calculate_pcr, get_market_sentiment_insight
import logging
import os
from dotenv import load_dotenv
import threading  # <--- IMPORT THIS
import yfinance as yf
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import requests
from datetime import datetime

# Load .env variables
load_dotenv()

# --- Database & App Initialization ---
Base.metadata.create_all(bind=engine)

app = FastAPI(title="CMEProject Data Pipeline API")

# --- CORS (Cross-Origin Resource Sharing) ---
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(',')

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper for non-blocking startup fetch ---
def run_initial_fetch():
    """
    This function runs our blocking I/O (Playwright) in a separate thread
    so it doesn't kill the FastAPI startup event.
    """
    logging.info("--- (Thread) Starting Initial Data Ingestion ---")
    try:
        fetch_and_store('NIFTY')
        fetch_and_store('BANKNIFTY')
        fetch_and_store('FINNIFTY')
        logging.info("--- (Thread) Initial Data Ingestion Complete ---")
    except Exception as e:
        logging.error(f"Initial data fetch failed in thread: {e}")

# --- Background Scheduler ---
scheduler = BackgroundScheduler(daemon=True)
scheduler.add_job(fetch_and_store, 'interval', seconds=60, args=['NIFTY'], id='job_nifty')
scheduler.add_job(fetch_and_store, 'interval', seconds=60, args=['BANKNIFTY'], id='job_banknifty')
scheduler.add_job(fetch_and_store, 'interval', seconds=60, args=['FINNIFTY'], id='job_finnifty')


@app.on_event("startup")
def startup_event():
    logging.info("--- Starting Data Ingestion Pipeline (in background thread) ---")
    
    # Run the blocking fetch_and_store calls in a separate thread
    # This "fires and forgets", unblocking the main server
    threading.Thread(target=run_initial_fetch).start()
    
    logging.info("Starting background scheduler...")
    scheduler.start()  # This is non-blocking and fine


@app.on_event("shutdown")
def shutdown_event():
    logging.info("Shutting down scheduler...")
    scheduler.shutdown()


# --- Pydantic Models ---
class ChartData(BaseModel):
    time: str
    price: float


class HistoricalResponse(BaseModel):
    symbol: str
    data: List[ChartData]


class SentimentResponse(BaseModel):
    symbol: str
    pcr: float
    insight: str


class NewsArticle(BaseModel):
    title: str
    description: Optional[str] = None
    url: str
    source: Optional[str] = None
    publishedAt: Optional[str] = None


class NewsResponse(BaseModel):
    symbol: str
    query: str
    articles: List[NewsArticle]


class StrikeAnalytics(BaseModel):
    strike: float
    ce_oi: int
    pe_oi: int
    ce_vol: int
    pe_vol: int
    ce_iv: float
    pe_iv: float
    ce_oi_change: int
    pe_oi_change: int


class AnalyticsResponse(BaseModel):
    symbol: str
    timestamp: str
    pcr: float
    strikes: List[StrikeAnalytics]


# --- API Endpoints ---
@app.get("/")
def read_root():
    return {"message": "Data Pipeline is running."}


@app.get("/api/v1/option-chain/{symbol}")
def get_option_chain(symbol: str, db: Session = Depends(get_db)):
    """
    This is the main endpoint for the frontend.
    It queries our database, not the NSE.
    """
    try:
        symbol = symbol.upper()
        
        # 1. Get the latest stock data
        stock_data = db.query(StockData).filter(StockData.symbol == symbol).first()
        
        if not stock_data:
            return {"error": f"Symbol not found. Is the initial data fetch complete?"}
        
        # 2. Get all option legs for that symbol
        # This data is fresh because our scheduler is running
        option_legs = db.query(OptionData).filter(OptionData.symbol == symbol).all()
        
        if not option_legs:
            return {"error": f"Stock data found, but no option chain data for {symbol}."}
        
        # 3. Format the data to match the frontend 'types.ts' contract
        return {
            "symbol": stock_data.symbol,
            "underlyingPrice": stock_data.underlying_value,
            "timestamp": stock_data.timestamp.isoformat(),  # Get the data's timestamp
            "expiryDate": option_legs[0].expiry_date.isoformat(),  # Assume all have same expiry for this pull
            "legs": [
                {
                    "strike": leg.strike_price,
                    "type": leg.option_type,
                    "lastPrice": leg.last_price,
                    "iv": leg.iv,
                    "oi": leg.oi,
                    "volume": leg.volume,
                    "delta": leg.delta,
                    "gamma": leg.gamma,
                    "theta": leg.theta,
                    "vega": leg.vega,
                } for leg in option_legs
            ]
        }
    except Exception as e:
        logging.error(f"Error in get_option_chain for {symbol}: {e}")
        return {"error": "An internal server error occurred."}


@app.get("/api/v1/historical-price/{symbol}", response_model=HistoricalResponse)
def get_historical_price(symbol: str):
    """
    Fetches 30 days of historical price data for a symbol.
    """
    symbol = symbol.upper()
    ticker_str = ""
    
    # Map our app symbols to yfinance tickers
    if symbol == 'NIFTY':
        ticker_str = '^NSEI'
    elif symbol == 'BANKNIFTY':
        ticker_str = '^NSEBANK'
    elif symbol == 'FINNIFTY':
        ticker_str = '^NSEBANK'  # yfinance doesn't have FINNIFTY, use BANKNIFTY as a proxy
    else:
        return {"error": "Invalid symbol for historical data"}
    
    try:
        ticker = yf.Ticker(ticker_str)
        hist = ticker.history(period="30d")
        
        if hist.empty:
            return {"error": "No historical data found for symbol"}
        
        # Reset index to make 'Date' a column
        hist = hist.reset_index()
        
        # Format the data to match the frontend chart's expectation
        chart_data = []
        for index, row in hist.iterrows():
            chart_data.append(ChartData(
                time=row['Date'].strftime('%b %d'),  # Formats date as "Nov 07"
                price=round(row['Close'], 2)
            ))
        
        return HistoricalResponse(symbol=symbol, data=chart_data)
    except Exception as e:
        logging.error(f"Error fetching historical data: {e}")
        return {"error": "Failed to fetch historical data"}


@app.get("/api/v1/sentiment/{symbol}", response_model=SentimentResponse)
def get_market_sentiment(symbol: str, db: Session = Depends(get_db)):
    """
    Calculates key metrics and returns an AI-generated sentiment insight.
    """
    try:
        symbol = symbol.upper()
        
        # 1. Calculate PCR from our database
        pcr = calculate_pcr(db, symbol)
        
        # 2. Get AI insight
        insight = get_market_sentiment_insight(symbol, pcr)
        
        return SentimentResponse(
            symbol=symbol,
            pcr=pcr,
            insight=insight
        )
    except Exception as e:
        logging.error(f"Error in sentiment endpoint: {e}")
        # Return a valid response even on error
        return SentimentResponse(
            symbol=symbol,
            pcr=0.0,
            insight="Error: Could not calculate sentiment."
        )


@app.get("/api/v1/news", response_model=NewsResponse)
def get_news(symbol: str = "NIFTY"):
    """
    Curated news for an underlying symbol using NewsAPI.
    Requires NEWSAPI_KEY in environment.
    """
    try:
        api_key = os.getenv("NEWSAPI_KEY")
        if not api_key:
            return NewsResponse(symbol=symbol.upper(), query="", articles=[])

        # Build a curated query depending on index
        s = symbol.upper()
        if s in ["NIFTY", "NIFTY50", "NIFTY 50"]:
            q = "NIFTY 50 options OR NIFTY options OR NSE derivatives"
        elif s in ["BANKNIFTY", "BANK NIFTY"]:
            q = "BANKNIFTY options OR bank nifty volatility OR NSE bank index"
        elif s in ["FINNIFTY", "FIN NIFTY"]:
            q = "FINNIFTY options OR financials volatility NSE"
        else:
            q = f"{s} options OR {s} volatility OR NSE {s}"

        url = "https://newsapi.org/v2/everything"
        params = {
            "q": q,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 10,
            "apiKey": api_key,
        }
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()

        articles = []
        for a in data.get("articles", [])[:10]:
            articles.append(NewsArticle(
                title=a.get("title") or "",
                description=a.get("description"),
                url=a.get("url") or "",
                source=(a.get("source") or {}).get("name"),
                publishedAt=a.get("publishedAt"),
            ))

        return NewsResponse(symbol=s, query=q, articles=articles)
    except Exception as e:
        logging.error(f"News endpoint error: {e}")
        return NewsResponse(symbol=symbol.upper(), query="", articles=[])


@app.get("/api/v1/analytics/{symbol}", response_model=AnalyticsResponse)
def get_analytics(symbol: str, db: Session = Depends(get_db)):
    """
    Returns per-strike analytics for latest snapshot and change vs previous snapshot.
    Includes OI, Volume, IV for CE/PE and OI change.
    """
    try:
        s = symbol.upper()

        # Get the two most recent timestamps for this symbol
        latest_ts_row = db.query(OptionData.timestamp).filter(OptionData.symbol == s).order_by(OptionData.timestamp.desc()).limit(2).all()
        if not latest_ts_row:
            return AnalyticsResponse(symbol=s, timestamp="", pcr=0.0, strikes=[])

        latest_ts = latest_ts_row[0][0]
        prev_ts = latest_ts_row[1][0] if len(latest_ts_row) > 1 else None

        # Fetch latest snapshot rows
        latest_rows = db.query(OptionData).filter(OptionData.symbol == s, OptionData.timestamp == latest_ts).all()

        # Fetch previous snapshot rows if available
        prev_rows = []
        if prev_ts:
            prev_rows = db.query(OptionData).filter(OptionData.symbol == s, OptionData.timestamp == prev_ts).all()

        # Build maps for quick lookup: {(strike, type): oi}
        prev_oi_map: Dict[tuple, int] = {}
        for r in prev_rows:
            key = (float(r.strike_price), r.option_type)
            prev_oi_map[key] = int(r.oi or 0)

        # Aggregate by strike
        strike_map: Dict[float, Dict[str, Any]] = {}
        for r in latest_rows:
            strike = float(r.strike_price)
            t = r.option_type
            if strike not in strike_map:
                strike_map[strike] = {
                    "ce_oi": 0,
                    "pe_oi": 0,
                    "ce_vol": 0,
                    "pe_vol": 0,
                    "ce_iv": 0.0,
                    "pe_iv": 0.0,
                    "ce_oi_change": 0,
                    "pe_oi_change": 0,
                }
            entry = strike_map[strike]

            if t == "CE":
                entry["ce_oi"] = int(r.oi or 0)
                entry["ce_vol"] = int(r.volume or 0)
                entry["ce_iv"] = float(r.iv or 0.0)
                prev_val = prev_oi_map.get((strike, "CE"), 0)
                entry["ce_oi_change"] = int(r.oi or 0) - int(prev_val or 0)
            else:
                entry["pe_oi"] = int(r.oi or 0)
                entry["pe_vol"] = int(r.volume or 0)
                entry["pe_iv"] = float(r.iv or 0.0)
                prev_val = prev_oi_map.get((strike, "PE"), 0)
                entry["pe_oi_change"] = int(r.oi or 0) - int(prev_val or 0)

        # Convert to response objects sorted by strike
        strike_items = []
        for strike in sorted(strike_map.keys()):
            v = strike_map[strike]
            strike_items.append(StrikeAnalytics(
                strike=strike,
                ce_oi=v["ce_oi"],
                pe_oi=v["pe_oi"],
                ce_vol=v["ce_vol"],
                pe_vol=v["pe_vol"],
                ce_iv=round(v["ce_iv"], 2),
                pe_iv=round(v["pe_iv"], 2),
                ce_oi_change=v["ce_oi_change"],
                pe_oi_change=v["pe_oi_change"],
            ))

        # PCR from existing helper
        pcr = calculate_pcr(db, s)

        return AnalyticsResponse(
            symbol=s,
            timestamp=latest_ts.isoformat() if isinstance(latest_ts, datetime) else str(latest_ts),
            pcr=pcr,
            strikes=strike_items,
        )
    except Exception as e:
        logging.error(f"Analytics endpoint error: {e}")
        return AnalyticsResponse(symbol=symbol.upper(), timestamp="", pcr=0.0, strikes=[])


