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

const TotalSalesDialog = ({ open, onClose, orders }) => {
  /**
   * 1. Gruppera rader per order_number.
   * 2. Om en order har en eller flera bundlerader:
   *    - Parse childProductNumbers och ta bort barnrader.
   * 3. Beräkna total_quantity och maxSek för att undvika dubbelsummering.
   * 4. Stand-alone produkter (som ej är barn) behålls.
   */
  const groupedOrders = useMemo(() => {
    if (!orders) return [];

    // Steg 1: Gruppera i en Map
    const map = new Map();
    orders.forEach(line => {
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

      // Välj tidigaste datum
      if (line.order_date < group.date) {
        group.date = line.order_date;
      }
    });

    // Steg 2: Ta bort barnrader om bundlerad
    const arr = [...map.values()];
    arr.forEach(orderGroup => {
      let finalLines = [...orderGroup.lines];
      const bundleLines = finalLines.filter(l => l.isBundle);

      if (bundleLines.length > 0) {
        // För varje bundlerad
        bundleLines.forEach(bundleLine => {
          if (!bundleLine.childProductNumbers) return;
          const childSkus = new Set(
            bundleLine.childProductNumbers
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          );

          // Filtrera bort barnrader
          finalLines = finalLines.filter(line => {
            // Behåll bundlerader
            if (line.isBundle) return true;
            // Om line.productNumber finns i childSkus -> barn, ta bort
            if (childSkus.has(line.productNumber)) {
              return false;
            }
            // Annars behåll
            return true;
          });
        });
      }

      // Steg 3: Beräkna total_quantity och maxSek
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

    // Sortera på datum (nyaste först)
    arr.sort((a, b) => new Date(b.date) - new Date(a.date));
    return arr;
  }, [orders]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Total försäljning (en rad per order)
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
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
      </DialogContent>
    </Dialog>
  );
};

export default TotalSalesDialog;
