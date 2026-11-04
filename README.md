# Freshleaf — vegetable shop workspace

A complete, buildless shop management and point-of-sale app made with **HTML, CSS and vanilla JavaScript**. It is ready to upload to GitHub Pages. There is no application server, database subscription, API key or package installation required for the hosted app.

## Open locally

On Windows, double-click **start-preview.cmd**. Or, from this folder with Node.js installed:

```sh
npm start
```

Open **http://127.0.0.1:4173** in your browser. Keep the terminal running while using the local app. Stop it with Ctrl+C.

Alternatively, use an editor's static web server on localhost. Do not double-click `index.html`: JavaScript modules and Web Crypto require a local web server or HTTPS.

## Sign in

Both roles use the same login page. Demo buttons fill and submit these credentials:

| Workspace | Email | Password |
| --- | --- | --- |
| Management | `admin@freshleaf.local` | `admin123` |
| Sales | `sales@freshleaf.local` | `sales123` |

The management account can switch between both panels. The sales account sees checkout, stock availability and sales history. The administrator can change their display name and password in **Shop settings → Your account**. The demo shortcut stops working if its password has been changed; use the regular login form instead.

On the first visit, the app creates 12 sample products and two weeks of clearly labelled example sales. To use it for your own shop:

1. Open **Shop settings**, enter your shop name, contact details and receipt message.
2. Choose **Start empty shop** and type `CLEAR`. This removes all products, sales and stock movements, while keeping accounts and shop details. Back up anything you want to keep first.
3. Add your products in **Inventory**, including costs, selling prices, units, opening stock and reorder thresholds.
4. Switch to **Sales** and start recording orders.

## Included features

- **Dashboard:** revenue, completed orders, gross profit, inventory value, daily revenue versus the preceding period, bestsellers, recent receipts and low-stock alerts.
- **Products:** create, edit, search, filter, set cost and selling prices, supplier details, category, SKU and reorder level. Archive products to remove them from checkout; restore them later without losing stock or history.
- **Inventory:** receive deliveries, record spoiled produce, correct physical stock counts, and inspect a movement ledger with actor, reference, change and resulting balance.
- **Point of sale:** product cards with availability, cost and selling price; editable quantities; discounts; customer name; cash, UPI and card recording; cash received and change.
- **Receipts:** sequential receipt numbers, saved item prices and costs, printable receipt layout, history searches and date filters.
- **Voids:** management can void a full sale, restore its items and remove it from revenue. A reason is required. This is not a partial-return workflow; actual refunds must be made outside the app.
- **Reports:** date-range sales, cost of goods, gross margin, average order, category mix, payment breakdown and product performance.
- **Exports:** inventory, ledger, sales and report CSV files; full JSON backup and validated restore.
- **Responsive layout:** desktop and mobile layouts, collapsible navigation, keyboard-accessible dialogs and search shortcut `/`.

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

## Local storage and backups

This version was designed for **one browser/device**, as requested. Both panels and tabs on the same website share a localStorage database. Web Locks serialize writes across tabs, and storage events refresh the other panels. No shop records are sent to GitHub.

Data belongs to the browser profile and website origin. A different browser, private browsing session, device, domain or port has different storage. Your local preview and GitHub Pages site therefore have separate databases: use JSON backup and restore to move data. Use one Freshleaf deployment per origin; multiple copies on the same domain share the storage key.

Browser storage is finite and is not a guaranteed permanent backup. **Download a JSON backup regularly and before clearing browser data.** A backup contains products, receipts, stock records, settings, accounts and password hashes. Keep it private and do not commit backups to your public repository. CSV exports are for analysis and cannot restore the app.

Passwords use salted PBKDF2 hashes, but **client-side role logins are not secure access control**. Anyone who can inspect or modify the browser's data can bypass them. Use this as a trusted-device local workspace. Secure multi-device access would need a backend with server-enforced permissions.

A current browser with `localStorage`, Web Crypto and Web Locks is required, served over HTTPS or localhost. The app uses no framework or chart library. Google Fonts are optional cosmetic requests; system fonts are used when unavailable.

## Host on GitHub Pages

1. Create a GitHub repository and upload these files while keeping the folder structure:

   ```text
   index.html
   styles.css
   .nojekyll
   assets/
     favicon.svg
   js/
     app.js
     icons.js
     repository.js
     store.js
   ```

2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your source branch (usually `main`) and **/(root)**, then save.
5. Open the HTTPS site address GitHub shows when deployment finishes.

There is no build command. All asset paths are relative, so the app also works at a repository subpath. `.nojekyll` disables Jekyll processing. You can upload the entire project, although `scripts/`, `tests/` and `package.json` are only used for local development.

Source: [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Development and checks

```sh
npm test
npm run check
```

The tests cover stock and receipt reconciliation, fractional quantities, validation, overselling, duplicate submissions, concurrent checkouts, weighted average costs, voids, permissions, backup integrity, storage failure recovery and password/session behaviour.

- `js/store.js` contains inventory and sales rules and backup validation.
- `js/repository.js` handles browser storage, serialized transactions and local login.
- `js/app.js` contains the screens, charts, interactions and exports.
- `styles.css` contains the responsive layout and receipt print styles.
- `scripts/serve.mjs` is a small local preview server only. It is not needed on GitHub Pages.

No site has been published to a GitHub account automatically; the repository files are ready for your own hosting.
