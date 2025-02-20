import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Switch,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { sv } from 'date-fns/locale';

/**
 * Beräknar total försäljning utan dubbelsummering.
 * Om showBundles är true, används nuvarande logik (behåll bundlar och filtrera ut barnrader)
 * Om showBundles är false, tas bundlar bort och endast barnrader räknas.
 */
function calculateUnbundledTotal(orders, showBundles = true) {
  const map = new Map();
  orders.forEach(line => {
    const key = line.order_number;
    if (!map.has(key)) {
      map.set(key, {
        lines: [],
        date: line.order_date
      });
    }
    const group = map.get(key);
    group.lines.push(line);
    if (line.order_date < group.date) {
      group.date = line.order_date;
    }
  });

  let total = 0;
  const arr = [...map.values()];
  arr.forEach(orderGroup => {
    let finalLines = [...orderGroup.lines];
    if (showBundles) {
      const bundleLines = finalLines.filter(l => l.isBundle);
      if (bundleLines.length > 0) {
        bundleLines.forEach(bundleLine => {
          if (!bundleLine.childProductNumbers) return;
          const childSkus = new Set(
            bundleLine.childProductNumbers
              .split(',')
              .map(sku => sku.trim())
              .filter(Boolean)
          );
          finalLines = finalLines.filter(line => {
            if (line.isBundle) return true;
            if (childSkus.has(line.productNumber)) return false;
            return true;
          });
        });
      }
    } else {
      // Bundlar stängda: ta bort bundlar, använd endast barnrader
      finalLines = finalLines.filter(line => !line.isBundle);
    }
    let maxSek = 0;
    finalLines.forEach(l => {
      if ((l.total_sek || 0) > maxSek) {
        maxSek = l.total_sek || 0;
      }
    });
    total += maxSek;
  });
  return total;
}

const SalesDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [salesData, setSalesData] = useState({});
  const [allOrders, setAllOrders] = useState([]);
  // Datum
  const [fromDate, setFromDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 30))
  );
  const [toDate, setToDate] = useState(
    new Date(new Date().setDate(new Date().getDate() - 1))
  );
  // Switch: Visa endast SHIPPED ordrar
  const [onlyShipped, setOnlyShipped] = useState(false);
  // Ny switch: Visa bundlar eller inte
  const [showBundles, setShowBundles] = useState(true);

  // Hämta försäljningsdata
  useEffect(() => {
    const fetchSalesData = async () => {
      try {
        setLoading(true);
        const fromDateStr = fromDate.toISOString().split('T')[0];
        const toDateStr = toDate.toISOString().split('T')[0];
        const params = new URLSearchParams({
          from_date: fromDateStr,
          to_date: toDateStr
        });
        if (onlyShipped) {
          params.set('status', 'shipped');
        }
        const res = await fetch(`/api/bq_sales?${params}`);
        const data = await res.json();
        setSalesData(data);
        const aggregated = data.aggregated_sales || {};
        const flattenedOrders = [];
        for (const productNumber in aggregated) {
          const productInfo = aggregated[productNumber].product_info;
          const productOrders = aggregated[productNumber].orders || [];
          productOrders.forEach(order => {
            flattenedOrders.push({
              ...order,
              childProductNumbers: productInfo.childProductNumbers
            });
          });
        }
        setAllOrders(flattenedOrders);
      } catch (error) {
        console.error('Fel vid hämtning av försäljningsdata:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchSalesData();
  }, [fromDate, toDate, onlyShipped]);

  // Beräkna total försäljning baserat på om bundlar ska visas
  const unbundledTotalSales = useMemo(() => {
    return calculateUnbundledTotal(allOrders, showBundles);
  }, [allOrders, showBundles]);

  // Gruppning av orderrader för att skapa tabellrader samt räkna antal unika ordrar
  const groupedOrders = useMemo(() => {
    if (!allOrders) return [];
    const map = new Map();
    allOrders.forEach(line => {
      const key = line.order_number;
      if (!map.has(key)) {
        map.set(key, {
          order_number: key,
          date: line.order_date,
          lines: []
        });
      }
      const group = map.get(key);
      group.lines.push(line);
      if (line.order_date < group.date) {
        group.date = line.order_date;
      }
    });
    const arr = [...map.values()];
    arr.forEach(orderGroup => {
      let finalLines = [...orderGroup.lines];
      if (showBundles) {
        const bundleLines = finalLines.filter(l => l.isBundle);
        if (bundleLines.length > 0) {
          bundleLines.forEach(bundleLine => {
            if (!bundleLine.childProductNumbers) return;
            const childSkus = new Set(
              bundleLine.childProductNumbers
                .split(',')
                .map(sku => sku.trim())
                .filter(Boolean)
            );
            finalLines = finalLines.filter(line => {
              if (line.isBundle) return true;
              if (childSkus.has(line.productNumber)) return false;
              return true;
            });
          });
        }
      } else {
        // När bundlar är avstängda: filtrera bort bundle-rader
        finalLines = finalLines.filter(line => !line.isBundle);
      }
      orderGroup.linesToDisplay = finalLines;
      let sumQty = 0;
      let maxSek = 0;
      finalLines.forEach(l => {
        sumQty += l.quantity || 0;
        if ((l.total_sek || 0) > maxSek) {
          maxSek = l.total_sek || 0;
        }
      });
      orderGroup.total_quantity = sumQty;
      orderGroup.total_sek = maxSek;
    });
    arr.sort((a, b) => new Date(b.date) - new Date(a.date));
    return arr;
  }, [allOrders, showBundles]);

  // Räkna antalet unika ordrar
  const totalOrders = useMemo(() => groupedOrders.length, [groupedOrders]);

  if (loading) {
    return (
      <Box sx={{ textAlign: 'center', mt: 5 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Försäljningsöversikt
      </Typography>

      {/* Datumväljare, switch för SHIPPED samt toggle för bundlar */}
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={sv}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
          <DatePicker
            label="Från datum"
            value={fromDate}
            onChange={setFromDate}
            maxDate={toDate}
            format="yyyy-MM-dd"
          />
          <DatePicker
            label="Till datum"
            value={toDate}
            onChange={setToDate}
            minDate={fromDate}
            maxDate={new Date()}
            format="yyyy-MM-dd"
          />
          <FormControlLabel
            control={
              <Switch
                checked={onlyShipped}
                onChange={(e) => setOnlyShipped(e.target.checked)}
              />
            }
            label="Visa endast SHIPPED ordrar"
          />
          <FormControlLabel
            control={
              <Switch
                checked={showBundles}
                onChange={(e) => setShowBundles(e.target.checked)}
              />
            }
            label="Visa bundlar"
          />
        </Box>
      </LocalizationProvider>

      <Grid container spacing={3}>
        {/* Kort för Total försäljning */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              background: 'linear-gradient(135deg, #2196f3 0%, #03a9f4 100%)',
              color: 'white',
              boxShadow: 3
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <AttachMoneyIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Total försäljning</Typography>
                  <Typography variant="h4">
                    {unbundledTotalSales.toLocaleString('sv-SE', {
                      style: 'currency',
                      currency: 'SEK'
                    })}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        {/* Kort för Antal ordrar */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              background: 'linear-gradient(135deg, #4caf50 0%, #03a9f4 100%)',
              color: 'white',
              boxShadow: 3
            }}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <ShoppingBasketIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Antal ordrar</Typography>
                  <Typography variant="h4">
                    {totalOrders}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabell med orderdata */}
      <Box sx={{ mt: 4 }}>
        <Paper>
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
                  .map(line => `${line.product_name} (x${line.quantity})`)
                  .join(', ');
                return (
                  <TableRow key={idx}>
                    <TableCell>{group.order_number}</TableCell>
                    <TableCell>{group.date}</TableCell>
                    <TableCell>{productText}</TableCell>
                    <TableCell align="right">{group.total_quantity}</TableCell>
                    <TableCell align="right">
                      {group.total_sek.toLocaleString('sv-SE', {
                        style: 'currency',
                        currency: 'SEK'
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    </Box>
  );
};

export default SalesDashboard;
