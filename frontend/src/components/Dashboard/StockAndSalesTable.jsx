import React, { useMemo, useState, useEffect } from "react";
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  CircularProgress,
  Typography,
  Box,
  Alert,
  Stack,
  Chip,
  TextField,
  FormControlLabel,
  Switch,
  TableSortLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TableContainer,
} from "@mui/material";

const OrderDetailsDialog = ({ open, onClose, orders, productName }) => {
  const sortedOrders = useMemo(() => {
    if (!orders || !Array.isArray(orders)) return [];
    return [...orders].sort((a, b) => 
      new Date(b.order_date) - new Date(a.order_date)
    );
  }, [orders]);

  const totalQuantity = useMemo(() => {
    return sortedOrders.reduce((sum, order) => sum + (order.quantity || 0), 0);
  }, [sortedOrders]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Orderhistorik - {productName}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Totalt antal: {totalQuantity} st
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Ordernummer</TableCell>
                <TableCell>Datum</TableCell>
                <TableCell align="right">Antal</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedOrders.map((order, index) => (
                <TableRow key={`${order.order_number}-${index}`}>
                  <TableCell>{order.order_number}</TableCell>
                  <TableCell>
                    {new Date(order.order_date).toLocaleString('sv-SE')}
                  </TableCell>
                  <TableCell align="right">{order.quantity}</TableCell>
                  <TableCell>
                    <Chip
                      label={order.status}
                      color={order.status.toUpperCase() === 'SHIPPED' ? 'success' : 'default'}
                      size="small"
                      sx={{ minWidth: 80 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Stäng</Button>
      </DialogActions>
    </Dialog>
  );
};

const StockAndSalesTable = () => {
  // Uppdatera datum-initialiseringen
  const getYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };

  const getThirtyDaysBeforeYesterday = () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 31); // -31 för att få 30 dagar före igår
    return thirtyDaysAgo.toISOString().split('T')[0];
  };

  // Uppdatera useState-initialiseringen
  const [fromDate, setFromDate] = useState(getThirtyDaysBeforeYesterday());
  const [toDate, setToDate] = useState(getYesterday());
  const [onlyShipped, setOnlyShipped] = useState(false);
  const [excludeBundles, setExcludeBundles] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [orderBy, setOrderBy] = useState('productName');
  const [order, setOrder] = useState('asc');
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    async function fetchSalesData() {
      if (!fromDate || !toDate) return;
      
      setLoading(true);
      try {
        const params = new URLSearchParams({
          from_date: fromDate,
          to_date: toDate,
          ...(onlyShipped && { status: 'shipped' }),
          ...(excludeBundles && { exclude_bundles: 'true' }),
          ...(onlyActive && { only_active: 'true' })
        });
        
        const response = await fetch(`/api/bq_sales?${params}`);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        const data = await response.json();
        setSalesData(data.aggregated_sales);
      } catch (error) {
        console.error("Fel vid hämtning av försäljningsdata:", error);
        setSalesData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchSalesData();
  }, [fromDate, toDate, onlyShipped, excludeBundles, onlyActive]);

  const salesList = useMemo(() => {
    if (!salesData) return [];
    return Object.entries(salesData).map(([productName, data]) => ({
      productName,
      ...data.product_info,
      totalQuantity: data.total_quantity,
      totalValue: data.total_value,
      orders: data.orders,
    }));
  }, [salesData]);

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedSalesList = useMemo(() => {
    const comparator = (a, b) => {
      let valueA = a[orderBy];
      let valueB = b[orderBy];
      
      // Hantera numeriska värden
      if (orderBy === 'totalQuantity' || orderBy === 'totalValue') {
        valueA = Number(valueA);
        valueB = Number(valueB);
      }
      
      // Hantera null/undefined värden
      if (valueA === null || valueA === undefined) valueA = '';
      if (valueB === null || valueB === undefined) valueB = '';
      
      // Jämför värdena
      if (valueB < valueA) return order === 'desc' ? -1 : 1;
      if (valueB > valueA) return order === 'desc' ? 1 : -1;
      return 0;
    };
    
    return [...salesList].sort(comparator);
  }, [salesList, order, orderBy]);

  // Hantera klick på produkt
  const handleProductClick = (productData) => {
    // Hämta den fullständiga produktdatan från salesData
    const fullProductData = salesData[productData.productName];
    setSelectedProduct({
      ...productData,
      orders: fullProductData.orders,
      product_info: fullProductData.product_info
    });
  };

  return (
    <Paper sx={{ padding: 2 }}>
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Försäljningsstatistik
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {loading ? (
              <CircularProgress size={16} sx={{ mr: 1 }} />
            ) : (
              `Visar ${salesList.length} produkter`
            )}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            label="Från datum"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              max: toDate // Begränsa från-datum till att vara före eller samma som till-datum
            }}
          />
          <TextField
            label="Till datum"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              max: getYesterday() // Begränsa till-datum till att max vara igår
            }}
          />
          <Stack direction="row" spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={onlyShipped}
                  onChange={(e) => setOnlyShipped(e.target.checked)}
                />
              }
              label="Visa endast levererade ordrar"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={excludeBundles}
                  onChange={(e) => setExcludeBundles(e.target.checked)}
                />
              }
              label="Exkludera bundles"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                />
              }
              label="Endast aktiva produkter"
            />
          </Stack>
        </Box>

        {loading && (
          <Box sx={{ textAlign: "center", marginY: 2 }}>
            <CircularProgress />
          </Box>
        )}

        {salesList.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'productName'}
                    direction={orderBy === 'productName' ? order : 'asc'}
                    onClick={() => handleRequestSort('productName')}
                  >
                    Produkt
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'productNumber'}
                    direction={orderBy === 'productNumber' ? order : 'asc'}
                    onClick={() => handleRequestSort('productNumber')}
                  >
                    Artikelnummer
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'collection'}
                    direction={orderBy === 'collection' ? order : 'asc'}
                    onClick={() => handleRequestSort('collection')}
                  >
                    Kollektion
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'productType'}
                    direction={orderBy === 'productType' ? order : 'asc'}
                    onClick={() => handleRequestSort('productType')}
                  >
                    Typ
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'totalQuantity'}
                    direction={orderBy === 'totalQuantity' ? order : 'asc'}
                    onClick={() => handleRequestSort('totalQuantity')}
                  >
                    Antal sålda
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'totalValue'}
                    direction={orderBy === 'totalValue' ? order : 'asc'}
                    onClick={() => handleRequestSort('totalValue')}
                  >
                    Totalt värde
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'status'}
                    direction={orderBy === 'status' ? order : 'asc'}
                    onClick={() => handleRequestSort('status')}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedSalesList.map((item) => (
                <TableRow 
                  key={item.productNumber}
                  onClick={() => handleProductClick(item)}
                  sx={{ 
                    cursor: 'pointer',
                    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)' }
                  }}
                >
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.productNumber}</TableCell>
                  <TableCell>{item.collection || "-"}</TableCell>
                  <TableCell>{item.productType || "-"}</TableCell>
                  <TableCell>{item.totalQuantity}</TableCell>
                  <TableCell>
                    {item.totalValue.toFixed(2)} SEK
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={item.isBundle ? "Bundle" : "Single"} 
                      color={item.status === "ACTIVE" ? "success" : "default"}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {!loading && salesList.length === 0 && (
          <Alert severity="info">
            Ingen försäljningsdata hittad för den valda perioden.
          </Alert>
        )}

        {/* Lägg till OrderDetailsDialog */}
        {selectedProduct && (
          <OrderDetailsDialog
            open={Boolean(selectedProduct)}
            onClose={() => setSelectedProduct(null)}
            orders={selectedProduct.orders || []}
            productName={selectedProduct.product_info.product_name}
          />
        )}
      </Stack>
    </Paper>
  );
};

export default StockAndSalesTable;
