from flask import Flask, request, Response, jsonify
import os
import requests
from flask_cors import CORS
from dotenv import load_dotenv
import logging
from functools import lru_cache
import time
from datetime import datetime
from routes import analytics_routes
from bq_sales import bq_sales
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_talisman import Talisman
  # Importera blueprinten för BigQuery-försäljningsdata

# Sätt upp loggning med detaljerad formattering
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()  # Ladda miljövariabler från .env

app = Flask(__name__)
CORS(app)  # Möjliggör anrop från din frontend

# Registrera blueprintsen
app.register_blueprint(analytics_routes, url_prefix='/api')
app.register_blueprint(bq_sales, url_prefix='/api')  # nu finns /api/bq_sales

CENTRA_API_TOKEN = os.environ.get("CENTRA_API_TOKEN")
CENTRA_API_URL = os.environ.get("CENTRA_API_ENDPOINT", "https://scottsberry.centra.com/graphql")

# Cache för GraphQL-anrop
CACHE_DURATION = 300  # 5 minuter i sekunder
query_cache = {}

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Aktivera säkerhetsheaders
Talisman(app, 
    force_https=True,
    strict_transport_security=True,
    content_security_policy={
        'default-src': "'self'",
        'img-src': '*',
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"]
    }
)

class GraphQLError(Exception):
    """Custom exception för GraphQL-relaterade fel"""
    def __init__(self, message, code=400):
        self.message = message
        self.code = code
        super().__init__(self.message)

def clear_expired_cache():
    """Rensar utgången cache"""
    current_time = time.time()
    expired_keys = [k for k, v in query_cache.items() if current_time - v['timestamp'] > CACHE_DURATION]
    for k in expired_keys:
        del query_cache[k]

@lru_cache(maxsize=100)
def get_cached_query(query_hash):
    """Hämtar cachad query om den finns och är giltig"""
    if query_hash in query_cache:
        cache_entry = query_cache[query_hash]
        if time.time() - cache_entry['timestamp'] <= CACHE_DURATION:
            logger.debug(f"Cache hit för query: {query_hash[:20]}...")
            return cache_entry['data']
    return None

def cache_query(query_hash, data):
    """Cachar query-resultat"""
    query_cache[query_hash] = {
        'data': data,
        'timestamp': time.time()
    }
    clear_expired_cache()

def validate_graphql_request(data):
    """Validerar inkommande GraphQL-förfrågan"""
    if not isinstance(data, dict):
        raise GraphQLError("Invalid request format")
    if 'query' not in data:
        raise GraphQLError("Missing GraphQL query")
    return True

def log_request_metrics(start_time, query):
    """Loggar metriker för förfrågan"""
    duration = time.time() - start_time
    logger.info(f"GraphQL förfrågan tog {duration:.2f} sekunder")
    logger.info(f"Query typ: {query[:50]}...")

@app.route("/")
def index():
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    })

@app.route("/api/graphql", methods=['POST'])
@limiter.limit("100 per minute")
def proxy_graphql():
    start_time = time.time()
    
    try:
        if not CENTRA_API_TOKEN:
            raise GraphQLError("API token saknas")

        data = request.json
        validate_graphql_request(data)
        
        # Skapa en enkel hash av queryn för caching
        query_hash = str(hash(str(data)))
        
        # Försök hämta från cache
        cached_response = get_cached_query(query_hash)
        if cached_response:
            return jsonify(cached_response)

        # Sätt upp headers för Centra API
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CENTRA_API_TOKEN}"
        }
        
        # Gör anropet till Centra
        response = requests.post(
            CENTRA_API_URL,
            json=data,
            headers=headers,
            timeout=30
        )

        # Logga metriker
        log_request_metrics(start_time, data.get('query', ''))
        
        if not response.ok:
            logger.error(f"Centra API fel: {response.text}")
            return Response(
                response.text,
                status=response.status_code,
                content_type='application/json'
            )

        # Cacha framgångsrikt svar
        response_data = response.json()
        cache_query(query_hash, response_data)
        
        return jsonify(response_data)

    except GraphQLError as e:
        logger.error(f"GraphQL-fel: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("Ett oväntat fel uppstod")
        return jsonify({"error": "Internt serverfel", "details": str(e)}), 500

# Lägg till en custom error handler
@app.errorhandler(Exception)
def handle_exception(e):
    logger.exception("Oväntat fel")
    return jsonify({
        "error": "Internt serverfel",
        "message": str(e),
        "timestamp": datetime.now().isoformat()
    }), 500

# Förbättra GraphQL error handling
@app.errorhandler(GraphQLError)
def handle_graphql_error(e):
    logger.error(f"GraphQL fel: {e.message}")
    return jsonify({
        "error": "GraphQL fel",
        "message": e.message,
        "timestamp": datetime.now().isoformat()
    }), e.code

if __name__ == "__main__":
    app.run(port=5000, debug=True)
