# GraphQL queries för olika datatyper
from typing import Dict, List, Optional

class GraphQLQueries:
    @staticmethod
    def get_products(limit: int = 10, page: int = 1) -> str:
        return """
        query GetProducts($limit: Int, $page: Int) {
            products(limit: $limit, page: $page) {
                id
                name
                url
                status
                description
                variants {
                    id
                    name
                    sku
                    price
                    stock
                }
            }
        }
        """

    @staticmethod
    def get_warehouses() -> str:
        return """
        query GetWarehouses {
            warehouses {
                id
                name
                description
                status
            }
        }
        """

    @staticmethod
    def get_stock_status(product_ids: List[int]) -> str:
        return """
        query GetStockStatus($productIds: [Int!]) {
            products(where: { id: { in: $productIds } }) {
                id
                name
                variants {
                    id
                    sku
                    stock
                    warehouse {
                        id
                        name
                    }
                }
            }
        }
        """

    @staticmethod
    def get_orders(limit: int = 10, page: int = 1) -> str:
        return """
        query GetOrders($limit: Int, $page: Int) {
            orders(limit: $limit, page: $page) {
                id
                number
                status
                created
                modified
                items {
                    id
                    productName
                    quantity
                    price
                }
                customer {
                    id
                    email
                    firstName
                    lastName
                }
            }
        }
        """

    @staticmethod
    def get_customer_details(customer_id: int) -> str:
        return """
        query GetCustomer($customerId: Int) {
            customer(id: $customerId) {
                id
                email
                firstName
                lastName
                addresses {
                    street
                    city
                    country
                    zipCode
                }
                orders {
                    id
                    number
                    status
                    created
                }
            }
        }
        """

    @staticmethod
    def get_product_analytics(product_id: int) -> str:
        return """
        query GetProductAnalytics($productId: Int) {
            product(id: $productId) {
                id
                name
                variants {
                    id
                    sku
                    stock
                    stockChanges: stockChangeLines(
                        sort: [{field: "created", direction: DESC}]
                        limit: 10
                    ) {
                        id
                        quantity
                        created
                    }
                }
                orders: orders(
                    where: { items: { productId: { eq: $productId } } }
                    limit: 10
                ) {
                    id
                    created
                    items {
                        quantity
                        price
                    }
                }
            }
        }
        """

# Hjälpfunktioner för att bygga GraphQL-variabler
def build_product_variables(limit: int = 10, page: int = 1) -> Dict:
    return {
        "limit": limit,
        "page": page
    }

def build_stock_status_variables(product_ids: List[int]) -> Dict:
    return {
        "productIds": product_ids
    }

def build_customer_variables(customer_id: int) -> Dict:
    return {
        "customerId": customer_id
    }

def build_product_analytics_variables(product_id: int) -> Dict:
    return {
        "productId": product_id
    } 