import puppeteer from "puppeteer-core";
import { createApp } from "../api/_lib/app.ts";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.TT_MEMORY_SHEET = "1";
process.env.ADMIN_PASSWORD = "test";
process.env.GOOGLE_SPREADSHEET_ID = "memory";
process.env.GOOGLE_CLIENT_EMAIL = "memory@test";
process.env.GOOGLE_PRIVATE_KEY = "memory";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4711;
const OUT = process.argv[2] || "/tmp/tt-shots";

const app = createApp();
app.use(express.static(path.join(root, "dist")));
app.get("*", (_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
const server = app.listen(PORT);

const seedEmployee = {
  employeeId: "E1",
  name: "Alice Rahman",
  email: "alice@10ms.test",
  department: "Tech",
  designation: "SWE",
  lineManagerName: "Mgr One",
  lineManagerEmail: "mgr1@10ms.test",
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--window-size=1440,1000"],
});

async function shot(name, url, { dark = false, auth = true, before } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    (emp, dark, auth) => {
      localStorage.clear();
      if (auth) localStorage.setItem("tt_employee", JSON.stringify(emp));
      localStorage.setItem("tt_admin_token", "test");
      localStorage.setItem("tt_theme", dark ? "dark" : "light");
    },
    seedEmployee,
    dark,
    auth
  );
  await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: "networkidle0" });
  if (before) await before(page);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("saved", name);
  await page.close();
}

import { mkdirSync } from "node:fs";
mkdirSync(OUT, { recursive: true });

await shot("01-login", "/login", { auth: false });
await shot("02-book", "/");
await shot("03-book-modal", "/", {
  before: async (page) => {
    const btn = await page.$x
      ? null
      : null;
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Book this slot");
      if (b) b.click();
      return !!b;
    });
    if (clicked) await new Promise((r) => setTimeout(r, 600));
  },
});
await shot("04-my-bookings", "/my-bookings");
await shot("05-rate", "/rate");
await shot("06-admin-dashboard", "/admin");
await shot("07-admin-slots", "/admin", {
  before: async (page) => {
    await page.evaluate(() => {
      const t = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Slot blocking");
      t?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  },
});
await shot("08-admin-questions", "/admin", {
  before: async (page) => {
    await page.evaluate(() => {
      const t = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Rating questions"));
      t?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  },
});
await shot("09-book-dark", "/", { dark: true });
await shot("10-admin-players", "/admin", {
  before: async (page) => {
    await page.evaluate(() => {
      const t = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Players"));
      t?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
  },
});
await shot("11-admin-new-booking", "/admin", {
  before: async (page) => {
    await page.evaluate(() => {
      const t = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Bookings"));
      t?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "+ New booking");
      b?.click();
    });
    await new Promise((r) => setTimeout(r, 600));
  },
});

await browser.close();
server.close();
console.log("\nAll screenshots in", OUT);
