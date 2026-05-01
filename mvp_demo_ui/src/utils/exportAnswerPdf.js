import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Rasterize a DOM node to a multi-page A4 PDF (client-side).
 */
export async function exportElementToPdf(element, { filename = 'answer.pdf' } = {}) {
  if (!element) return;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#14161c',
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const pdfImageWidth = pageWidth - margin * 2;
  const pdfImageHeight = (canvas.height * pdfImageWidth) / canvas.width;
  const pageContentHeight = pageHeight - margin * 2;

  let yPosition = 0;
  let pageIndex = 0;

  while (yPosition < pdfImageHeight) {
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin - yPosition, pdfImageWidth, pdfImageHeight);
    yPosition += pageContentHeight;
    pageIndex += 1;
  }

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}
