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

// Concurrency control: limit simultaneous PDF generation
const MAX_CONCURRENT_PAGES = 5; // Adjust based on your server capacity
let activeTasks = 0;
const taskQueue = [];

async function acquireSlot() {
    if (activeTasks < MAX_CONCURRENT_PAGES) {
        activeTasks++;
        return Promise.resolve();
    }
    
    // Wait in queue
    return new Promise((resolve) => {
        taskQueue.push(resolve);
    });
}

function releaseSlot() {
    activeTasks--;
    if (taskQueue.length > 0) {
        const nextTask = taskQueue.shift();
        activeTasks++;
        nextTask();
    }
}

async function startBrowser() {
    console.log('Starting browser instance...');
    try {
        browserInstance = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Overcome limited resource problems
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // Run in single process mode for better stability
            ]
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
    let slotAcquired = false;

    try {
        // Wait for available slot before creating new page
        await acquireSlot();
        slotAcquired = true;
        console.log(`Processing PDF (active: ${activeTasks}, queued: ${taskQueue.length})`);
        
        // Check if client is still connected after waiting in queue
        if (req.aborted || res.writableEnded) {
            console.log('Client disconnected while waiting in queue');
            return;
        }
        
        page = await browserInstance.newPage();
        
        // Use 'load' instead of 'networkidle0' to avoid hanging on slow/failed network requests
        // 'load' waits for DOM and resources but doesn't wait for network to be completely idle
        await page.setContent(html, { 
            waitUntil: 'load',
            timeout: 30000
        });
        
        // Check if client is still connected after loading content
        if (req.aborted || res.writableEnded) {
            console.log('Client disconnected during page load');
            return;
        }
        
        // Wait for fonts to be ready (important for Vietnamese characters)
        await page.evaluateHandle('document.fonts.ready');

        const pdf = await page.pdf({
            printBackground: true,
            format: 'A4',
        });

        // Check if client is still connected before sending response
        if (req.aborted || res.writableEnded) {
            console.log('Client disconnected before sending PDF');
            return;
        }

        res.header(corsHeaders);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=result.pdf');
        res.send(pdf);
    } catch (error) {
        // Only send error response if client is still connected
        if (!req.aborted && !res.writableEnded) {
            console.error('An error occurred while generating the PDF:', error);
            res.status(500).send('An error occurred while generating the PDF.');
        } else {
            console.log('Client disconnected, error during processing:', error.message);
        }
    } finally {
        if (page) {
            try {
                // Check if page is still open before trying to close it
                if (!page.isClosed()) {
                    await page.close();
                }
            } catch (err) {
                // Silently ignore errors when page is already closed or browser disconnected
                if (err.message && !err.message.includes('closed') && !err.message.includes('Protocol error')) {
                    console.error('Error closing page:', err);
                }
            }
        }
        if (slotAcquired) {
            releaseSlot();
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
