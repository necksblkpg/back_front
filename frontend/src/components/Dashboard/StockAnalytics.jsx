import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import {
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Button,
  Stack,
  Tooltip as MuiTooltip,
} from '@mui/material';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { gql } from '@apollo/client';
import DownloadIcon from '@mui/icons-material/Download';
import InfoIcon from '@mui/icons-material/Info';

// GraphQL query definition
const GET_STOCK_DATA = gql`
  query GetProducts($limit: Int!, $page: Int!) {
    products(limit: $limit, page: $page) {
      id
      name
      collection {
        name
      }
      variants {
        name
        prices {
          price {
            value
            currency {
              code
            }
          }
        }
        productSizes {
          quantity
          size {
            name
          }
        }
      }
    }
  }
`;

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
const STOCK_THRESHOLDS = {
  LOW: 5,
  MEDIUM: 20,
};

// Move helper functions outside component
const processDistributionData = (distribution) => {
  return Object.entries(distribution).map(([key, value]) => {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    const percentage = ((value / total) * 100).toFixed(1);
    return {
      name: key.replace('_', ' ').toUpperCase(),
      value,
      percentage: `${percentage}%`
    };
  });
};

const processCollectionData = (distribution) => {
  return Object.entries(distribution).map(([key, value]) => {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    const percentage = ((value / total) * 100).toFixed(1);
    return {
      name: key || 'Ingen kollektion',
      value,
      percentage: `${percentage}%`
    };
  });
};

const StockAnalytics = () => {
  const [filterBy, setFilterBy] = useState('all');
  const [stockThreshold, setStockThreshold] = useState('all');
  const [allProducts, setAllProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: '?' });
  const [hasMoreProducts, setHasMoreProducts] = useState(true);

  const { loading, error, data, fetchMore } = useQuery(GET_STOCK_DATA, {
    variables: { limit: 100, page: 1 },
    fetchPolicy: 'network-only',
    onCompleted: async (data) => {
      if (data?.products) {
        setAllProducts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newProducts = data.products.filter(p => !existingIds.has(p.id));
          return [...prev, ...newProducts];
        });
        
        setLoadingProgress(prev => ({
          ...prev,
          loaded: prev.loaded + data.products.length
        }));

        // Om vi fick exakt 100 produkter finns det troligen fler
        const hasMore = data.products.length === 100;
        setHasMoreProducts(hasMore);
        
        if (hasMore) {
          setPage(prev => prev + 1);
          setIsLoadingMore(true);
        }
      }
    }
  });

  useEffect(() => {
    const loadNextPage = async () => {
      if (!isLoadingMore || !hasMoreProducts) return;

      try {
        const result = await fetchMore({
          variables: { limit: 100, page },
        });

        if (result.data?.products) {
          setAllProducts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newProducts = result.data.products.filter(p => !existingIds.has(p.id));
            return [...prev, ...newProducts];
          });

          setLoadingProgress(prev => ({
            ...prev,
            loaded: prev.loaded + result.data.products.length
          }));

          const hasMore = result.data.products.length === 100;
          setHasMoreProducts(hasMore);

          if (hasMore) {
            setPage(p => p + 1);
          } else {
            setIsLoadingMore(false);
          }
        }
      } catch (error) {
        console.error('Error loading more products:', error);
        setIsLoadingMore(false);
        setHasMoreProducts(false);
      }
    };

    loadNextPage();
  }, [page, isLoadingMore, hasMoreProducts, fetchMore]);

  const stockData = useMemo(() => {
    if (!allProducts.length) return null;
    return analyzeStockData(allProducts);
  }, [allProducts]);

  const distributionData = useMemo(() => {
    if (!stockData) return [];
    return processDistributionData(stockData.stock_distribution);
  }, [stockData]);

  const collectionData = useMemo(() => {
    if (!stockData) return [];
    return processCollectionData(stockData.collection_distribution);
  }, [stockData]);

  const collections = useMemo(() => {
    if (!data?.products) return ['all'];
    return ['all', ...new Set(data.products.map(product => product.collection?.name).filter(Boolean))];
  }, [data]);

  // Callbacks
  const handlePieClick = useCallback((data) => {
    if (data.name === 'Ingen kollektion') {
      setFilterBy('all');
    } else {
      setFilterBy(data.name);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (!stockData || !data?.products) return;
    const csvContent = generateCSV(stockData, data.products);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = window.URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `lageranalys_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, [stockData, data]);

  const handleStockThresholdChange = useCallback((e) => {
    setStockThreshold(e.target.value);
  }, []);

  const handleFilterByChange = useCallback((e) => {
    setFilterBy(e.target.value);
  }, []);

  if (loading || isLoadingMore) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh', gap: 2 }}>
        <CircularProgress />
        <Typography>
          Laddar produkter... ({loadingProgress.loaded} produkter laddade)
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        Kunde inte hämta lagerdata: {error.message}
      </Alert>
    );
  }

  if (!stockData || !stockData.all_items) {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        Ingen lagerdata tillgänglig
      </Alert>
    );
  }

  return (
    <Grid container spacing={3}>
      {/* Filter Controls */}
      <Grid item xs={12}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2}>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Filtrera efter kollektion</InputLabel>
              <Select
                value={filterBy}
                onChange={handleFilterByChange}
                label="Filtrera efter kollektion"
              >
                <MenuItem value="all">Alla kollektioner</MenuItem>
                {collections.map((collection) => (
                  collection !== 'all' && (
                    <MenuItem key={collection} value={collection}>
                      {collection}
                    </MenuItem>
                  )
                ))}
              </Select>
            </FormControl>

            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Lagernivå</InputLabel>
              <Select
                value={stockThreshold}
                onChange={handleStockThresholdChange}
                label="Lagernivå"
              >
                <MenuItem value="all">Alla nivåer</MenuItem>
                <MenuItem value="out">Slut i lager</MenuItem>
                <MenuItem value="low">Lågt lager</MenuItem>
                <MenuItem value="medium">Medium lager</MenuItem>
                <MenuItem value="high">Högt lager</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
          >
            Exportera data
          </Button>
        </Stack>
      </Grid>

      {/* All Products List */}
      <Grid item xs={12}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" component="div">
                Alla Produkter
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                Visar {stockData.all_items.filter(item => 
                  (filterBy === 'all' || item.collection === filterBy) &&
                  (stockThreshold === 'all' || getStockLevel(item.stock) === stockThreshold)
                ).length} produkter
              </Typography>
            </Box>
            <List>
              {stockData.all_items
                .filter(item => 
                  (filterBy === 'all' || item.collection === filterBy) &&
                  (stockThreshold === 'all' || getStockLevel(item.stock) === stockThreshold)
                )
                .map((item, index) => (
                <ListItem key={index} divider>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography component="div" variant="subtitle1">
                          {item.product_name} - {item.variant_name}
                        </Typography>
                        <Typography component="div" variant="body2">
                          {new Intl.NumberFormat('sv-SE', {
                            style: 'currency',
                            currency: 'SEK'
                          }).format(item.total_value)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                        <Typography component="div" variant="body2">
                          Lager: {item.stock} {item.size ? `(${item.size})` : ''}
                        </Typography>
                        <Typography component="div" variant="body2">
                          Pris: {new Intl.NumberFormat('sv-SE', {
                            style: 'currency',
                            currency: 'SEK'
                          }).format(item.price)}
                        </Typography>
                        {item.collection && (
                          <Typography component="div" variant="body2">
                            Kollektion: {item.collection}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <Chip
                    label={getStockLevelLabel(item.stock)}
                    color={getStockLevelColor(item.stock)}
                    size="small"
                    sx={{ ml: 2 }}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};

const analyzeStockData = (products) => {
  const stockData = {
    all_items: [],
    stock_distribution: {
      out_of_stock: 0,
      low_stock: 0,
      medium_stock: 0,
      high_stock: 0
    },
    collection_distribution: {},
    total_items: 0,
    total_value: 0,
    largest_collection: 'N/A'
  };

  // Initialize collection tracking
  const collectionCounts = {};

  products.forEach(product => {
    // Track collection distribution
    const collectionName = product.collection?.name || 'Ingen kollektion';
    collectionCounts[collectionName] = (collectionCounts[collectionName] || 0) + 1;
    stockData.collection_distribution[collectionName] = (stockData.collection_distribution[collectionName] || 0) + 1;

    product.variants.forEach(variant => {
      const totalStock = variant.productSizes.reduce((sum, sizeItem) => sum + (sizeItem.quantity || 0), 0);
      const priceInfo = variant.prices.find(p => p.price.currency.code === 'SEK') || variant.prices[0];
      const variantPrice = priceInfo ? parseFloat(priceInfo.price.value) : 0;

      stockData.total_items += totalStock;
      stockData.total_value += totalStock * variantPrice;

      variant.productSizes.forEach(sizeItem => {
        const stock = sizeItem.quantity || 0;
        // Add all items to the all_items array
        stockData.all_items.push({
          product_name: product.name,
          variant_name: variant.name,
          stock: stock,
          size: sizeItem.size?.name,
          collection: product.collection?.name,
          price: variantPrice,
          total_value: stock * variantPrice
        });

        if (stock === 0) {
          stockData.stock_distribution.out_of_stock++;
        } else if (stock < 5) {
          stockData.stock_distribution.low_stock++;
        } else if (stock < 20) {
          stockData.stock_distribution.medium_stock++;
        } else {
          stockData.stock_distribution.high_stock++;
        }
      });
    });
  });

  // Find largest collection
  stockData.largest_collection = Object.entries(collectionCounts)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];

  return stockData;
};

// Helper function to get stock level
const getStockLevel = (stock) => {
  if (stock === 0) return 'out';
  if (stock < STOCK_THRESHOLDS.LOW) return 'low';
  if (stock < STOCK_THRESHOLDS.MEDIUM) return 'medium';
  return 'high';
};

// Helper function to get stock level label
const getStockLevelLabel = (stock) => {
  const level = getStockLevel(stock);
  const labels = {
    out: 'Slut i lager',
    low: 'Lågt lager',
    medium: 'Medium lager',
    high: 'Högt lager'
  };
  return labels[level];
};

// Helper function to get stock level color
const getStockLevelColor = (stock) => {
  const level = getStockLevel(stock);
  const colors = {
    out: 'error',
    low: 'warning',
    medium: 'info',
    high: 'success'
  };
  return colors[level];
};

// Enhanced CSV generation
const generateCSV = (stockData, products) => {
  const headers = [
    'Produkt',
    'Kollektion',
    'Variant',
    'Storlek',
    'Lagernivå',
    'Status',
    'Pris (SEK)',
    'Totalt värde'
  ];

  const rows = [];
  products.forEach(product => {
    product.variants.forEach(variant => {
      variant.productSizes.forEach(sizeItem => {
        const priceInfo = variant.prices.find(p => p.price.currency.code === 'SEK') || variant.prices[0];
        const price = priceInfo ? parseFloat(priceInfo.price.value) : 0;
        
        rows.push([
          product.name,
          product.collection?.name || 'Ingen kollektion',
          variant.name,
          sizeItem.size?.name || 'N/A',
          sizeItem.quantity || 0,
          getStockLevelLabel(sizeItem.quantity || 0),
          price,
          price * (sizeItem.quantity || 0)
        ]);
      });
    });
  });

  return [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
};

export default StockAnalytics; 