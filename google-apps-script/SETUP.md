# Connect the laptop and phone with Google Apps Script + Drive

The website remains on GitHub Pages. Apps Script checks logins, roles, stock and prices, then saves the shop in **one private JSON file in your Google Drive**. The laptop and phone use the same website and Apps Script URL. You can create a new empty shop with no backup, or import an existing shop and preserve its logins.

## 1. Choose a new shop or an existing shop

**New shop — no backup needed:** skip the upload steps below. Leave `SOURCE_BACKUP_FILE_ID` blank. Set your shop name and your own admin and sales passwords in `NEW_SHOP` near the top of the supplied `Code.gs`. Each password must be 8–128 characters. The default login emails are `admin@freshleaf.local` and `sales@freshleaf.local`; you may replace them with different email addresses if desired. These are shop login IDs, not a connection to Gmail. Do not enter your Google account password.

```js
const SOURCE_BACKUP_FILE_ID = '';
const NEW_SHOP = {
  shopName: 'Freshleaf',
  adminEmail: 'admin@freshleaf.local',
  adminPassword: 'CHANGE_ADMIN_PASSWORD',
  salesEmail: 'sales@freshleaf.local',
  salesPassword: 'CHANGE_SALES_PASSWORD'
};
```

Replace both `CHANGE_...` placeholders with passwords you choose. Setup creates the Drive folder and database automatically, with no products, purchases, sales or sample records. You do not need to create a folder or file yourself. Keep the script private. After setup succeeds, you can replace the password strings in the editor with the placeholders again; saved logins stay unchanged. Later password changes use the app's account controls, not rerunning setup.

**Existing shop — optional backup import:** only follow these upload steps if you already have shop records to migrate.

1. Open the existing shop on your laptop and sign in as admin.
2. Choose **Shop settings → Download backup**. Keep this original backup somewhere safe.
3. Upload the JSON backup to **your private Google Drive**. Do not make it public or upload it to GitHub.
4. Open its Drive preview and copy the file ID from its address: in `https://drive.google.com/file/d/FILE_ID/view`, copy only `FILE_ID`.

Importing retains products, photos, receipts, recovery records and existing login credentials. `NEW_SHOP` is ignored when a backup file ID is supplied. Do not erase a real shop to create a test backup.

## 2. Create the backend

1. Open [Google Apps Script](https://script.google.com/) and create a **New project**. Name it **Freshleaf shop**.
2. Open the supplied **Code.gs** file and copy its entire contents into the project's `Code.gs`, replacing the starter function. Only this one file is needed; do not also paste `server-template.gs`.
3. At the top, configure the new shop passwords and leave `SOURCE_BACKUP_FILE_ID = ''`, **or** set that value to your backup file ID for an import. Keep the quotes.
4. Save. In the dropdown beside Run, select **setupFreshleaf**, then click **Run**. Do not run a helper function. Review and complete Google's authorization prompts for this script in your own account. New-account password hashing may take a few seconds.
5. Check the execution log for **Database created**. A folder named **Freshleaf private shop database** now holds `freshleaf-database.json`. Keep that folder private. Setup refuses to overwrite an existing database.

The file ID is retained in the script's properties. Do not delete that property or the database file. The original uploaded backup is not modified.

## 3. Deploy a web app

1. Click **Deploy → New deployment** and choose **Web app**.
2. Set **Execute as** to **Me** (the account that owns the database).
3. Set **Who has access** to **Anyone**. The endpoint must accept requests from the GitHub website; Freshleaf's own login protects the records. A Workspace policy may restrict this deployment option.
4. Click **Deploy**, complete any authorization steps, and copy the **Web app URL ending in `/exec`**. Do not use a `/dev` testing URL.

Opening the URL directly shows only a service message. Shop records require a Freshleaf sign-in token. You never need to share the database file with “Anyone”. See [Google's web app deployment guide](https://developers.google.com/apps-script/guides/web).

## 4. Connect GitHub Pages

Open `js/cloud-config.js` in the website files and set:

```js
export const APPS_SCRIPT_URL = 'PASTE_THE_WEB_APP_EXEC_URL_HERE';
```

Upload the updated website files to GitHub, including `manifest.webmanifest`, `sw.js`, all `js/` files and all `assets/` files. If this version has already been installed on a phone, change `VERSION` in `sw.js` to a new value, such as `1.2.1`, so the updated configuration is installed. Close every old shop tab/app window and reopen after the update downloads.

**Leave out `google-apps-script/`, `tests/`, `.qa/` and backup JSON files when publishing.** They are not website assets. Never publish the Drive database, backups, or account credentials. The `/exec` URL is configuration, not a password.

When the URL is blank, the app continues using the old local workspace. When it is filled, it uses the shared Drive database and does **not** silently fall back to local writes. Your original local records remain separate and untouched.

## 5. Verify both devices before real sales

1. Open the **same GitHub Pages address** on the laptop and phone.
2. For a fresh setup, sign in with the emails and passwords you chose in `NEW_SHOP`. For an import, use your existing accounts. Use admin on the laptop and sales on the phone. The cloud login does not show sample-account shortcuts.
3. Add a clearly named test product from the laptop. Reload the phone, or wait for its next 30-second refresh while the app is visible. Check the product and stock.
4. Make one small test sale and verify the matching receipt, stock deduction and recovery total on the laptop. Archive the test product or void the test sale through normal admin controls as appropriate.

Stock is checked on the server for every checkout, even if the displayed catalogue is a few seconds behind. Connection errors leave the form open: retry the same action to recover its acknowledgement without recording it twice. **Internet is required to save shared sales or stock.** Do not switch to local mode to work around a connection problem.

## 6. Install the phone app

- **Android / Chrome:** open the GitHub Pages address, then use the app's **Install sales app** control or the browser menu → **Install app / Add to Home screen**.
- **iPhone / Safari:** open the GitHub Pages address → **Share → Add to Home Screen**, enable **Open as Web App** if shown, then **Add**. [Apple's instructions](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

The home-screen icon opens **Sales**, for either account. Sign in when needed. Admin can open Management from the menu. Initial installation needs internet; the app shell can open offline, but shared saves require a connection. Phone installation itself must be done on the phone.

## Everyday use

- **Erase shop data:** admin Settings → Erase shop data → type `CLEAR`. It deletes the live products, photos, purchases, receipts, inventory movements and shop details for **both devices**. Login emails, passwords and roles are preserved. Existing backup files are unaffected.
- **Backups:** admin Download backup fetches the full current server database as a restorable JSON file. Ordinary device snapshots exclude password hashes. Keep backups private.
- **Sessions:** expire after up to six hours (Google may evict cached sessions earlier); sign in again when prompted. Password changes invalidate other sessions for that account.
- **Backend updates:** paste the new `Code.gs` into the existing project, retain the configured script properties, and use **Deploy → Manage deployments → Edit → New version**. Keep the existing `/exec` URL. Do not run setup again.
- **Website updates:** change the cache version in `sw.js` when changing frontend files. The app installs updates after all old tabs/app windows close, so an update does not interrupt an open basket.

This backend suits a small shop. Apps Script is quota-limited, and each save rewrites the JSON database; it is not intended for a large chain or a high-volume checkout system. The application limits the JSON database to **8 MB**, below the Drive service's [10 MB text-update limit](https://developers.google.com/apps-script/reference/drive/file). Compressed photos and long sales histories count towards it. Google can change quotas; see [the official limits](https://developers.google.com/apps-script/guides/services/quotas).

The script uses [script-wide locks](https://developers.google.com/apps-script/reference/lock/) to serialize stock changes and [Content Service](https://developers.google.com/apps-script/guides/content) JSON responses. Requests follow Google's response redirects, use a plain-text POST body to avoid a custom-header preflight, and never put account tokens in URLs. No Google client secret belongs in the website.

The bundled automated tests exercise the generated script with simulated Google services. A real deployment, permission flow and cross-origin browser connection still need to be verified using your deployed `/exec` URL.
