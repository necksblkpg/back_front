import { gql } from "@apollo/client";

// Query för lagerdata
export const GET_WAREHOUSE_STOCK = gql`
  query WarehouseStock($limit: Int!, $page: Int!) {
    warehouses {
      stock(limit: $limit, page: $page) {
        productSize {
          quantity
          description
          size {
            name
          }
          productVariant {
            product {
              id
              name
              status
              productNumber
              isBundle
              collection {
                name
              }
              variants {
                unitCost {
                  value
                  currency {
                    code
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const GET_PRODUCT_COSTS = gql`
  query ProductCosts($productIds: [Int!]!) {
    products(ids: $productIds) {
      id
      variants {
        unitCost {
          value
          currency {
            code
            name
          }
        }
      }
    }
  }
`;

export const GET_ORDERS = gql`
  query Orders($from: DateTimeTz!, $to: DateTimeTz!, $page: Int!, $limit: Int!) {
    orders(
      limit: $limit,
      page: $page,
      where: {
        orderDate: { from: $from, to: $to },
        status: [SHIPPED]
      }
    ) {
      orderDate
      status
      lines {
        productVariant {
          product {
            id
          }
        }
        size
        quantity
      }
    }
  }
`;

// Uppdaterad query för försäljningsdata med "size"
export const GET_SALES_ORDERS = gql`
  query SalesOrders($from: DateTimeTz!, $to: DateTimeTz!, $page: Int!, $limit: Int!) {
    orders(
      limit: $limit,
      page: $page,
      where: { orderDate: { from: $from, to: $to } }
    ) {
      orderDate
      lines {
        productVariant {
          product {
            id
            name
            productNumber
            status
          }
        }
        size
        quantity
      }
    }
  }
`;
