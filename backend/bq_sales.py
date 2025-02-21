from flask import Blueprint, request, jsonify
import os
from dotenv import load_dotenv
load_dotenv()  # Ladda miljövariabler från .env
from google.cloud import bigquery
import pytz
from datetime import datetime
import threading
from apscheduler.schedulers.background import BackgroundScheduler

bq_sales = Blueprint('bq_sales', __name__)

# Global cache
cached_sales_data = []
cache_last_updated = None
cache_lock = threading.Lock()

# Ändra till ditt BigQuery-projekt och tabell om nödvändigt
BQ_TABLE = "my-project-db-433615.Info.SKU_sb"

def fetch_sales_data_from_bq():
    global cached_sales_data, cache_last_updated
    client = bigquery.Client()
    
    # Uppdaterad SELECT-fråga med de nya kolumnerna: line_total_sek och shipping_value_sek
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
        s.line_total_sek,
        s.shipping_value_sek,
        i.id as product_id,
        i.status as product_status,
        i.isBundle,
        i.productType,
        i.collection,
        i.supplier,
        i.childProductNumbers
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
            "line_total_sek": row.line_total_sek,         # Ny kolumn
            "shipping_value_sek": row.shipping_value_sek,     # Ny kolumn
            "product_id": row.product_id,
            "product_status": row.product_status,
            "isBundle": row.isBundle,
            "productType": row.productType,
            "collection": row.collection,
            "supplier": row.supplier,
            "childProductNumbers": row.childProductNumbers
        })
    
    with cache_lock:
        cached_sales_data = data
        cache_last_updated = datetime.now(stockholm).strftime("%Y-%m-%d %H:%M:%S")

def schedule_bq_sales_update():
    scheduler = BackgroundScheduler(timezone="Europe/Stockholm")
    scheduler.add_job(fetch_sales_data_from_bq, "cron", hour=6, minute=0)
    scheduler.start()
    fetch_sales_data_from_bq()  # initial fetch

@bq_sales.route("/bq_sales", methods=["GET"])
def get_bq_sales():
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

    aggregated_data = aggregate_sales_data_by_date(from_date, to_date, only_shipped, exclude_bundles, only_active)

    # Beräkna toppnivå-totals
    total_sales = 0.0
    total_items = 0
    unique_order_numbers = set()

    for product_num, product_info in aggregated_data.items():
        total_sales += product_info["total_value"]
        for order in product_info["orders"]:
            total_items += order["quantity"] or 0
            unique_order_numbers.add(order["order_number"])

    total_orders = len(unique_order_numbers)

    return jsonify({
        "from_date": from_date,
        "to_date": to_date,
        "only_shipped": only_shipped,
        "exclude_bundles": exclude_bundles,
        "only_active": only_active,
        "aggregated_sales": aggregated_data,
        "totalSales": total_sales,
        "totalOrders": total_orders,
        "totalItems": total_items,
        "last_updated": cache_last_updated
    })

def aggregate_sales_data_by_date(from_date, to_date, only_shipped=False, exclude_bundles=False, only_active=False):
    """
    Filtrerar och aggregerar försäljningsdata baserat på datum, status och productNumber.
    Nu ingår även de nya fälten line_total_sek och shipping_value_sek.
    """
    if not cached_sales_data:
        return {}
    
    stockholm = pytz.timezone("Europe/Stockholm")
    from datetime import datetime
    from_date_dt = stockholm.localize(datetime.strptime(from_date, "%Y-%m-%d").replace(hour=0, minute=0, second=0))
    to_date_dt = stockholm.localize(datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59))
    
    # Filtrera i UTC för exakta tidsjämförelser
    from_date_utc = from_date_dt.astimezone(pytz.UTC)
    to_date_utc = to_date_dt.astimezone(pytz.UTC)
    
    all_products = {}
    
    for row in cached_sales_data:
        if not row["order_date"]:
            continue
        
        try:
            # Konvertera order_date från sträng till UTC
            naive_date = datetime.strptime(row["order_date"], "%Y-%m-%d %H:%M:%S")
            order_date_utc = pytz.UTC.localize(naive_date)

            if not (from_date_utc <= order_date_utc <= to_date_utc):
                continue
            if only_shipped and row["order_status"].upper() != "SHIPPED":
                continue
            if exclude_bundles and row["isBundle"]:
                continue
            if only_active and row["product_status"].upper() != "ACTIVE":
                continue

            order_date_swe = order_date_utc.astimezone(stockholm)
            
            key = row["productNumber"]
            if key not in all_products:
                all_products[key] = {
                    "total_quantity": 0,
                    "total_value": 0.0,
                    "total_line_sek": 0.0,  # Summa av line_total_sek för detta produktnummer
                    "shipping_value_sek": row.get("shipping_value_sek"),  # Behåll det första värdet
                    "orders": [],
                    "product_info": {
                        "product_id": row["product_id"],
                        "status": row["product_status"],
                        "productNumber": row["productNumber"],
                        "isBundle": row["isBundle"],
                        "productType": row["productType"],
                        "collection": row["collection"],
                        "supplier": row["supplier"],
                        "product_name": row["product_name"],
                        "childProductNumbers": row["childProductNumbers"]
                    }
                }
            
            quantity = row["quantity"] or 0
            total_sek = row["total_sek"] or 0.0
            line_total_sek = row.get("line_total_sek") or 0.0

            all_products[key]["total_quantity"] += quantity
            all_products[key]["total_value"] += total_sek
            all_products[key]["total_line_sek"] += line_total_sek

            all_products[key]["orders"].append({
                "order_number": row["order_number"],
                "order_date": order_date_swe.strftime("%Y-%m-%d %H:%M:%S"),
                "quantity": quantity,
                "status": row["order_status"],
                "total_sek": total_sek,
                "line_total_sek": line_total_sek,
                "shipping_value_sek": row.get("shipping_value_sek"),
                "isBundle": row["isBundle"],
                "product_name": row["product_name"],
                "productNumber": row["productNumber"]
            })
        except Exception as e:
            print(f"Fel vid hantering av datum för order {row.get('order_number')}: {e}")
            continue
    
    return all_products

@bq_sales.route("/bq_sales/refresh", methods=["POST"])
def refresh_bq_sales():
    """
    Manuell endpoint för att uppdatera cachen direkt från BigQuery.
    """
    fetch_sales_data_from_bq()
    return jsonify({"message": "Cache uppdaterad"})

schedule_bq_sales_update()
