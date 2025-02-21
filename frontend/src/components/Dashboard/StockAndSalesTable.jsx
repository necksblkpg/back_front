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
  Stack,
  FormControlLabel,
  Switch,
  TableContainer,
  TableSortLabel,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { sv } from "date-fns/locale";

const StockAndSalesTable = () => {
  // Datuminställningar
  const [fromDate, setFromDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 31))
  );
  const [toDate, setToDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 1))
  );
  // Toggle-knappar: endast "Visa endast levererade ordrar" och "Endast aktiva produkter" kvar
  const [onlyShipped, setOnlyShipped] = useState(true);
  const [onlyActive, setOnlyActive] = useState(true);
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Sorteringsstate: standard är att sortera på "Antal produkter" i fallande ordning
  const [orderBy, setOrderBy] = useState("totalQuantity");
  const [order, setOrder] = useState("desc");

  // Hämtar data från API:et (exclude_bundles skickas alltid med som true)
  useEffect(() => {
    async function fetchSalesData() {
      if (!fromDate || !toDate) return;
      setLoading(true);
      try {
        const fromDateStr = fromDate.toISOString().split("T")[0];
        const toDateStr = toDate.toISOString().split("T")[0];

        const params = new URLSearchParams({
          from_date: fromDateStr,
          to_date: toDateStr,
          ...(onlyShipped && { status: "shipped" }),
          // Exkludera bundles är alltid på
          exclude_bundles: "true",
          ...(onlyActive && { only_active: "true" }),
        });
        
        const response = await fetch(`/api/bq_sales?${params}`);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        const data = await response.json();
        // Använder den aggregerade datan från backend
        setSalesData(data.aggregated_sales);
      } catch (error) {
        console.error("Fel vid hämtning av försäljningsdata:", error);
        setSalesData(null);
      } finally {
        setLoading(false);
      }
    }
    fetchSalesData();
  }, [fromDate, toDate, onlyShipped, onlyActive]);

  // Skapar en lista med aggregerad produktdata
  const salesList = useMemo(() => {
    if (!salesData) return [];
    return Object.entries(salesData).map(([productName, data]) => ({
      productName,
      totalQuantity: data.total_quantity,
      // totalValue finns fortfarande men används ej i tabellen
      totalValue: data.total_value,
    }));
  }, [salesData]);

  // Sorterad lista baserat på valt fält och ordning
  const sortedSalesList = useMemo(() => {
    const sorted = [...salesList].sort((a, b) => {
      let valueA = a[orderBy];
      let valueB = b[orderBy];
      
      if (typeof valueA === "string") {
        valueA = valueA.toLowerCase();
        valueB = valueB.toLowerCase();
      }
      
      if (valueA < valueB) {
        return order === "asc" ? -1 : 1;
      }
      if (valueA > valueB) {
        return order === "asc" ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [salesList, orderBy, order]);

  // Hanterar sortering vid klick på rubriker
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

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
      
      {/* Datumväljare och switchar */}
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
                  checked={onlyActive}
                  onChange={(e) => setOnlyActive(e.target.checked)}
                />
              }
              label="Endast aktiva produkter"
            />
          </Stack>
        </Stack>
      </LocalizationProvider>

      {/* Tabell med aggregerad data (Kolumnen Total SEK är borttagen) */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={orderBy === "productName"}
                  direction={orderBy === "productName" ? order : "asc"}
                  onClick={() => handleRequestSort("productName")}
                >
                  Produkt
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === "totalQuantity"}
                  direction={orderBy === "totalQuantity" ? order : "asc"}
                  onClick={() => handleRequestSort("totalQuantity")}
                >
                  Antal produkter
                </TableSortLabel>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedSalesList.map((product, idx) => (
              <TableRow key={idx}>
                <TableCell>{product.productName}</TableCell>
                <TableCell align="right">{product.totalQuantity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default StockAndSalesTable;
