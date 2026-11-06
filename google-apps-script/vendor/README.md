# Bundled setup-only password hashing

`crypto-js/` contains unmodified `core.js`, `sha256.js`, `hmac.js`, `pbkdf2.js` and `LICENSE` from the official `crypto-js@4.2.0` npm package (MIT).

Source: https://www.npmjs.com/package/crypto-js/v/4.2.0

The published tarball SHA-1 is `4d931639ecdfd12ff80e8186dba6af2c2e856631`.

The Apps Script build wraps these modules in a private, lazy CommonJS loader. No library is loaded from a CDN at runtime. The setup uses an explicitly supplied UUID salt and explicit PBKDF2-SHA256 parameters matching the existing browser account format (120,000 iterations, 256-bit output). No CryptoJS random number generator is used. The frontend continues using Web Crypto; these modules are not included in the GitHub website assets.
