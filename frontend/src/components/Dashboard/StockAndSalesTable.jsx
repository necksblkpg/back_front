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
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { sv } from "date-fns/locale";

// Hjälpfunktion för att beräkna gårdagens datum (om det behövs i andra delar)
const getYesterday = () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
};

const StockAndSalesTable = () => {
  // Sätt datum som Date-objekt
  const [fromDate, setFromDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 31))
  );
  const [toDate, setToDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 1))
  );
  const [onlyShipped, setOnlyShipped] = useState(false);
  const [excludeBundles, setExcludeBundles] = useState(false);
  const [onlyActive, setOnlyActive] = useState(false);
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [orderBy, setOrderBy] = useState("productName");
  const [order, setOrder] = useState("asc");
  const [selectedProduct, setSelectedProduct] = useState(null);

  useEffect(() => {
    async function fetchSalesData() {
      if (!fromDate || !toDate) return;
      
      setLoading(true);
      try {
        // Konvertera datumen till strängar i formatet YYYY-MM-DD
        const fromDateStr = fromDate.toISOString().split("T")[0];
        const toDateStr = toDate.toISOString().split("T")[0];

        const params = new URLSearchParams({
          from_date: fromDateStr,
          to_date: toDateStr,
          ...(onlyShipped && { status: "shipped" }),
          ...(excludeBundles && { exclude_bundles: "true" }),
          ...(onlyActive && { only_active: "true" }),
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
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const sortedSalesList = useMemo(() => {
    const comparator = (a, b) => {
      let valueA = a[orderBy];
      let valueB = b[orderBy];
      
      if (orderBy === "totalQuantity" || orderBy === "totalValue") {
        valueA = Number(valueA);
        valueB = Number(valueB);
      }
      
      if (valueA === null || valueA === undefined) valueA = "";
      if (valueB === null || valueB === undefined) valueB = "";
      
      if (valueB < valueA) return order === "desc" ? -1 : 1;
      if (valueB > valueA) return order === "desc" ? 1 : -1;
      return 0;
    };
    
    return [...salesList].sort(comparator);
  }, [salesList, order, orderBy]);

  const handleProductClick = (productData) => {
    const fullProductData = salesData[productData.productName];
    setSelectedProduct({
      ...productData,
      orders: fullProductData.orders,
      product_info: fullProductData.product_info,
    });
  };

  // Gruppning av orderrader för tabellen
  const groupedOrders = useMemo(() => {
    if (!salesData) return [];
    const map = new Map();
    salesList.forEach((item) => {
      item.orders.forEach((line) => {
        const key = line.order_number;
        if (!map.has(key)) {
          map.set(key, {
            order_number: key,
            date: line.order_date,
            lines: [],
          });
        }
        const group = map.get(key);
        group.lines.push(line);
        if (line.order_date < group.date) {
          group.date = line.order_date;
        }
      });
    });
    const arr = [...map.values()];
    arr.forEach((orderGroup) => {
      let finalLines = [...orderGroup.lines];
      const bundleLines = finalLines.filter((l) => l.isBundle);
      if (bundleLines.length > 0) {
        bundleLines.forEach((bundleLine) => {
          if (!bundleLine.childProductNumbers) return;
          const childSkus = new Set(
            bundleLine.childProductNumbers
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          );
          finalLines = finalLines.filter((line) => {
            if (line.isBundle) return true;
            if (childSkus.has(line.productNumber)) return false;
            return true;
          });
        });
      }
      let sumQty = 0;
      let maxSek = 0;
      finalLines.forEach((l) => {
        sumQty += l.quantity || 0;
        if ((l.total_sek || 0) > maxSek) {
          maxSek = l.total_sek || 0;
        }
      });
      orderGroup.linesToDisplay = finalLines;
      orderGroup.total_quantity = sumQty;
      orderGroup.total_sek = maxSek;
    });
    arr.sort((a, b) => new Date(b.date) - new Date(a.date));
    return arr;
  }, [salesData, salesList]);

  // Uppdatera state för total ordrar
  const totalOrders = useMemo(() => groupedOrders.length, [groupedOrders]);

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", mt: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Lager & Försäljning
      </Typography>
      
      {/* Använd samma snygga datumväljare med MUI DatePicker */}
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={sv}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <DatePicker
            label="Från datum"
            value={fromDate}
            onChange={(newValue) => setFromDate(newValue)}
            maxDate={toDate}
            format="yyyy-MM-dd"
          />
          <DatePicker
            label="Till datum"
            value={toDate}
            onChange={(newValue) => setToDate(newValue)}
            minDate={fromDate}
            maxDate={new Date()}
            format="yyyy-MM-dd"
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
        </Stack>
      </LocalizationProvider>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Försäljningsstatistik
        </Typography>
        <Typography variant="body1">
          Total försäljning:{" "}
          {groupedOrders.reduce(
            (sum, group) => sum + group.total_sek,
            0
          ).toLocaleString("sv-SE", {
            style: "currency",
            currency: "SEK",
          })}
        </Typography>
        <Typography variant="body1">
          Antal ordrar: {totalOrders}
        </Typography>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ordernummer</TableCell>
              <TableCell>Datum</TableCell>
              <TableCell>Produkter</TableCell>
              <TableCell align="right">Antal produkter</TableCell>
              <TableCell align="right">Total SEK</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedOrders.map((group, idx) => {
              const productText = group.linesToDisplay
                .map((line) => `${line.product_name} (x${line.quantity})`)
                .join(", ");
              return (
                <TableRow key={idx} onClick={() => handleProductClick(group)}>
                  <TableCell>{group.order_number}</TableCell>
                  <TableCell>{group.date}</TableCell>
                  <TableCell>{productText}</TableCell>
                  <TableCell align="right">{group.total_quantity}</TableCell>
                  <TableCell align="right">
                    {group.total_sek.toLocaleString("sv-SE", {
                      style: "currency",
                      currency: "SEK",
                    })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedProduct && (
        <Dialog
          open={Boolean(selectedProduct)}
          onClose={() => setSelectedProduct(null)}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle>
            Orderhistorik - {selectedProduct.product_info.product_name}
          </DialogTitle>
          <DialogContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Ordernummer</TableCell>
                  <TableCell>Datum</TableCell>
                  <TableCell align="right">Antal</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedProduct.orders.map((order, index) => (
                  <TableRow key={`${order.order_number}-${index}`}>
                    <TableCell>{order.order_number}</TableCell>
                    <TableCell>
                      {new Date(order.order_date).toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell align="right">{order.quantity}</TableCell>
                    <TableCell>{order.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedProduct(null)}>Stäng</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default StockAndSalesTable;
