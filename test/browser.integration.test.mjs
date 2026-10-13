import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { PlaywrightAdapter, verify, verifyDownload } from "../src/index.ts";
test(
  "real browser verifies persistence, form response, and completed download",
  { timeout: 30000 },
  async () => {
    const server = createServer((req, res) => {
      if (req.url === "/download") {
        res.writeHead(200, {
          "Content-Type": "text/plain",
          "Content-Disposition": 'attachment; filename="report.txt"',
        });
        res.end("verified artifact");
        return;
      }
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<input id="name"><button id="save">Save</button><form id="form"><button>Submit</button></form><div id="receipt"></div><a href="/download">Download</a><script>nameInput=document.querySelector('#name');nameInput.value=localStorage.getItem('name')||'';document.querySelector('#save').onclick=()=>localStorage.setItem('name',nameInput.value);document.querySelector('#form').onsubmit=e=>{e.preventDefault();document.querySelector('#receipt').textContent='Submitted';};</script>`,
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    let browser;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(process.env.BROWSERASSERT_EXECUTABLE
          ? { executablePath: process.env.BROWSERASSERT_EXECUTABLE }
          : {}),
      });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const adapter = new PlaywrightAdapter(page);
      await page.locator("#name").fill("Persisted");
      await page.locator("#save").click();
      assert.equal(
        (
          await verify(
            { selector: "#name", expected: "Persisted", reload: true },
            adapter,
          )
        ).verdict,
        "verified",
      );
      await page.locator("#name").fill("Unsaved");
      assert.equal(
        (
          await verify(
            {
              selector: "#name",
              expected: "Unsaved",
              reload: true,
              timeoutMs: 1000,
              pollMs: 1500,
            },
            adapter,
          )
        ).verdict,
        "failed",
      );
      await page.locator("#form button").click();
      assert.equal(
        (await verify({ selector: "#receipt", expected: "Submitted" }, adapter))
          .verdict,
        "verified",
      );
      const pending = page.waitForEvent("download");
      await page.getByText("Download", { exact: true }).click();
      assert.equal(
        (
          await verifyDownload(await pending, {
            expectedFilename: "report.txt",
            minBytes: 5,
          })
        ).verdict,
        "verified",
      );
    } finally {
      if (browser) await browser.close();
      await new Promise((r) => server.close(r));
    }
  },
);
