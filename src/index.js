const express = require('express');
const puppeteer = require('puppeteer');
const multer = require('multer');

const app = express();
const port = 3001;

// Configure multer for single file upload in memory
const upload = multer({ storage: multer.memoryStorage() });
const uploadFieldName = 'html';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

app.post('/generate-pdf', upload.single(uploadFieldName), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No HTML file was uploaded.');
    }

    // Get HTML content from the uploaded file's buffer
    const html = req.file.buffer.toString('utf-8');

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdf = await page.pdf({
            printBackground: true,
            format: 'A4',
        });

			  res.header(corsHeaders);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=result.pdf');
        res.send(pdf);
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while generating the PDF.');
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(port, () => {
    console.log(`PDF generator service listening at http://localhost:${port}`);
});
