from flask import Blueprint, request, jsonify
import os
from dotenv import load_dotenv
load_dotenv()  # Ladda miljövariabler från .env
from google.cloud import bigquery
import pytz
from datetime import datetime, timedelta
import threading
from apscheduler.schedulers.background import BackgroundScheduler

# Skapa en blueprint för BigQuery-försäljningsdata
bq_sales = Blueprint('bq_sales', __name__)

# Global cache för försäljningsdata från BigQuery
cached_sales_data = []
cache_last_updated = None
cache_lock = threading.Lock()

# Konfiguration för BigQuery
BQ_TABLE = "my-project-db-433615.Info.SKU_sb"

def fetch_sales_data_from_bq():
    """
    Hämtar försäljningsdata från BigQuery och cachar den
    """
    global cached_sales_data, cache_last_updated
    client = bigquery.Client()
    
    # Kolla SKU_sb tabellen (debug)
    print("\nDEBUG - SKU_sb data:")
    query1 = """
    SELECT DISTINCT
        product_name,
        productNumber
    FROM `my-project-db-433615.Info.SKU_sb`
    LIMIT 5
    """
    results1 = client.query(query1).result()
    for row in results1:
        print(f"SKU_sb - Product: {row.product_name}, Number: {row.productNumber}")

    # Kolla sku_info tabellen (debug)
    print("\nDEBUG - sku_info data:")
    query2 = """
    SELECT 
        productNumber,
        productType,
        collection
    FROM `my-project-db-433615.Info.sku_info`
    LIMIT 5
    """
    results2 = client.query(query2).result()
    for row in results2:
        print(f"sku_info - Number: {row.productNumber}, Type: {row.productType}, Collection: {row.collection}")

    # Debug-fråga för att hitta matchningar
    print("\nDEBUG - Söker matchningar:")
    debug_query = """
    SELECT DISTINCT
        s.productNumber as sb_number,
        i.productNumber as info_number,
        s.product_name,
        i.productType,
        i.collection
    FROM `my-project-db-433615.Info.SKU_sb` s
    INNER JOIN `my-project-db-433615.Info.sku_info` i
    ON s.productNumber = i.productNumber
    LIMIT 10
    """
    debug_results = client.query(debug_query).result()
    for row in debug_results:
        print(f"MATCH - Product: {row.product_name}")
        print(f"Numbers: {row.sb_number} = {row.info_number}")
        print(f"Type: {row.productType}, Collection: {row.collection}")
        print("---")

    # Huvudfrågan - uppdatera för att hantera tid korrekt
    query = """
    SELECT 
        s.order_uuid,
        s.order_number,
        s.order_date as order_date,
        s.status as order_status,
        s.country_name,
        s.country_code,
        s.grand_total_value,
        s.grand_total_currency,
        s.quantity,
        s.product_name,
        s.productNumber,
        s.unit_cost_value,
        s.unit_cost_currency,
        s.total_sek,
        i.id as product_id,
        i.status as product_status,
        i.isBundle,
        i.productType,
        i.collection,
        i.supplier
    FROM `my-project-db-433615.Info.SKU_sb` s
    INNER JOIN `my-project-db-433615.Info.sku_info` i
    ON TRIM(s.productNumber) = TRIM(i.productNumber)
    """
    query_job = client.query(query)
    results = query_job.result()
    data = []
    
    stockholm = pytz.timezone("Europe/Stockholm")
    for row in results:
        if row.order_date:
            # Hantera tiden som den kommer från databasen
            order_date_str = row.order_date.strftime("%Y-%m-%d %H:%M:%S")
        else:
            order_date_str = None

        data.append({
            "order_uuid": row.order_uuid,
            "order_number": row.order_number,
            "order_date": order_date_str,
            "order_status": row.order_status,
            "country_name": row.country_name,
            "country_code": row.country_code,
            "grand_total_value": row.grand_total_value,
            "grand_total_currency": row.grand_total_currency,
            "quantity": row.quantity,
            "product_name": row.product_name,
            "productNumber": row.productNumber,
            "unit_cost_value": row.unit_cost_value,
            "unit_cost_currency": row.unit_cost_currency,
            "total_sek": row.total_sek,
            "product_id": row.product_id,
            "product_status": row.product_status,
            "isBundle": row.isBundle,
            "productType": row.productType,
            "collection": row.collection,
            "supplier": row.supplier
        })
    
    with cache_lock:
        cached_sales_data = data
        cache_last_updated = datetime.now(stockholm).strftime("%Y-%m-%d %H:%M:%S")

def schedule_bq_sales_update():
    """
    Schemalägger en daglig uppdatering av BigQuery-försäljningsdata
    """
    scheduler = BackgroundScheduler(timezone="Europe/Stockholm")
    scheduler.add_job(fetch_sales_data_from_bq, "cron", hour=6, minute=0)
    scheduler.start()
    fetch_sales_data_from_bq()  # Initial fetch

# Ändra routen så den blir relativt blueprintens url_prefix
@bq_sales.route("/bq_sales", methods=["GET"])
def get_bq_sales():
    """
    Endpoint för att hämta aggregerad försäljningsdata
    """
    from_date = request.args.get("from_date")
    to_date = request.args.get("to_date")
    only_shipped = request.args.get("status") == "shipped"
    exclude_bundles = request.args.get("exclude_bundles") == "true"
    only_active = request.args.get("only_active") == "true"
    
    if not from_date or not to_date:
        return jsonify({"error": "Både from_date och to_date måste anges"}), 400
        
    try:
        datetime.strptime(from_date, "%Y-%m-%d")
        datetime.strptime(to_date, "%Y-%m-%d")
    except ValueError:
        return jsonify({"error": "Ogiltigt datumformat. Använd YYYY-MM-DD"}), 400

    data = aggregate_sales_data_by_date(from_date, to_date, only_shipped, exclude_bundles, only_active)
    return jsonify({
        "from_date": from_date,
        "to_date": to_date,
        "only_shipped": only_shipped,
        "exclude_bundles": exclude_bundles,
        "only_active": only_active,
        "aggregated_sales": data,
        "last_updated": cache_last_updated
    })

def aggregate_sales_data_by_date(from_date, to_date, only_shipped=False, exclude_bundles=False, only_active=False):
    """
    Filtrerar och aggregerar försäljningsdatan baserat på datum, status och productNumber.
    """
    if not cached_sales_data:
        return {}
    
    stockholm = pytz.timezone("Europe/Stockholm")
    
    # Konvertera input-datum till svenska tidszonen och justera from_date till 00:00:00
    from_date_dt = stockholm.localize(datetime.strptime(from_date, "%Y-%m-%d").replace(hour=0, minute=0, second=0))
    # Sätt till-datumet till 23:59:59 samma dag
    to_date_dt = stockholm.localize(datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))
    
    # Konvertera till UTC för jämförelse
    from_date_utc = from_date_dt.astimezone(pytz.UTC)
    to_date_utc = to_date_dt.astimezone(pytz.UTC)
    
    # Skapa en dictionary för alla unika produkter baserat på productNumber
    all_products = {}
    
    # Uppdatera försäljningssiffror och lägg till orderinformation
    for row in cached_sales_data:
        if not row["order_date"]:
            continue
        
        try:
            # Konvertera order_date till UTC för jämförelse
            order_date = datetime.strptime(row["order_date"], "%Y-%m-%d %H:%M:%S")
            order_date_utc = pytz.UTC.localize(order_date)
            
            # Strikt datumfiltrering i UTC
            if not (from_date_utc <= order_date_utc <= to_date_utc):
                continue
            
            if only_shipped and row["order_status"].upper() != "SHIPPED":
                continue
            
            if exclude_bundles and row["isBundle"]:
                continue
            
            if only_active and row["product_status"].upper() != "ACTIVE":
                continue
            
            key = row["productNumber"]
            if key not in all_products:
                all_products[key] = {
                    "total_quantity": 0,
                    "total_value": 0.0,
                    "orders": [],  # Lägg till en lista för orders
                    "product_info": {
                        "product_id": row["product_id"],
                        "status": row["product_status"],
                        "productNumber": row["productNumber"],
                        "isBundle": row["isBundle"],
                        "productType": row["productType"],
                        "collection": row["collection"],
                        "supplier": row["supplier"],
                        "product_name": row["product_name"]
                    }
                }
            
            all_products[key]["total_quantity"] += row["quantity"] if row["quantity"] else 0
            all_products[key]["total_value"] += row["total_sek"] if row["total_sek"] else 0
            
            # Lägg till orderinformation
            all_products[key]["orders"].append({
                "order_number": row["order_number"],
                "order_date": order_date.strftime("%Y-%m-%d %H:%M:%S"),  # Formatera i svensk tid
                "quantity": row["quantity"],
                "status": row["order_status"],
                "total_sek": row["total_sek"]
            })
        
        except (ValueError, TypeError) as e:
            print(f"Fel vid hantering av datum för order {row.get('order_number')}: {e}")
            continue
    
    return all_products

# Starta schemaläggaren när modulen laddas
schedule_bq_sales_update()
