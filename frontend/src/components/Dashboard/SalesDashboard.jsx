import React, { useState, useEffect, useMemo } from 'react';
import {
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton
} from '@mui/material';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import InventoryIcon from '@mui/icons-material/Inventory';
import ShoppingBasketIcon from '@mui/icons-material/ShoppingBasket';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { sv } from 'date-fns/locale';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PeopleIcon from '@mui/icons-material/People';
import TimelineIcon from '@mui/icons-material/Timeline';
import { ResponsiveContainer } from 'recharts';
import { format, differenceInDays, subDays, eachDayOfInterval } from 'date-fns';
import CloseIcon from '@mui/icons-material/Close';

const OrderDetailsDialog = ({ open, onClose, orders, fromDate, toDate }) => {
  const sortedOrders = useMemo(() => {
    if (!orders || !Array.isArray(orders)) return [];
    
    const startDate = new Date(format(fromDate, 'yyyy-MM-dd'));
    startDate.setUTCHours(-1, 0, 0, 0);
    
    const endDate = new Date(format(toDate, 'yyyy-MM-dd'));
    endDate.setUTCHours(22, 59, 59, 999);
    
    return [...orders]
      .filter(order => {
        const utcDate = new Date(order.order_date);
        const swedishDate = new Date(utcDate.getTime() + (60 * 60 * 1000));
        
        // Logga för order 337399
        if (order.order_number === "337399") {
          console.log("Dialog debugging order 337399:", {
            originalDate: order.order_date,
            utcDate: utcDate.toISOString(),
            swedishDate: swedishDate.toISOString(),
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            isWithinRange: swedishDate >= startDate && swedishDate <= endDate
          });
        }
        
        return swedishDate >= startDate && swedishDate <= endDate;
      })
      .sort((a, b) => new Date(b.order_date) - new Date(a.order_date))
      .map(order => {
        const utcDate = new Date(order.order_date);
        const swedishDate = new Date(utcDate.getTime() + (60 * 60 * 1000));
        return {
          ...order,
          order_date: swedishDate.toLocaleString('sv-SE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
        };
      });
  }, [orders, fromDate, toDate]);

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Orderdetaljer ({sortedOrders.length} ordrar)
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ordernummer</TableCell>
                <TableCell>Datum</TableCell>
                <TableCell>Produkt</TableCell>
                <TableCell align="right">Antal</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedOrders.map((order, index) => (
                <TableRow key={`${order.order_number}-${order.product_name}-${index}`}>
                  <TableCell>{order.order_number}</TableCell>
                  <TableCell>{order.order_date}</TableCell>
                  <TableCell>{order.product_name}</TableCell>
                  <TableCell align="right">{order.quantity}</TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        backgroundColor: 
                          order.status === 'shipped' ? 'success.light' :
                          order.status === 'processing' ? 'warning.light' :
                          'info.light',
                        borderRadius: 1,
                        px: 1,
                        py: 0.5,
                        display: 'inline-block'
                      }}
                    >
                      {order.status}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>
    </Dialog>
  );
};

const SalesDashboard = () => {
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [toDate, setToDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date;
  });
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [allOrders, setAllOrders] = useState([]);

  useEffect(() => {
    const fetchSalesData = async () => {
      try {
        const fromDateStr = format(fromDate, 'yyyy-MM-dd');
        const toDateStr = format(toDate, 'yyyy-MM-dd');

        const params = new URLSearchParams({
          from_date: fromDateStr,
          to_date: toDateStr,
          status: 'shipped',
          exclude_bundles: 'true'
        });

        const response = await fetch(`/api/bq_sales?${params}`);
        const data = await response.json();
        
        const products = Object.values(data.aggregated_sales);
        
        // Beräkna tillväxt
        const previousPeriodLength = differenceInDays(toDate, fromDate);
        const previousFromDate = subDays(fromDate, previousPeriodLength);
        const previousParams = new URLSearchParams({
          from_date: format(previousFromDate, 'yyyy-MM-dd'),
          to_date: format(subDays(fromDate, 1), 'yyyy-MM-dd'),
          status: 'shipped',
          exclude_bundles: 'true'
        });

        const previousResponse = await fetch(`/api/bq_sales?${previousParams}`);
        const previousData = await previousResponse.json();
        const previousProducts = Object.values(previousData.aggregated_sales);

        const currentTotal = products.reduce((sum, p) => sum + (p.total_sek || 0), 0);
        const previousTotal = previousProducts.reduce((sum, p) => sum + (p.total_sek || 0), 0);
        const growth = previousTotal ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

        // Beräkna försäljning per dag
        const salesByDay = {};
        const daysInPeriod = eachDayOfInterval({ start: fromDate, end: toDate });
        daysInPeriod.forEach(day => {
          salesByDay[format(day, 'yyyy-MM-dd')] = 0;
        });

        products.forEach(product => {
          product.orders.forEach(order => {
            const date = order.order_date.split(' ')[0];
            salesByDay[date] = (salesByDay[date] || 0) + 
              (order.quantity * (product.total_sek / product.total_quantity));
          });
        });

        // Beräkna trender och statistik
        const dailyAverage = currentTotal / Object.keys(salesByDay).length;
        const salesValues = Object.values(salesByDay);
        const maxDailySales = Math.max(...salesValues);
        const minDailySales = Math.min(...salesValues);

        // Uppdatera datumfiltreringen
        const filterOrdersByDate = (order) => {
          const utcDate = new Date(order.order_date);
          const swedishDate = new Date(utcDate.getTime() + (60 * 60 * 1000));
          
          // Skapa datum för filtrering i UTC
          const startDate = new Date(fromDateStr);
          startDate.setUTCHours(-1, 0, 0, 0);  // 23:00 UTC dagen innan
          
          const endDate = new Date(toDateStr);
          endDate.setUTCHours(22, 59, 59, 999);  // 22:59:59.999 UTC
          
          // Mer detaljerad loggning för order 337399
          if (order.order_number === "337399") {
            console.log("Debugging order 337399:", {
              originalDate: order.order_date,
              utcDate: utcDate.toISOString(),
              swedishDate: swedishDate.toISOString(),
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              fromDateStr,
              toDateStr,
              isWithinRange: swedishDate >= startDate && swedishDate <= endDate,
              startComparison: swedishDate >= startDate,
              endComparison: swedishDate <= endDate,
              swedishDateMs: swedishDate.getTime(),
              startDateMs: startDate.getTime(),
              endDateMs: endDate.getTime()
            });
          }
          
          return swedishDate >= startDate && swedishDate <= endDate;
        };

        // Uppdatera alla ställen där vi filtrerar ordrar
        const totalSales = products.reduce((sum, product) => {
          const productOrderValue = product.orders
            .filter(filterOrdersByDate)
            .reduce((orderSum, order) => {
              return orderSum + (order.total_sek || 0);
            }, 0);
          return sum + productOrderValue;
        }, 0);

        const totalOrders = new Set(
          products.flatMap(product => 
            product.orders
              .filter(filterOrdersByDate)
              .map(o => o.order_number)
          )
        ).size;

        const totalItems = products.reduce((sum, product) => {
          return sum + product.orders
            .filter(filterOrdersByDate)
            .reduce((orderSum, order) => orderSum + (order.quantity || 0), 0);
        }, 0);
        
        // Uppdatera även i salesByCategory och topProducts
        const salesByCategory = products.reduce((acc, product) => {
          const category = product.product_info.productType || 'Okategoriserad';
          const productValue = product.orders
            .filter(filterOrdersByDate)
            .reduce((orderSum, order) => {
              return orderSum + (order.total_sek || 0);
            }, 0);
          acc[category] = (acc[category] || 0) + productValue;
          return acc;
        }, {});

        // Topp produkter
        const topProducts = products
          .map(product => {
            const filteredValue = product.orders
              .filter(filterOrdersByDate)
              .reduce((sum, order) => {
                return sum + (order.total_sek || 0);
              }, 0);
            
            const filteredQuantity = product.orders
              .filter(filterOrdersByDate)
              .reduce((sum, order) => sum + (order.quantity || 0), 0);

            return {
              name: product.product_info.product_name,
              value: filteredValue,
              quantity: filteredQuantity
            };
          })
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        // Försäljning över tid
        const salesByDate = {};
        products.forEach(product => {
          product.orders.forEach(order => {
            const date = order.order_date.split(' ')[0];
            salesByDate[date] = (salesByDate[date] || 0) + (order.quantity * (product.total_sek / product.total_quantity));
          });
        });

        // Uppdatera allOrders-filtreringen också
        const allOrdersList = products.flatMap(product => 
          product.orders
            .filter(filterOrdersByDate)
            .map(order => ({
              ...order,
              product_name: product.product_info.product_name
            }))
        );

        setSalesData({
          totalSales,
          totalOrders,
          totalItems,
          averageOrderValue: totalSales / totalOrders,
          salesByCategory,
          topProducts,
          salesByDate: Object.entries(salesByDate)
            .map(([date, value]) => ({ date, value }))
            .sort((a, b) => new Date(a.date) - new Date(b.date)),
          growth,
          dailyAverage,
          maxDailySales,
          minDailySales,
          salesByDay: Object.entries(salesByDay).map(([date, value]) => ({
            date,
            value,
            average: dailyAverage
          }))
        });
        setAllOrders(allOrdersList);
      } catch (error) {
        console.error('Fel vid hämtning av försäljningsdata:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSalesData();
  }, [fromDate, toDate]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
        <CircularProgress />
      </Box>
    );
  }

  const colors = {
    primary: '#2196f3',
    success: '#4caf50',
    warning: '#ff9800',
    info: '#03a9f4',
    chart: {
      line: '#3f51b5',
      bar: '#2196f3',
      background: 'rgba(33, 150, 243, 0.1)'
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">
          Försäljningsöversikt
        </Typography>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={sv}>
          <Box sx={{ display: 'flex', gap: 2 }}>
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
          </Box>
        </LocalizationProvider>
      </Box>
      
      {/* KPI Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.info} 100%)`,
            color: 'white',
            boxShadow: 3
          }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <AttachMoneyIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Total försäljning</Typography>
                  <Typography variant="h4">
                    {salesData.totalSales.toLocaleString('sv-SE', {
                      style: 'currency',
                      currency: 'SEK'
                    })}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={3}>
          <Card 
            sx={{ 
              background: `linear-gradient(135deg, ${colors.success} 0%, ${colors.info} 100%)`,
              color: 'white',
              boxShadow: 3,
              cursor: 'pointer',
              '&:hover': {
                boxShadow: 6,
                transform: 'scale(1.02)',
                transition: 'all 0.2s'
              }
            }}
            onClick={() => setIsOrderDialogOpen(true)}
          >
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <ShoppingBasketIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Antal ordrar</Typography>
                  <Typography variant="h4">
                    {salesData.totalOrders}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${colors.info} 0%, ${colors.primary} 100%)`,
            color: 'white',
            boxShadow: 3
          }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <InventoryIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Sålda artiklar</Typography>
                  <Typography variant="h4">
                    {salesData.totalItems}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${colors.warning} 0%, ${colors.info} 100%)`,
            color: 'white',
            boxShadow: 3
          }}>
            <CardContent>
              <Box display="flex" alignItems="center" gap={2}>
                <TrendingUpIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">Snittorder</Typography>
                  <Typography variant="h4">
                    {salesData.averageOrderValue.toLocaleString('sv-SE', {
                      style: 'currency',
                      currency: 'SEK'
                    })}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Lägg till nya KPI:er */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2 }}>
            <Box display="flex" alignItems="center" gap={2}>
              <TimelineIcon color="primary" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Tillväxt (vs föregående period)
                </Typography>
                <Typography variant="h5" color="success.main">
                  {salesData.growth.toFixed(2)}%
                </Typography>
              </Box>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3}>
        {/* Försäljningstrend */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Försäljningstrend
            </Typography>
            <Box sx={{ height: 'calc(100% - 40px)', width: '100%' }}>
              <ResponsiveContainer>
                <LineChart data={salesData.salesByDate}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="value" stroke={colors.chart.line} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Försäljning per kategori */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Försäljning per kategori</Typography>
            <BarChart width={400} height={300} data={Object.entries(salesData.salesByCategory)
              .map(([category, value]) => ({ category, value }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill={colors.chart.bar} />
            </BarChart>
          </Paper>
        </Grid>

        {/* Topp 5 produkter */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>Topp 5 produkter</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Produkt</TableCell>
                    <TableCell align="right">Antal sålda</TableCell>
                    <TableCell align="right">Försäljning</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {salesData.topProducts.map((product) => (
                    <TableRow key={product.name}>
                      <TableCell>{product.name}</TableCell>
                      <TableCell align="right">{product.quantity}</TableCell>
                      <TableCell align="right">
                        {product.value.toLocaleString('sv-SE', {
                          style: 'currency',
                          currency: 'SEK'
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Lägg till dialog-komponenten */}
      <OrderDetailsDialog
        open={isOrderDialogOpen}
        onClose={() => setIsOrderDialogOpen(false)}
        orders={allOrders}
        fromDate={fromDate}
        toDate={toDate}
      />
    </Box>
  );
};

export default SalesDashboard; 