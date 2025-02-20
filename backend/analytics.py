from typing import Dict, List, Any
from datetime import datetime, timedelta
import pandas as pd
from collections import defaultdict

class CentraAnalytics:
    def __init__(self):
        self.cache = {}
        self.cache_duration = timedelta(minutes=5)

    def analyze_stock_levels(self, products_data: List[Dict]) -> Dict[str, Any]:
        """Analyserar lagernivåer och ger insikter"""
        stock_insights = {
            "low_stock_items": [],
            "out_of_stock_items": [],
            "stock_distribution": defaultdict(int),
            "total_items": 0,
            "total_value": 0.0
        }

        for product in products_data:
            for variant in product.get("variants", []):
                stock = variant.get("stock", 0)
                price = float(variant.get("price", 0))
                
                stock_insights["total_items"] += stock
                stock_insights["total_value"] += stock * price

                if stock == 0:
                    stock_insights["out_of_stock_items"].append({
                        "product_name": product["name"],
                        "variant_name": variant["name"],
                        "sku": variant["sku"]
                    })
                elif stock < 5:
                    stock_insights["low_stock_items"].append({
                        "product_name": product["name"],
                        "variant_name": variant["name"],
                        "sku": variant["sku"],
                        "stock": stock
                    })

                # Kategorisera lagernivåer
                if stock == 0:
                    stock_insights["stock_distribution"]["out_of_stock"] += 1
                elif stock < 5:
                    stock_insights["stock_distribution"]["low_stock"] += 1
                elif stock < 20:
                    stock_insights["stock_distribution"]["medium_stock"] += 1
                else:
                    stock_insights["stock_distribution"]["high_stock"] += 1

        return stock_insights 