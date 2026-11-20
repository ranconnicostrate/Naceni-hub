import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { Order } from '../types/index.ts';

export function exportRowsToExcel(
  filename: string,
  sheetName: string,
  rows: Record<string, unknown>[]
) {
  const safeRows = rows.length > 0 ? rows : [{ Status: 'No records found' }];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportReportToPdf(
  title: string,
  generatedAt: string,
  rows: Record<string, unknown>[]
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 68, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Naceni's Business — Smart Construction Supply", 36, 30);
  doc.setFontSize(11);
  doc.setTextColor(249, 115, 22);
  doc.text(`${title}  |  Generated: ${new Date(generatedAt).toLocaleString()}`, 36, 50);

  if (rows.length === 0) {
    doc.setTextColor(30, 41, 59);
    doc.text('No records available for the selected report.', 36, 100);
  } else {
    const columns = Object.keys(rows[0]);
    const body = rows.map((r) =>
      columns.map((c) => {
        const val = r[c];
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') return val.toLocaleString('en-US');
        return String(val);
      })
    );

    autoTable(doc, {
      startY: 84,
      head: [columns],
      body,
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [11, 31, 58], textColor: 255 },
      alternateRowStyles: { fillColor: [244, 246, 250] },
    });
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  doc.save(`nacenis-${slug}.pdf`);
}

export function downloadOrderInvoicePdf(order: Order) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, 595, 86, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("NACENI'S BUSINESS", 36, 38);
  doc.setFontSize(10);
  doc.setTextColor(249, 115, 22);
  doc.text('CONSTRUCTION TOOLS · PLUMBING · ELECTRICAL · MATERIALS', 36, 56);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(`INVOICE ${order.invoiceNumber || order.orderNumber}`, 410, 38);
  doc.setFontSize(9.5);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, 410, 56);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text('Billed & Delivered To:', 36, 118);
  doc.setFontSize(10);
  doc.text(order.shippingAddress?.recipientName || order.customerName || 'Client', 36, 136);
  doc.text(order.shippingAddress?.streetAddress || '', 36, 152);
  doc.text(
    `${order.shippingAddress?.district || ''}, ${order.shippingAddress?.province || ''}`,
    36,
    168
  );
  doc.text(`Phone: ${order.shippingAddress?.phone || ''}`, 36, 184);

  doc.text(`Order Status: ${order.status}`, 380, 136);
  doc.text(`Payment: ${order.paymentStatus}`, 380, 152);
  doc.text(`Type: ${order.orderType}`, 380, 168);

  autoTable(doc, {
    startY: 205,
    head: [['SKU', 'Product', 'Qty', 'Unit Price (Rwf)', 'Line Total (Rwf)']],
    body: order.items.map((item) => [
      item.sku,
      item.productName,
      String(item.quantity),
      item.unitPriceRwf.toLocaleString('en-US'),
      item.lineTotalRwf.toLocaleString('en-US'),
    ]),
    headStyles: { fillColor: [11, 31, 58] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 360;
  doc.setFontSize(10.5);
  doc.text(`Subtotal: Rwf ${order.subtotalRwf.toLocaleString('en-US')}`, 380, finalY + 28);
  doc.text(`VAT (18%): Rwf ${order.taxRwf.toLocaleString('en-US')}`, 380, finalY + 46);
  doc.text(
    `Delivery Fee: Rwf ${order.deliveryFeeRwf.toLocaleString('en-US')}`,
    380,
    finalY + 64
  );
  doc.setFontSize(13);
  doc.setTextColor(249, 115, 22);
  doc.text(
    `Total: Rwf ${order.totalRwf.toLocaleString('en-US')}`,
    380,
    finalY + 88
  );

  doc.save(`${order.invoiceNumber || order.orderNumber}.pdf`);
}

export function downloadQuotationPdf(quote: {
  quoteNumber: string;
  companyName?: string | null;
  customerName: string;
  status: string;
  subtotalRwf: number;
  discountRwf: number;
  totalRwf: number;
  createdAt: string;
  items: {
    sku: string;
    productName: string;
    quantity: number;
    quotedPriceRwf: number;
    lineTotalRwf: number;
  }[];
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, 595, 80, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("NACENI'S BUSINESS — B2B QUOTATION", 36, 36);
  doc.setFontSize(10);
  doc.setTextColor(249, 115, 22);
  doc.text(
    `Quote #: ${quote.quoteNumber}  |  Status: ${quote.status}  |  Date: ${new Date(quote.createdAt).toLocaleDateString()}`,
    36,
    56
  );

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.text(`Prepared For: ${quote.companyName || quote.customerName}`, 36, 110);

  autoTable(doc, {
    startY: 132,
    head: [['SKU', 'Item', 'Quantity', 'Quoted Unit (Rwf)', 'Total (Rwf)']],
    body: quote.items.map((item) => [
      item.sku,
      item.productName,
      String(item.quantity),
      item.quotedPriceRwf.toLocaleString('en-US'),
      item.lineTotalRwf.toLocaleString('en-US'),
    ]),
    headStyles: { fillColor: [11, 31, 58] },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || 300;
  doc.setFontSize(10.5);
  doc.text(`Retail Subtotal: Rwf ${quote.subtotalRwf.toLocaleString('en-US')}`, 360, finalY + 28);
  doc.text(`Bulk Discount: -Rwf ${quote.discountRwf.toLocaleString('en-US')}`, 360, finalY + 46);
  doc.setFontSize(13);
  doc.setTextColor(249, 115, 22);
  doc.text(`Net Quoted Total: Rwf ${quote.totalRwf.toLocaleString('en-US')}`, 360, finalY + 70);

  doc.save(`${quote.quoteNumber}.pdf`);
}
