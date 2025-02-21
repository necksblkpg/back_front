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
  Paper,
  Button
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { sv } from 'date-fns/locale';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

// Färgpalett för diagrammet
const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#8dd1e1'];

/**
 * Donut-diagram med onClick-funktionalitet. När en kategori klickas anropas onCategorySelect.
 */
function CategoryDonutChart({ data, onCategorySelect }) {
  return (
    <Paper sx={{ p: 2, boxShadow: 3 }}>
      <Typography variant="h6" align="center" sx={{ mb: 2 }}>
        Fördelning av försäljning per produktkategori (inkl. frakt)
      </Typography>
      <ResponsiveContainer width="100%" height={500}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="type"
            innerRadius="60%"
            outerRadius="80%"
            label={({ type, percent }) =>
              `${type} (${(percent * 100).toFixed(0)}%)`
            }
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
                onClick={() => onCategorySelect(entry.type)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) =>
              value.toLocaleString('sv-SE', {
                style: 'currency',
                currency: 'SEK'
              })
            }
          />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </Paper>
  );
}

/**
 * Funktion för att beräkna total försäljning (unbundled).
 */
function calculateUnbundledTotal(orders, showBundles = true) {
  const map = new Map();
  orders.forEach(line => {
    const key = line.order_number;
    if (!map.has(key)) {
      map.set(key, { lines: [], date: line.order_date });
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
  const [fromDate, setFromDate] = useState(new Date(new Date().setDate(new Date().getDate() - 30)));
  const [toDate, setToDate] = useState(new Date(new Date().setDate(new Date().getDate() - 1)));
  const [onlyShipped, setOnlyShipped] = useState(false);
  const [showBundles, setShowBundles] = useState(true);
  // Ny state för vald kategori (om användaren klickar på ett diagramsegment)
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Hämta försäljningsdata från backend
  useEffect(() => {
    const fetchSalesData = async () => {
      try {
        setLoading(true);
        const fromDateStr = fromDate.toISOString().split('T')[0];
        const toDateStr = toDate.toISOString().split('T')[0];
        const params = new URLSearchParams({ from_date: fromDateStr, to_date: toDateStr });
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
              productType: productInfo.productType || 'Okänt'
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

  const unbundledTotalSales = useMemo(() => {
    return calculateUnbundledTotal(allOrders, showBundles);
  }, [allOrders, showBundles]);

  // Gruppning av orderrader baserat på ordernummer
  const groupedOrders = useMemo(() => {
    if (!allOrders) return [];
    const map = new Map();
    allOrders.forEach(line => {
      const key = line.order_number;
      if (!map.has(key)) {
        map.set(key, { order_number: key, date: line.order_date, lines: [] });
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
              bundleLine.childProductNumbers.split(',').map(sku => sku.trim()).filter(Boolean)
            );
            finalLines = finalLines.filter(line => {
              if (line.isBundle) return true;
              if (childSkus.has(line.productNumber)) return false;
              return true;
            });
          });
        }
      } else {
        finalLines = finalLines.filter(line => !line.isBundle);
      }
      let sumQty = 0;
      let maxSek = 0;
      finalLines.forEach(l => {
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
  }, [allOrders, showBundles]);

  const totalOrders = useMemo(() => groupedOrders.length, [groupedOrders]);

  /**
   * Beräknar försäljning per produktkategori (productType) inklusive frakt.
   * Varje orderrad får sin andel av orderns frakt baserat på sin andel av den totala orderns värde.
   */
  const productTypeDistribution = useMemo(() => {
    const distribution = {};
    groupedOrders.forEach(orderGroup => {
      const lines = orderGroup.linesToDisplay;
      if (lines.length === 0) return;
      // Fraktkostnaden antas vara densamma för hela ordern – ta värdet från första raden
      const shipping = lines[0].shipping_value_sek || 0;
      // Summera orderradernas värde (använd line_total_sek om tillgängligt, annars total_sek)
      const totalLineValue = lines.reduce((sum, line) => {
        const lineValue = (line.line_total_sek != null) ? line.line_total_sek : (line.total_sek || 0);
        return sum + lineValue;
      }, 0);
      
      lines.forEach(line => {
        const type = line.productType || 'Okänt';
        const baseValue = (line.line_total_sek != null) ? line.line_total_sek : (line.total_sek || 0);
        // Fördela frakten proportionellt, om totalLineValue > 0
        const shippingShare = totalLineValue > 0 ? (baseValue / totalLineValue) * shipping : 0;
        const lineValueWithShipping = baseValue + shippingShare;
        
        // Om en rad innehåller flera productNumbers delas värdet lika
        const productNumbers = line.productNumber.split(',').map(s => s.trim());
        if (productNumbers.length > 1) {
          const share = lineValueWithShipping / productNumbers.length;
          productNumbers.forEach(() => {
            if (!distribution[type]) distribution[type] = 0;
            distribution[type] += share;
          });
        } else {
          if (!distribution[type]) distribution[type] = 0;
          distribution[type] += lineValueWithShipping;
        }
      });
    });
    
    return Object.entries(distribution)
      .map(([type, value]) => ({ type, value }))
      .sort((a, b) => b.value - a.value);
  }, [groupedOrders]);

  // Filtrera grupperade ordrar baserat på vald kategori (om någon har klickats)
  const filteredOrders = useMemo(() => {
    if (!selectedCategory) return groupedOrders;
    return groupedOrders.filter(orderGroup =>
      orderGroup.linesToDisplay.some(line => line.productType === selectedCategory)
    );
  }, [groupedOrders, selectedCategory]);

  // Callback för när en kategori klickas i diagrammet
  const handleCategorySelect = (type) => {
    // Om samma kategori klickas igen, rensa filtret
    if (selectedCategory === type) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(type);
    }
  };

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

      {/* Datumväljare och switchar */}
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
            label="Visa endast levererade ordrar"
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

      {/* Om en kategori är vald, visa en knapp för att rensa filtret */}
      {selectedCategory && (
        <Box sx={{ mb: 2 }}>
          <Button variant="outlined" onClick={() => setSelectedCategory(null)}>
            Visa alla ordrar (filtrerat på: {selectedCategory})
          </Button>
        </Box>
      )}

      {/* Kort för total försäljning & antal ordrar */}
      <Grid container spacing={3}>
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
                  <Typography variant="h4">{filteredOrders.length}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Full-width donut-diagram – använder en Box med utsträckning över hela viewport-bredden */}
      <Box sx={{ width: '100vw', ml: '-24px', mr: '-24px', mb: 4 }}>
        <CategoryDonutChart data={productTypeDistribution} onCategorySelect={handleCategorySelect} />
      </Box>

      {/* Tabell med orderdata – visar filtrerade ordrar baserat på vald kategori */}
      <Box sx={{ mt: 4 }}>
        <Paper>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ordernummer</TableCell>
                <TableCell>Datum</TableCell>
                <TableCell>Produktnummer</TableCell>
                <TableCell align="right">Antal produkter</TableCell>
                <TableCell align="right">Total SEK</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((group, idx) => {
                const productText = group.linesToDisplay
                  .map(line => line.productNumber)
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
