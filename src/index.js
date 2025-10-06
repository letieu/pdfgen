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

// Concurrency control: limit simultaneous PDF generation
const MAX_CONCURRENT_TASKS = 3; // Reduce concurrent tasks since each gets its own browser
let activeTasks = 0;
const taskQueue = [];

// Browser launch configuration
const BROWSER_CONFIG = {
	headless: 'new', // Use new headless mode
	args: [
		'--no-sandbox',
		'--disable-setuid-sandbox',
		'--disable-dev-shm-usage',
		'--disable-gpu',
		'--no-first-run',
		'--no-zygote',
		'--single-process',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-renderer-backgrounding',
	],
	protocolTimeout: 120000, // 2 minutes timeout
};

async function acquireSlot() {
	if (activeTasks < MAX_CONCURRENT_TASKS) {
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

async function createBrowserInstance() {
	console.log('Launching new browser instance...');
	const browser = await puppeteer.launch(BROWSER_CONFIG);
	return browser;
}

app.post('/generate-pdf', upload.single(uploadFieldName), async (req, res) => {
	if (!req.file) {
		return res.status(400).send('No HTML file was uploaded.');
	}

	const html = req.file.buffer.toString('utf-8');
	let browser = null;
	let page = null;
	let slotAcquired = false;

	try {
		// Wait for available slot before creating new browser
		await acquireSlot();
		slotAcquired = true;
		console.log(`Processing PDF (active: ${activeTasks}, queued: ${taskQueue.length})`);

		// Check if client is still connected after waiting in queue
		if (req.aborted || res.writableEnded) {
			console.log('Client disconnected while waiting in queue');
			return;
		}

		// Create a fresh browser instance for this request
		browser = await createBrowserInstance();

		// Create page and generate PDF
		page = await browser.newPage();

		// Set a longer default timeout for the page
		page.setDefaultTimeout(60000);

		// Use 'load' instead of 'networkidle0' to avoid hanging on slow/failed network requests
		await page.setContent(html, {
			waitUntil: 'load',
			timeout: 30000,
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
			timeout: 60000,
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

		console.log('PDF generated successfully');
	} catch (error) {
		// Only send error response if client is still connected
		if (!req.aborted && !res.writableEnded) {
			console.error('An error occurred while generating the PDF:', error);
			res.status(500).send('An error occurred while generating the PDF: ' + error.message);
		} else {
			console.log('Client disconnected, error during processing:', error.message);
		}
	} finally {
		// Always clean up resources
		try {
			if (page && !page.isClosed()) {
				await page.close();
			}
		} catch (err) {
			console.error('Error closing page:', err.message);
		}

		try {
			if (browser) {
				await browser.close();
				console.log('Browser instance closed');
			}
		} catch (err) {
			console.error('Error closing browser:', err.message);
		}

		if (slotAcquired) {
			releaseSlot();
		}
	}
});

async function main() {
	app.listen(port, () => {
		console.log(`PDF generator service listening at http://localhost:${port}`);
		console.log('Using fresh browser instance per request approach');
	});
}

async function cleanup() {
	console.log('Shutting down server...');
	process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

main();
