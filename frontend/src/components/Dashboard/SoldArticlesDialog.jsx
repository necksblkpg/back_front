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

const SoldArticlesDialog = ({ open, onClose, orders }) => {
  // Visar alla rader (bundles + barn)
  const sortedOrders = useMemo(() => {
    if (!orders) return [];
    return [...orders].sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
  }, [orders]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Sålda artiklar
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

export default SoldArticlesDialog;
