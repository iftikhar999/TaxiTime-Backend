const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class InvoiceService {
    constructor() {
        // Ensure invoices directory exists
        this.invoicesDir = path.join(__dirname, '../uploads/invoices');
        if (!fs.existsSync(this.invoicesDir)) {
            fs.mkdirSync(this.invoicesDir, { recursive: true });
        }
    }

    /**
     * Generate PDF invoice for company billing
     */
    async generateInvoicePDF(invoiceData) {
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({ margin: 50 });
                const filename = `invoice-${invoiceData.invoiceNumber}.pdf`;
                const filepath = path.join(this.invoicesDir, filename);

                // Stream to file
                doc.pipe(fs.createWriteStream(filepath));

                // Header
                this.addHeader(doc, invoiceData);

                // Invoice details
                this.addInvoiceDetails(doc, invoiceData);

                // Company details
                this.addCompanyDetails(doc, invoiceData);

                // Line items
                this.addLineItems(doc, invoiceData);

                // Totals
                this.addTotals(doc, invoiceData);

                // Footer
                this.addFooter(doc, invoiceData);

                doc.end();

                doc.on('end', () => {
                    resolve({
                        filename,
                        filepath,
                        url: `/api/invoices/download/${filename}`
                    });
                });

                doc.on('error', reject);

            } catch (error) {
                reject(error);
            }
        });
    }

    addHeader(doc, invoiceData) {
        // Company logo and details
        doc.fontSize(20)
            .text('AB TAXI PLATFORM', 50, 50)
            .fontSize(10)
            .text('Platform Service Invoice', 50, 80)
            .text('admin@abtaxi.com', 50, 95)
            .text('Phone: +1 (555) 123-4567', 50, 110);

        // Invoice title
        doc.fontSize(24)
            .text('INVOICE', 400, 50);
    }

    addInvoiceDetails(doc, invoiceData) {
        const startY = 150;

        doc.fontSize(12)
            .text(`Invoice Number: ${invoiceData.invoiceNumber}`, 50, startY)
            .text(`Invoice Date: ${new Date(invoiceData.generatedAt).toLocaleDateString()}`, 50, startY + 20)
            .text(`Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}`, 50, startY + 40)
            .text(`Billing Period: ${invoiceData.period}`, 50, startY + 60);
    }

    addCompanyDetails(doc, invoiceData) {
        const startY = 150;

        doc.fontSize(12)
            .text('Bill To:', 350, startY)
            .fontSize(14)
            .text(invoiceData.companyName, 350, startY + 20)
            .fontSize(10)
            .text(invoiceData.companyEmail || '', 350, startY + 40)
            .text(invoiceData.companyPhone || '', 350, startY + 55);
    }

    addLineItems(doc, invoiceData) {
        const startY = 280;
        const tableHeaders = ['Description', 'Quantity', 'Rate', 'Amount'];
        const columnWidths = [250, 80, 80, 80];
        let currentY = startY;

        // Table header
        doc.fontSize(12)
            .fillColor('#000000');

        let currentX = 50;
        tableHeaders.forEach((header, index) => {
            doc.rect(currentX, currentY, columnWidths[index], 25)
                .fillAndStroke('#f0f0f0', '#000000')
                .fillColor('#000000')
                .text(header, currentX + 5, currentY + 8);
            currentX += columnWidths[index];
        });

        currentY += 25;

        // Line items
        const lineItems = [
            {
                description: 'Platform Usage Fee',
                quantity: 1,
                rate: invoiceData.platformFee || 0,
                amount: invoiceData.platformFee || 0
            },
            {
                description: 'Commission (15%)',
                quantity: 1,
                rate: invoiceData.commission || 0,
                amount: invoiceData.commission || 0
            },
            {
                description: 'Subscription Fee',
                quantity: 1,
                rate: invoiceData.subscriptionFee || 0,
                amount: invoiceData.subscriptionFee || 0
            }
        ];

        lineItems.forEach(item => {
            if (item.amount > 0) {
                currentX = 50;

                // Description
                doc.rect(currentX, currentY, columnWidths[0], 20)
                    .stroke()
                    .text(item.description, currentX + 5, currentY + 5);
                currentX += columnWidths[0];

                // Quantity
                doc.rect(currentX, currentY, columnWidths[1], 20)
                    .stroke()
                    .text(item.quantity.toString(), currentX + 5, currentY + 5);
                currentX += columnWidths[1];

                // Rate
                doc.rect(currentX, currentY, columnWidths[2], 20)
                    .stroke()
                    .text(`$${item.rate.toFixed(2)}`, currentX + 5, currentY + 5);
                currentX += columnWidths[2];

                // Amount
                doc.rect(currentX, currentY, columnWidths[3], 20)
                    .stroke()
                    .text(`$${item.amount.toFixed(2)}`, currentX + 5, currentY + 5);

                currentY += 20;
            }
        });

        return currentY;
    }

    addTotals(doc, invoiceData) {
        const startY = 450;
        const rightAlign = 400;

        doc.fontSize(12);

        // Subtotal
        doc.text('Subtotal:', rightAlign, startY)
            .text(`$${(invoiceData.subtotal || 0).toFixed(2)}`, rightAlign + 100, startY);

        // Tax
        if (invoiceData.tax > 0) {
            doc.text('Tax:', rightAlign, startY + 20)
                .text(`$${invoiceData.tax.toFixed(2)}`, rightAlign + 100, startY + 20);
        }

        // Total
        doc.fontSize(14)
            .text('Total:', rightAlign, startY + (invoiceData.tax > 0 ? 40 : 20))
            .text(`$${invoiceData.total.toFixed(2)}`, rightAlign + 100, startY + (invoiceData.tax > 0 ? 40 : 20));
    }

    addFooter(doc, invoiceData) {
        const footerY = 650;

        doc.fontSize(10)
            .text('Payment Terms:', 50, footerY)
            .text('Payment is due within 30 days of invoice date.', 50, footerY + 15)
            .text('Late payments may incur additional fees.', 50, footerY + 30)
            .text('Thank you for using AB Taxi Platform!', 50, footerY + 50);
    }

    /**
     * Create invoice record in database
     */
    async createInvoiceRecord(invoiceData, pdfInfo) {
        try {
            const invoice = await prisma.invoice.create({
                data: {
                    invoiceNumber: invoiceData.invoiceNumber,
                    companyId: invoiceData.companyId,
                    amount: invoiceData.total,
                    tax: invoiceData.tax || 0,
                    subtotal: invoiceData.subtotal || invoiceData.total,
                    currency: 'USD',
                    status: 'GENERATED',
                    dueDate: invoiceData.dueDate,
                    issuedAt: invoiceData.generatedAt,
                    billingPeriod: invoiceData.period,
                    pdfPath: pdfInfo.filepath,
                    pdfUrl: pdfInfo.url,
                    lineItems: {
                        platformFee: invoiceData.platformFee || 0,
                        commission: invoiceData.commission || 0,
                        subscriptionFee: invoiceData.subscriptionFee || 0
                    }
                }
            });

            return invoice;
        } catch (error) {
            console.error('Error creating invoice record:', error);
            throw error;
        }
    }

    /**
     * Send invoice via email (mock implementation)
     */
    async sendInvoiceEmail(invoice, companyEmail) {
        try {
            // In a real implementation, you would:
            // 1. Use a service like SendGrid, AWS SES, or Nodemailer
            // 2. Send the PDF as an attachment
            // 3. Include payment instructions
            // 4. Track email delivery status

            console.log(`Mock: Sending invoice ${invoice.invoiceNumber} to ${companyEmail}`);

            // Update invoice to mark as sent
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: 'SENT',
                    sentAt: new Date()
                }
            });

            return { sent: true, email: companyEmail };
        } catch (error) {
            console.error('Error sending invoice email:', error);
            throw error;
        }
    }

    /**
     * Generate and process complete invoice
     */
    async processInvoice(companyId, billingData, period) {
        try {
            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: { subscriptionPlan: true }
            });

            if (!company) {
                throw new Error('Company not found');
            }

            // Prepare invoice data
            const invoiceNumber = `INV-${company.id.slice(-8).toUpperCase()}-${Date.now()}`;
            const invoiceData = {
                invoiceNumber,
                companyId: company.id,
                companyName: company.legalName || company.brandName || 'Company',
                companyEmail: company.email,
                companyPhone: company.phone,
                period,
                generatedAt: new Date(),
                dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                platformFee: billingData.platformFee || 0,
                commission: billingData.commission || 0,
                subscriptionFee: billingData.subscriptionFee || 0,
                subtotal: (billingData.platformFee || 0) + (billingData.commission || 0) + (billingData.subscriptionFee || 0),
                tax: 0, // Add tax calculation if needed
                total: (billingData.platformFee || 0) + (billingData.commission || 0) + (billingData.subscriptionFee || 0)
            };

            // Generate PDF
            const pdfInfo = await this.generateInvoicePDF(invoiceData);

            // Create database record
            const invoice = await this.createInvoiceRecord(invoiceData, pdfInfo);

            // Send email (optional)
            if (company.email) {
                await this.sendInvoiceEmail(invoice, company.email);
            }

            return invoice;
        } catch (error) {
            console.error('Error processing invoice:', error);
            throw error;
        }
    }
}

module.exports = new InvoiceService();