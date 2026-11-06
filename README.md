# Freshleaf — vegetable shop workspace

A buildless shop management and point-of-sale app made with **HTML, CSS and vanilla JavaScript**, ready for GitHub Pages. The desktop design is retained, with a dedicated phone sales layout and a home-screen app. No frontend package installation or build is required.

For **admin on a laptop and sales on a phone**, follow [the Google Apps Script + Drive setup guide](google-apps-script/SETUP.md). Paste the supplied [Code.gs](google-apps-script/Code.gs) into Apps Script, choose new shop credentials or import a private shop backup, run setup, deploy it, and put its `/exec` URL in `js/cloud-config.js`. A new shop needs no backup: setup creates an empty database automatically. Imports preserve existing logins and passwords. Until that URL is configured, the app continues using the existing local-only database; devices are not connected yet.

## Open locally

On Windows, double-click **start-preview.cmd**. Or, from this folder with Node.js installed:

```sh
npm start
```

Open **http://127.0.0.1:4173** in your browser. Keep the terminal running while using the local app. Stop it with Ctrl+C.

Alternatively, use an editor's static web server on localhost. Do not double-click `index.html`: JavaScript modules and Web Crypto require a local web server or HTTPS.

## Sign in

Both roles use the same login page. In local mode, demo buttons fill and submit these credentials:

| Workspace | Email | Password |
| --- | --- | --- |
| Management | `admin@freshleaf.local` | `admin123` |
| Sales | `sales@freshleaf.local` | `sales123` |

The management account can switch between both panels. The sales account sees checkout, stock availability and sales history. Phones and the installed app open Sales for either account; admin can reach Management from the menu. In shared mode, sign in with the accounts imported from your backup. The administrator can change their display name and password in **Shop settings → Your account**. The local demo shortcut stops working if its password has been changed; use the regular login form instead.

On the first visit in local mode, the app creates 12 sample products and two weeks of clearly labelled example sales. To use a new local workspace for your own shop:

1. Open **Shop settings**. Back up anything you want to keep first.
2. Choose **Erase shop data** and type `CLEAR`. This removes products, photos, purchases, recovery records, sales, stock movements and entered shop details. **All login accounts and passwords are preserved.** Then enter your shop name, contact details and receipt message.
3. Add your products in **Inventory**, including costs, selling prices, units, opening stock and reorder thresholds.
4. Switch to **Sales** and start recording orders.

## Included features

- **Dashboard:** revenue, completed orders, gross profit, inventory value, daily revenue versus the preceding period, bestsellers, recent receipts and low-stock alerts.
- **Products:** create, edit, search, filter, set cost and selling prices, supplier details, category, SKU and reorder level. Archive products to remove them from checkout; restore them later without losing stock or history.
- **Product photos:** upload, replace or remove a JPG, PNG or WebP image in the product editor. Photos appear in inventory, the sales catalogue, basket and product summaries, and are included in JSON backups. Images are resized on the device (up to 512 pixels, under approximately 90 KB each). In shared mode, compressed photos are saved in the private Drive database so the phone sees them too.
- **Smart weight calculator:** available in both panels. Choose a product or a custom price per kg, enter kilograms or grams, and see the price immediately. Product calculations can be added straight to the basket. Example: 750 g at ₹40/kg = ₹30. Pieces and bunches continue to use whole-number quantities.
- **Purchases & recovery:** record actual goods investment, inspect each purchase's recovered and outstanding value, and export the purchase ledger. Both the management dashboard and sales panel show the same rolling recovery target.
- **Inventory:** receive deliveries, record spoiled produce, correct physical stock counts, and inspect a movement ledger with actor, reference, change and resulting balance.
- **Point of sale:** product cards with availability, cost and selling price; editable quantities; discounts; customer name; cash, UPI and card recording; cash received and change.
- **Receipts:** sequential receipt numbers, saved item prices and costs, printable receipt layout, history searches and date filters.
- **Voids:** management can void a full sale, restore its items and remove it from revenue. A reason is required. This is not a partial-return workflow; actual refunds must be made outside the app.
- **Reports:** date-range sales, cost of goods, gross margin, average order, category mix, payment breakdown and product performance.
- **Exports:** inventory, ledger, sales and report CSV files; full JSON backup and validated restore.
- **Mobile sales:** two-column products, large touch controls, a compact expandable recovery target, per-product weight buttons, a basket total dock and Sell / Stock / History / Menu navigation. Desktop layout remains unchanged.
- **Home-screen app:** install from the browser to open Sales in a standalone window. Includes an app icon, safe-area spacing and a cached app shell. Shared stock and sales require internet; offline cloud writes are blocked.
- **Shared Google Drive backend:** optional Apps Script connection with server-side permissions, stock checks, serialized writes, retry protection, and visible-app refresh every 30 seconds. Setup is required before devices share data.
- **Erase shop data:** admin-only, with typed confirmation. Clears operational records and shop details while preserving accounts and passwords. In shared mode it affects every connected device.

## How stock and money work

- Quantities use up to **three decimal places for kilograms**. Pieces and bunches require whole numbers. Click-to-add uses 0.5 kg or one piece/bunch; type any valid quantity in the basket.
- Stock cannot go below zero. Checkout rechecks the latest stock and prices before writing.
- Money is stored in integer minor units (paise by default), and line amounts are rounded to the nearest minor unit.
- New deliveries with a purchase cost update the **weighted average product cost**. Sale receipts preserve the cost and selling price recorded at checkout. Returning a voided sale restores its historical cost into the weighted average.
- An administrator can also explicitly edit the product's current unit cost. Existing receipts keep their original cost.
- Gross profit is revenue after discounts minus the sold items' recorded cost. It excludes rent, wages, wastage expense and other overheads. It is not net accounting profit.
- Category and product sales values are before order-level discounts; overall net sales and profit include discounts. Voided sales are excluded from sales analytics.
- Archived stock is retained in the records but excluded from active inventory value and the sales catalogue.
- Taxes are not calculated. Cash, UPI and card options record a payment already collected; the app has no payment-processing integration.
- Currency changes alter the displayed currency only; they do not convert historical amounts.

## Recovering investment across repeated restocks

The first priority is recovering the money spent on goods. The target **never resets automatically**, so restocking every two or three days does not erase outstanding investment.

1. Opening stock and each new stock delivery create a purchase record. Enter the total purchased goods value, or let quantity × unit cost calculate it. Entering a total derives the cost per unit; it is not the selling price.
2. Every completed sale, after discounts, pays down the **oldest unpaid purchase first**, across the whole shop. Recovery is not restricted to sales of that same product.
3. Once all earlier purchases are recovered, additional sales are shown separately as **sales beyond recovered purchases**. They are not silently reused to mark a future purchase recovered.
4. A new delivery adds its full purchase cost to the current outstanding target. Unsold stock is still in inventory, even after its purchase cost is recovered. Keep selling it normally.
5. Voiding a sale removes its recovery contribution and recalculates the allocation. Spoilage, stock-count changes and product archiving do not erase the money invested.

Example: invest ₹1,000, then sell ₹1,200. The recovery target reaches zero, and ₹200 is recorded separately. A new ₹800 delivery creates an ₹800 outstanding target. The next ₹300 sale reduces that to ₹500. The earlier ₹200 remains separate. This deliberately prioritises recovering **each new purchase**, rather than treating historical surplus as payment for future purchases.

Use **Purchases & recovery → Record purchase** for either:

- **New delivery:** adds quantity, calculates weighted average unit cost and records the purchase value together.
- **Value only:** records goods investment for stock already entered. It does not add stock or change unit cost. Do not enter the same purchase twice.

The recovery card measures sales applied to goods investment. It is **not net profit or a bank balance**: overheads, actual cash spending, supplier credit and money withdrawn from the shop are not tracked. Historical product prices and receipt margins remain unchanged.

## Updating an existing Freshleaf shop

Download a JSON backup, replace the app files at the same website address, and **reload every open Freshleaf tab**. Do not use Erase shop data during an upgrade. Existing products, stock, receipts, accounts and settings are preserved automatically; older JSON backups can also be restored. For later PWA updates, increment `VERSION` in `sw.js`, allow the update to download, then close all old tabs/app windows and reopen. To connect different devices, import the backup using the separate Google setup guide.

The previous version did not record actual total purchase investments. The app therefore does not guess historical invoices or apply old receipts to new investments. To start accurately, use **Value only** to enter the **still-unrecovered goods investment** for your existing stock, product by product. Do not enter amounts already recovered. Receipts from before the upgrade remain in normal sales history and reports, but are excluded from the new recovery target. New sales count from the upgrade onwards, in the order they are recorded.

## Local storage and backups

**Local mode** (blank `APPS_SCRIPT_URL`) uses one browser/device. Both panels and tabs on the same website share a localStorage database. Web Locks serialize writes across tabs, and storage events refresh the other panels. No shop records are sent to GitHub. **Shared mode** uses the configured Apps Script endpoint and private Drive database; a device cache is only a snapshot and never overrides the server.

Data belongs to the browser profile and website origin. A different browser, private browsing session, device, domain or port has different storage. Your local preview and GitHub Pages site therefore have separate databases: use JSON backup and restore to move data. Use one Freshleaf deployment per origin; multiple copies on the same domain share the storage key.

Browser storage is finite and is not a guaranteed permanent backup. **Download a JSON backup regularly and before clearing browser data.** A backup contains products, photos, purchases, recovery records, receipts, stock records, settings, accounts and password hashes. Keep it private and do not commit backups to your public repository. CSV exports are for analysis and cannot restore the app.

Passwords use salted PBKDF2 hashes. In **local mode**, client-side role logins are not secure access control; anyone who can modify browser data can bypass them. In **shared mode**, Apps Script checks session tokens and permissions before every read or write. Password hashes stay in the private database and admin backups; ordinary device snapshots omit them. Shared sign-ins expire after up to six hours.

A current browser with `localStorage`, Web Crypto and Web Locks is required, served over HTTPS or localhost. The app uses no framework or chart library. Google Fonts are optional cosmetic requests; system fonts are used when unavailable.

## Host on GitHub Pages

1. Create a GitHub repository and upload these files while keeping the folder structure:

   ```text
   index.html
   styles.css
   .nojekyll
   manifest.webmanifest
   sw.js
   assets/
     favicon.svg
     icon-192.png
     icon-512.png
     icon-maskable-512.png
   js/
     app.js
     cloud-config.js
     cloud-repository.js
     commands.js
     images.js
     icons.js
     pwa.js
     repository.js
     store.js
   ```

2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your source branch (usually `main`) and **/(root)**, then save.
5. Open the HTTPS site address GitHub shows when deployment finishes.

There is no frontend build command. All asset paths are relative, so the app also works at a repository subpath. `.nojekyll` disables Jekyll processing. The supplied `freshleaf-github-pages.zip` contains just website assets and publishing instructions. Keep Apps Script sources, tests, private backups and the Drive database out of the website upload.

Source: [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Development and checks

```sh
npm test
npm run check
npm run build:apps-script
```

The tests cover stock and receipt reconciliation, weight pricing, photos, purchase recovery, upgrades, overselling, weighted average costs, permissions, backups, storage failures and password/session behaviour. Integration tests run the generated Apps Script against simulated Google services to check two-device stock conflicts, lost-response retries (including reloads), stale refreshes, erasing while preserving passwords, and rejected sales-role admin commands. They also validate PWA icons and repository-subpath URLs. A live Google deployment and actual phone installation must still be verified after setup.

- `js/store.js` contains inventory and sales rules and backup validation.
- `js/repository.js` handles browser storage, serialized transactions and local login.
- `js/cloud-repository.js` handles the shared connection; `js/cloud-config.js` holds its URL.
- `js/commands.js` provides the same stock and sales commands to the browser and server.
- `google-apps-script/Code.gs` is the single generated file to paste into Apps Script. `npm run build:apps-script` regenerates it from the shared rules and server template.
- `sw.js`, `manifest.webmanifest` and `js/pwa.js` provide installation and offline app-shell loading.
- `js/app.js` contains the screens, charts, interactions and exports.
- `js/images.js` validates and compresses product photos on the device.
- `styles.css` contains the responsive layout and receipt print styles.
- `scripts/serve.mjs` is a small local preview server only. It is not needed on GitHub Pages.

No site has been published to a GitHub account automatically; the repository files are ready for your own hosting.
