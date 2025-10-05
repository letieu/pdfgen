const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const port = 3001;

// Middleware to parse urlencoded bodies
app.use(express.urlencoded({ extended: true }));

app.post('/generate-pdf', async (req, res) => {
    let html = req.body.html;

    if (!html) {
        return res.status(400).send('HTML content is missing from the request body.');
    }

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