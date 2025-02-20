import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  FormControlLabel,
  Switch
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import InventoryIcon from '@mui/icons-material/Inventory';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { sv } from 'date-fns/locale';

import SoldArticlesDialog from './SoldArticlesDialog';
import TotalSalesDialog from './TotalSalesDialog';
// Om du vill använda en separat OrderDetailsDialog:
// import OrderDetailsDialog from './OrderDetailsDialog';

/**
 * calculateUnbundledTotal(orders):
 *   - Grupperar orderrader per order_number.
 *   - Om en order har en bundlerad (isBundle = true), filtrerar bort dess barnrader.
 *   - Använder maxSek för att undvika dubbelsummering (eftersom varje rad kan innehålla total orderbelopp).
 *   - Returnerar summan av "maxSek" per order.
 */
function calculateUnbundledTotal(orders) {
  // 1. Gruppera alla rader i en Map
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

    // Om du vill ta senaste/tidigaste datum:
    if (line.order_date < group.date) {
      group.date = line.order_date;
    }
  });

  let total = 0;
  // 2. Loopar igenom varje order (group)
  const arr = [...map.values()];
  arr.forEach(orderGroup => {
    let finalLines = [...orderGroup.lines];
    // Kolla om ordern har en eller flera bundlerader
    const bundleLines = finalLines.filter(l => l.isBundle);

    if (bundleLines.length > 0) {
      // För varje bundlerad: parse childProductNumbers och filtrera bort barn
      bundleLines.forEach(bundleLine => {
        if (!bundleLine.childProductNumbers) return;
        const childSkus = new Set(
          bundleLine.childProductNumbers
            .split(',')
            .map(sku => sku.trim())
            .filter(Boolean)
        );
        finalLines = finalLines.filter(line => {
          // Behåll bundlerader
          if (line.isBundle) return true;
          // Ta bort barnrader
          if (childSkus.has(line.productNumber)) {
            return false;
          }
          // Behåll stand-alone
          return true;
        });
      });
    }

    // 3. Undvik dubbelsummering genom att ta maxSek bland finalLines
    let maxSek = 0;
    finalLines.forEach(l => {
      if ((l.total_sek || 0) > maxSek) {
        maxSek = l.total_sek;
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

  // Switch: endast SHIPPED eller alla
  const [onlyShipped, setOnlyShipped] = useState(false);

  // Dialog states
  const [isSoldArticlesDialogOpen, setIsSoldArticlesDialogOpen] = useState(false);
  const [isTotalSalesDialogOpen, setIsTotalSalesDialogOpen] = useState(false);
  // const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);

  // useEffect för att hämta data
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
        // Om onlyShipped är true, lägg till status=shipped
        if (onlyShipped) {
          params.set('status', 'shipped');
        }

        const res = await fetch(`/api/bq_sales?${params}`);
        const data = await res.json();

        setSalesData(data);

        // Platta ut aggregated_sales
        const aggregated = data.aggregated_sales || {};
        const flattenedOrders = [];
        for (const productNumber in aggregated) {
          const productInfo = aggregated[productNumber].product_info;
          const productOrders = aggregated[productNumber].orders || [];
          productOrders.forEach(order => {
            flattenedOrders.push({
              ...order,
              // Kopiera childProductNumbers om du vill filtrera i dialogen
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

  // Beräkna "unbundled" totalSales i frontend
  const unbundledTotalSales = useMemo(() => {
    return calculateUnbundledTotal(allOrders);
  }, [allOrders]);

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

      {/* Datumväljare + switch */}
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
        </Box>
      </LocalizationProvider>

      <Grid container spacing={3}>
        {/* Kort för Total försäljning */}
        <Grid item xs={12} md={3}>
          <Card
            sx={{
              background: 'linear-gradient(135deg, #2196f3 0%, #03a9f4 100%)',
              color: 'white',
              boxShadow: 3,
              cursor: 'pointer'
            }}
            onClick={() => setIsTotalSalesDialogOpen(true)}
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
        <Grid item xs={12} md={3}>
          <Card
            sx={{
              background: 'linear-gradient(135deg, #4caf50 0%, #03a9f4 100%)',
              color: 'white',
              boxShadow: 3,
              cursor: 'pointer'
            }}
            // onClick={() => setIsOrderDialogOpen(true)}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <ShoppingBasketIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Antal ordrar</Typography>
                  <Typography variant="h4">
                    {salesData.totalOrders || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Kort för Sålda artiklar */}
        <Grid item xs={12} md={3}>
          <Card
            sx={{
              background: 'linear-gradient(135deg, #03a9f4 0%, #2196f3 100%)',
              color: 'white',
              boxShadow: 3,
              cursor: 'pointer'
            }}
            onClick={() => setIsSoldArticlesDialogOpen(true)}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <InventoryIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Sålda artiklar</Typography>
                  <Typography variant="h4">
                    {salesData.totalItems || 0}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Dialoger */}
      <SoldArticlesDialog
        open={isSoldArticlesDialogOpen}
        onClose={() => setIsSoldArticlesDialogOpen(false)}
        orders={allOrders}
      />
      <TotalSalesDialog
        open={isTotalSalesDialogOpen}
        onClose={() => setIsTotalSalesDialogOpen(false)}
        orders={allOrders}
      />
      {/* 
      <OrderDetailsDialog
        open={isOrderDialogOpen}
        onClose={() => setIsOrderDialogOpen(false)}
        orders={allOrders}
      /> 
      */}
    </Box>
  );
};

export default SalesDashboard;
