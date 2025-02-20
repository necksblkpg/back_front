import React, { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client'
import { GET_WAREHOUSE_STOCK, GET_ORDERS } from './queries'

function WarehouseStockList() {
  const [page, setPage] = useState(1)
  const [allStock, setAllStock] = useState([])
  
  // Datumhantering
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().split('T')[0]
  })
  const [toDate, setToDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  const [orderPage, setOrderPage] = useState(1)
  const [allOrders, setAllOrders] = useState([])
  const [hasMoreOrders, setHasMoreOrders] = useState(true)
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)

  const [loadingProgress, setLoadingProgress] = useState({
    total: 0,
    loaded: 0,
    message: ''
  })

  // Lägg till state för att visa när vi laddar försäljningsdata
  const [loadingSales, setLoadingSales] = useState(false)

  // Hämta lagerdata
  const { data: stockData, loading: stockLoading } = useQuery(GET_WAREHOUSE_STOCK, {
    variables: { 
      limit: 100,
      page
    },
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
    onCompleted: (data) => {
      if (data?.warehouses) {
        setAllStock(prev => {
          const existingIds = new Set(prev.flatMap(w => 
            w.stock.map(s => s.productSize.productVariant.product.id)
          ))
          
          const newStock = data.warehouses.filter(w =>
            w.stock.some(s => !existingIds.has(s.productSize.productVariant.product.id))
          )
          
          return [...prev, ...newStock]
        })
        
        if (data.warehouses[0]?.stock.length === 100) {
          setTimeout(() => setPage(p => p + 1), 0)
        }
        updateLoadingStatus(
          'Laddar lagersaldo...', 
          page, 
          Math.ceil(data.warehouses[0]?.stock.length / 100)
        )
      }
    }
  })

  // Hämta ordrar med paginering
  const { refetch: fetchOrders } = useQuery(GET_ORDERS, {
    variables: {
      from: `${fromDate}T00:00:00Z`,
      to: `${toDate}T23:59:59Z`,
      page: orderPage,
      limit: 100
    },
    onCompleted: (data) => {
      if (data?.orders) {
        setAllOrders(prev => [...prev, ...data.orders])
        // Om vi fick 100 ordrar finns det troligen fler
        setHasMoreOrders(data.orders.length === 100)
        if (data.orders.length === 100) {
          setOrderPage(p => p + 1)
        }
      }
    },
    skip: isLoadingOrders
  })

  // Ladda ordrar när komponenten mountas
  useEffect(() => {
    loadOrders()
  }, [])

  // Parallell laddning av ordrar i batches
  const loadOrderBatch = async (batchPage) => {
    try {
      const result = await fetchOrders({
        variables: {
          from: `${fromDate}T00:00:00Z`,
          to: `${toDate}T23:59:59Z`,
          page: batchPage,
          limit: 100
        }
      })
      
      if (result.data?.orders) {
        setAllOrders(prev => [...prev, ...result.data.orders])
        return result.data.orders.length === 100
      }
      return false
    } catch (error) {
      console.error('Fel vid hämtning av order batch:', error)
      return false
    }
  }

  // Ladda flera order-batches parallellt
  const loadOrders = async () => {
    setIsLoadingOrders(true)
    setLoadingSales(true)
    updateLoadingStatus('Förbereder att hämta försäljningsdata...', 0, 3)
    
    try {
      let currentPage = 1
      let hasMore = true
      
      while (hasMore) {
        updateLoadingStatus('Hämtar försäljningsdata...', currentPage, 'pågående')
        
        const result = await fetchOrders({
          variables: {
            from: `${fromDate}T00:00:00Z`,
            to: `${toDate}T23:59:59Z`,
            page: currentPage,
            limit: 100
          }
        })
        
        if (result.data?.orders) {
          setAllOrders(prev => [...prev, ...result.data.orders])
          hasMore = result.data.orders.length === 100
          currentPage++
        } else {
          hasMore = false
        }
      }
    } catch (error) {
      console.error('Fel vid hämtning av ordrar:', error)
    } finally {
      setIsLoadingOrders(false)
      // Vänta lite innan vi tar bort laddningsindikatorerna
      setTimeout(() => {
        setLoadingSales(false)
        updateLoadingStatus('', 0, 0)
      }, 500)
    }
  }

  // Hantera datumändringar
  const handleDateChange = async (type, value) => {
    try {
      // Uppdatera datum state
      if (type === 'from') {
        setFromDate(value)
      } else {
        setToDate(value)
      }

      // Återställ all orderdata
      setAllOrders([])
      setOrderPage(1)
      setHasMoreOrders(true)
      setLoadingSales(true)
      
      // Rensa försäljningsdata medan vi laddar ny
      salesData.clear()
      
      // Uppdatera loading status
      updateLoadingStatus('Uppdaterar försäljningsdata för ny period...', 0, 0)

      // Ladda om ordrar med nya datum
      const newFromDate = type === 'from' ? value : fromDate
      const newToDate = type === 'to' ? value : toDate

      let currentPage = 1
      let hasMore = true
      
      while (hasMore) {
        updateLoadingStatus('Hämtar försäljningsdata...', currentPage, 'pågående')
        
        const result = await fetchOrders({
          variables: {
            from: `${newFromDate}T00:00:00Z`,
            to: `${newToDate}T23:59:59Z`,
            page: currentPage,
            limit: 100
          }
        })
        
        if (result.data?.orders) {
          setAllOrders(prev => [...prev, ...result.data.orders])
          hasMore = result.data.orders.length === 100
          currentPage++
        } else {
          hasMore = false
        }
      }

      updateLoadingStatus('Försäljningsdata uppdaterad', currentPage - 1, currentPage - 1)
    } catch (error) {
      console.error('Fel vid uppdatering av data:', error)
      updateLoadingStatus('Ett fel uppstod vid uppdatering av försäljningsdata', 0, 0)
    } finally {
      // Vänta lite innan vi tar bort laddningsindikatorerna
      setTimeout(() => {
        setLoadingSales(false)
        updateLoadingStatus('', 0, 0)
      }, 500)
    }
  }

  // Memoizera produktdata
  const products = useMemo(() => {
    if (!allStock) return []
    
    return allStock.flatMap(warehouse =>
      warehouse.stock.map(item => {
        const { product } = item.productSize.productVariant
        return {
          ...item,
          product,
          unitCost: product.variants?.[0]?.unitCost,
          collection: product.collection?.name || 'N/A'
        }
      })
    )
  }, [allStock])

  // Memoizera försäljningsdata från alla ordrar
  const salesData = useMemo(() => {
    if (!allOrders.length) return new Map()
    
    const salesMap = new Map()
    allOrders.forEach(order => {
      order.lines.forEach(line => {
        const productId = line.productVariant.product.id
        salesMap.set(productId, (salesMap.get(productId) || 0) + parseInt(line.quantity))
      })
    })
    return salesMap
  }, [allOrders])

  // Beräkna genomsnittlig daglig försäljning
  const calculateAvgDailySales = (productId) => {
    if (!allOrders.length) return 0
    
    const totalSales = salesData.get(productId) || 0
    const days = Math.max(1, Math.ceil(
      (new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)
    ))

    return (totalSales / days).toFixed(1)
  }

  // Optimerad rendering av produktlistan
  const ProductList = useMemo(() => {
    return products.map((item, index) => {
      const { product } = item.productSize.productVariant
      
      // Skapa loading cells för försäljningsdata
      const salesCell = loadingSales ? (
        <td>
          <div className="loading-cell">Laddar...</div>
        </td>
      ) : (
        <td>{salesData.get(product.id) || 0}</td>
      )

      const avgSalesCell = loadingSales ? (
        <td>
          <div className="loading-cell">Laddar...</div>
        </td>
      ) : (
        <td>{calculateAvgDailySales(product.id)}</td>
      )

      return (
        <tr key={`${product.id}-${item.productSize.size?.name}`}>
          <td>{index + 1}</td>
          <td>
            <div style={{ fontWeight: 500 }}>{product.name}</div>
            <div style={{ color: 'var(--text-light)', fontSize: '0.8rem' }}>
              ID: {product.id}
            </div>
          </td>
          <td>
            <span className={`status-badge ${product.status === 'ACTIVE' ? 'active' : 'inactive'}`}>
              {product.status}
            </span>
          </td>
          <td>{product.productNumber}</td>
          <td>{item.collection}</td>
          <td>{item.productSize.size?.name || 'N/A'}</td>
          <td>{item.productSize.quantity}</td>
          {salesCell}
          {avgSalesCell}
          <td>
            {item.unitCost ? (
              `${item.unitCost.value} ${item.unitCost.currency.code}`
            ) : '-'}
          </td>
        </tr>
      )
    })
  }, [products, salesData, loadingSales])

  // Uppdatera loading state
  const isLoading = stockLoading || isLoadingOrders || loadingSales

  // Uppdatera laddningsstatus
  const updateLoadingStatus = (message, loaded = 0, total = 0) => {
    setLoadingProgress({ message, loaded, total })
  }

  // Lägg till LoadingOverlay-komponenten
  const LoadingOverlay = ({ message, loaded, total }) => {
    const progress = total > 0 ? Math.round((loaded / total) * 100) : 0
    
    return (
      <div className="loading-overlay">
        <div className="loading-content">
          <div className="loading-spinner" />
          <div className="loading-text">
            <p>{message || 'Laddar...'}</p>
            {total > 0 && (
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }} 
                />
                <span>{progress}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isLoading && !products.length) {
    return <LoadingOverlay {...loadingProgress} />
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Lager & Försäljning</h1>
      </div>

      {/* Datumväljare */}
      <div className="date-picker-container">
        <h2>Välj Period</h2>
        <div className="date-inputs">
          <label>
            Från:
            <input 
              type="date" 
              value={fromDate}
              onChange={(e) => handleDateChange('from', e.target.value)}
              max={toDate}
            />
          </label>
          <label>
            Till:
            <input 
              type="date" 
              value={toDate}
              onChange={(e) => handleDateChange('to', e.target.value)}
              min={fromDate}
            />
          </label>
        </div>
      </div>

      {/* Datatabell */}
      <div className="data-table-container">
        {loadingSales && (
          <div className="loading-status">
            <div className="loading-spinner" />
            <p>
              <strong>Hämtar försäljningsdata...</strong>
            </p>
            {loadingProgress.total > 0 && (
              <p>
                Laddat {loadingProgress.loaded} av {loadingProgress.total} sidor
              </p>
            )}
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>Lager #</th>
              <th>Produkt</th>
              <th>Status</th>
              <th>Art.nr</th>
              <th>Kollektion</th>
              <th>Storlek</th>
              <th>I Lager</th>
              <th>Försäljning</th>
              <th>Snitt/dag</th>
              <th>Inköpspris</th>
            </tr>
          </thead>
          <tbody>
            {ProductList}
          </tbody>
        </table>

        {/* Visa laddningsindikator under tabellen också */}
        {(stockLoading || loadingSales) && (
          <div className="loading-status">
            <div className="loading-spinner" />
            <p>{loadingProgress.message}</p>
            {loadingProgress.total > 0 && (
              <p>
                {loadingProgress.loaded} av {loadingProgress.total} klart
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default WarehouseStockList
