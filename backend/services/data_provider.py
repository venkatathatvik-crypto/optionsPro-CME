# backend/services/data_provider.py
import logging
import json

try:
    from playwright.sync_api import sync_playwright  # type: ignore
    _PLAYWRIGHT_OK = True
except Exception as _e:
    _PLAYWRIGHT_OK = False
    logging.warning(f"Playwright not available: {_e}")

# Set up logging
logger = logging.getLogger(__name__)


class DataProvider:
    """
    Manages data fetching from the 'unofficial' NSE public API using a headless browser (Playwright)
    to bypass bot detection. THIS VERSION USES FIREFOX.
    """
    
    BASE_URL = "https://www.nseindia.com"
    API_BASE = f"{BASE_URL}/api"
    
    # These are the same headers, Playwright will use them
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:99.0) Gecko/20100101 Firefox/99.0",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.5",
    }
    
    INDICES = ["NIFTY", "BANKNIFTY", "FINNIFTY"]
    
    def __init__(self):
        logger.info("Initializing NSE DataProvider (Playwright/Firefox Mode)...")
        # We don't do anything in init. The magic happens in the get call.
    
    def get_option_chain(self, symbol: str) -> dict:
        """
        Fetches the live option chain for a given symbol (index or stock).
        """
        symbol = symbol.upper()
        
        if symbol in self.INDICES:
            api_url = f"{self.API_BASE}/option-chain-indices?symbol={symbol}"
        else:
            api_url = f"{self.API_BASE}/option-chain-equities?symbol={symbol}"
        
        logger.info(f"Launching headless FIREFOX for {symbol}...")
        if not _PLAYWRIGHT_OK:
            return {"error": True, "message": "playwright_unavailable"}
        try:
            with sync_playwright() as p:  # type: ignore
                browser = p.firefox.launch(headless=True)
                context = browser.new_context(extra_http_headers=self.HEADERS)
                page = context.new_page()
                logger.info(f"Priming session at {self.BASE_URL}")
                page.goto(self.BASE_URL, timeout=60000)
                logger.info(f"Fetching option chain for: {symbol} from {api_url}")
                page.goto(api_url, timeout=60000)
                content = page.inner_text('pre')
                data = json.loads(content)
                browser.close()
                logger.info(f"Successfully fetched data for {symbol} (Playwright/Firefox)")
                return data
        except Exception as e:
            logger.error(f"Playwright failed to fetch {symbol}: {e}")
            return {"error": True, "message": f"playwright_failed: {e}"}
