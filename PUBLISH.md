# Freshleaf website upload

1. Extract `freshleaf-github-pages.zip`.
2. Before using separate devices, deploy the supplied `google-apps-script/Code.gs` using `google-apps-script/SETUP.md`. A new shop needs no backup: leave its backup ID blank, set the two passwords at the top, and run `setupFreshleaf`. Those backend files are provided separately from this website ZIP.
3. Paste the deployed URL ending in `/exec` into `js/cloud-config.js`.
4. Upload these website files to the root of your GitHub Pages repository, preserving the `js/` and `assets/` folders.
5. Enable GitHub Pages from your source branch and open the HTTPS website address.
6. Use that same address on the laptop and phone. On the phone, use Install sales app or the browser's Add to Home Screen option.

Do not publish shop backups, the Drive database or account credentials. Keep the Drive folder private.

If `APPS_SCRIPT_URL` is blank, records stay on that browser only: the laptop and phone are not connected. Imported account emails and passwords stay unchanged. Shared sales require internet.

For later frontend changes, increment `VERSION` in `sw.js`. Let the update download, close all old shop tabs and app windows, then reopen.

This ZIP contains the ready-to-host website. The editable project, automated tests and Google setup materials are available separately in the workspace.
