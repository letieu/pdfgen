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

let browserInstance;

async function startBrowser() {
    console.log('Starting browser instance...');
    try {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        browserInstance.on('disconnected', () => {
            console.log('Browser disconnected. Attempting to restart...');
            startBrowser();
        });
        console.log('Browser instance started successfully.');
    } catch (error) {
        console.error('Could not start browser.', error);
        // Exit if the browser can't be started, as the app is useless without it.
        process.exit(1);
    }
}

app.post('/generate-pdf', upload.single(uploadFieldName), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No HTML file was uploaded.');
    }
    if (!browserInstance) {
        return res.status(503).send('Browser service is not ready. Please try again later.');
    }

    const html = req.file.buffer.toString('utf-8');
    let page;

    try {
        page = await browserInstance.newPage();
        await page.setContent(html, { 
            waitUntil: 'networkidle0',
            timeout: 60000 // 60 seconds timeout
        });

        const pdf = await page.pdf({
            printBackground: true,
            format: 'A4',
        });

        res.header(corsHeaders);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=result.pdf');
        res.send(pdf);
    } catch (error) {
        console.error('An error occurred while generating the PDF:', error);
        res.status(500).send('An error occurred while generating the PDF.');
    } finally {
        if (page) {
            await page.close();
        }
    }
});

async function main() {
    await startBrowser();
    app.listen(port, () => {
        console.log(`PDF generator service listening at http://localhost:${port}`);
    });
}

async function cleanup() {
    console.log('Closing browser instance...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

main();
