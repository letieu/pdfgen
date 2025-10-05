import puppeteer from "@cloudflare/puppeteer";

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default {
  async fetch(request: Request, env: any) {
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

    if (request.method !== 'POST') {
      return new Response('Please send a POST request with multipart/form-data. Required files: "invoice.html", "details.js", "sign-check.jpg", "viewinvoice-bg.jpg"', { status: 405 });
    }

    const formData = await request.formData();

    const invoiceHtmlFile = formData.get('invoice.html');
    const detailsJsFile = formData.get('details.js');
    const signCheckImageFile = formData.get('sign-check.jpg');
    const viewInvoiceBgImageFile = formData.get('viewinvoice-bg.jpg');

    if (!(invoiceHtmlFile instanceof File)) {
      return new Response('Missing "invoice.html" file in form data.', { status: 400 });
    }
    if (!(detailsJsFile instanceof File)) {
      return new Response('Missing "details.js" file in form data.', { status: 400 });
    }
    if (!(signCheckImageFile instanceof File)) {
        return new Response('Missing "sign-check.jpg" file in form data.', { status: 400 });
    }
    if (!(viewInvoiceBgImageFile instanceof File)) {
        return new Response('Missing "viewinvoice-bg.jpg" file in form data.', { status: 400 });
    }

    let html = await invoiceHtmlFile.text();
    const jsContent = await detailsJsFile.text();

    const signCheckImageBase64 = arrayBufferToBase64(await signCheckImageFile.arrayBuffer());
    const viewInvoiceBgImageBase64 = arrayBufferToBase64(await viewInvoiceBgImageFile.arrayBuffer());

    // 1. Inline JavaScript
    html = html.replace('<script type="text/javascript" src="details.js"></script>', `<script>${jsContent}</script>`);

    // 2. Inline images by replacing their URLs with Base64 data URIs.
    // This handles variations like url(file.jpg), url("file.jpg"), and url('file.jpg').
    const bgImageDataBase64 = `data:image/jpeg;base64,${viewInvoiceBgImageBase64}`;
    html = html.replaceAll('url(viewinvoice-bg.jpg)', `url(${bgImageDataBase64})`);
    html = html.replaceAll('url("viewinvoice-bg.jpg")', `url(${bgImageDataBase64})`);
    html = html.replaceAll("url('viewinvoice-bg.jpg')", `url(${bgImageDataBase64})`);

    const signCheckDataBase64 = `data:image/jpeg;base64,${signCheckImageBase64}`;
    html = html.replaceAll('url(sign-check.jpg)', `url(${signCheckDataBase64})`);
    html = html.replaceAll('url("sign-check.jpg")', `url(${signCheckDataBase64})`);
    html = html.replaceAll("url('sign-check.jpg')", `url(${signCheckDataBase64})`);


    // 3. Launch browser and generate PDF
    const browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    // Set content and wait for network activity to finish
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      printBackground: true,
      format: 'A4',
    });

    await browser.close();

    // 4. Return the generated PDF
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="invoice.pdf"',
				...corsHeaders,
      },
    });
  },
};
