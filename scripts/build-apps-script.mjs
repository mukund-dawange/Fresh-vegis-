import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const store=(await readFile(new URL('js/store.js',root),'utf8')).replaceAll('export ','').replace('globalThis.crypto.randomUUID()','Utilities.getUuid()');
const commands=(await readFile(new URL('js/commands.js',root),'utf8')).replace(/^import .*\n/,'').replaceAll('export ','');
const server=await readFile(new URL('google-apps-script/server-template.gs',root),'utf8');
const cryptoModules=[];
for(const name of ['core','sha256','hmac','pbkdf2']){
  const source=await readFile(new URL(`google-apps-script/vendor/crypto-js/${name}.js`,root),'utf8');
  cryptoModules.push(`(function(){var module={exports:{}},exports=module.exports;\n${source}\nmodules['./${name}']=module.exports;})();`);
}
const license=await readFile(new URL('google-apps-script/vendor/crypto-js/LICENSE',root),'utf8');
const source=`// GENERATED: paste this entire file into Code.gs in Google Apps Script.\n// NEW SHOP: set the two NEW_SHOP passwords below, save, then run setupFreshleaf.\n${server}\nconst domain=(function(){\nfunction structuredClone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}\nfunction atob(value){return Utilities.base64Decode(value).map(n=>String.fromCharCode(n&255)).join('');}\n${store}\n${commands}\nreturn {validateState,requireAdmin,applyShopAction,createInitialState,eraseShopData};\n})();\n// CryptoJS 4.2.0: bundled official core/SHA256/HMAC/PBKDF2 modules, used only for initial account setup.\n/*\n${license}\n*/\nfunction freshleafPasswordCrypto_(){\nconst modules={};\nfunction require(name){if(!Object.hasOwnProperty.call(modules,name))throw new Error('Module unavailable: '+name);return modules[name];}\n${cryptoModules.join('\n')}\nreturn modules['./core'];\n}\n`;
await writeFile(new URL('google-apps-script/Code.gs',root),source);
console.log('Generated google-apps-script/Code.gs with shared validation and stock rules.');
