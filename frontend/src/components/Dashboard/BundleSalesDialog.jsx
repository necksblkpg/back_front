import React, { useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const BundleSalesDialog = ({ open, onClose, orders }) => {
  const filteredOrders = useMemo(() => {
    if (!orders) return [];

    // 1. Hitta alla order_number som har minst en rad med isBundle = true
    const bundleOrderNumbers = new Set();
    orders.forEach(o => {
      if (o.isBundle) {
        bundleOrderNumbers.add(o.order_number);
      }
    });

    // 2. Om ordern har bundlerad -> behåll BARA isBundle-rader
    //    Om ordern inte har bundlerad -> behåll alla rader
    return orders.filter(o => {
      if (bundleOrderNumbers.has(o.order_number)) {
        // Om en order har en bundlerad -> visa enbart bundleraden
        return o.isBundle === true;
      } else {
        // Order saknar bundlerad -> visa alla rader
        return true;
      }
    });
  }, [orders]);

  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
  }, [filteredOrders]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Total försäljning (bundlar grupperade)
        <IconButton onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Ordernummer</TableCell>
              <TableCell>Datum</TableCell>
              <TableCell>Produkt</TableCell>
              <TableCell align="right">Antal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedOrders.map((order, index) => (
              <TableRow key={index}>
                <TableCell>{order.order_number}</TableCell>
                <TableCell>{order.order_date}</TableCell>
                <TableCell>{order.product_name}</TableCell>
                <TableCell align="right">{order.quantity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
};

export default BundleSalesDialog;
