import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {createInitialState,eraseShopData,saveProduct,validateState,recoveryStats} from '../js/store.js';
import {setPassword} from '../js/repository.js';
import {CloudRepository} from '../js/cloud-repository.js';

class MemoryStorage{data=new Map();getItem(key){return this.data.get(key)||null;}setItem(key,value){this.data.set(key,String(value));}removeItem(key){this.data.delete(key);}}
const endpoint='https://script.google.com/macros/s/test_deployment/exec';
async function sharedShop(){
  const state=createInitialState();eraseShopData(state,state.users[0]);
  await setPassword(state.users[0],'original-admin-pass');await setPassword(state.users[1],'original-sales-pass');
  saveProduct(state,{name:'Tomatoes',sku:'TOM-01',category:'Vegetables',unit:'kg',cost:20,price:40,stock:1,minStock:2,emoji:'🍅'},state.users[0]);
  const originalUsers=structuredClone(state.users),cache=new Map(),properties=new Map([['FRESHLEAF_DATABASE_FILE_ID','database']]);
  let raw=JSON.stringify({state,epoch:randomUUID(),operations:[]}),failWrite=false;
  const signed=bytes=>[...bytes].map(n=>n>127?n-256:n),buffer=bytes=>Buffer.from(bytes.map(n=>n&255));
  const context=vm.createContext({console,Date,Utilities:{getUuid:randomUUID,base64Decode:value=>signed(Buffer.from(value,'base64')),newBlob:value=>({getBytes:()=>signed(Buffer.from(value))}),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>signed(createHash('sha256').update(value).digest()),computeHmacSha256Signature:(message,key)=>signed(createHmac('sha256',buffer(key)).update(buffer(message)).digest())},LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key),setProperty:(key,value)=>properties.set(key,value)})},CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},DriveApp:{getFileById:()=>({getBlob:()=>({getDataAsString:()=>raw}),setContent:value=>{if(failWrite)throw new Error('Drive save failed');raw=value;}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}});
  vm.runInContext(await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8'),context);
  const dispatch=body=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text);
  const transport=async(_,options)=>({json:async()=>dispatch(JSON.parse(options.body))});
  const client=()=>new CloudRepository(endpoint,{storage:new MemoryStorage(),sessions:new MemoryStorage(),transport});
  const admin=client(),sales=client();await admin.init();await sales.init();await admin.login('admin@freshleaf.local','original-admin-pass');await sales.login('sales@freshleaf.local','original-sales-pass');
  return {admin,sales,client,dispatch,context,properties,originalUsers,read:()=>JSON.parse(raw),failWrite:()=>{failWrite=true;}};
}
const saleFor=(client,overrides={})=>({items:[{productId:client.state.products[0].id,quantity:1}],payment:'UPI',discount:0,expectedTotal:4000,token:randomUUID(),...overrides});

test('fresh setup needs no backup, creates empty records and produces working custom logins',async()=>{
  const shop=await sharedShop();shop.properties.clear();let created='',folders=0;
  shop.context.MimeType={PLAIN_TEXT:'text/plain'};
  shop.context.DriveApp={getFileById:id=>{assert.equal(id,'new-database');return {getBlob:()=>({getDataAsString:()=>created})};},createFolder:name=>{folders++;assert.equal(name,'Freshleaf private shop database');return {createFile:(file,content)=>{assert.equal(file,'freshleaf-database.json');created=content;return {getId:()=> 'new-database'};}};}};
  assert.throws(()=>shop.context.setupFreshleaf(),/adminPassword/);assert.equal(folders,0);
  vm.runInContext("NEW_SHOP.shopName='My Vegetable Shop';NEW_SHOP.adminPassword='Fresh-admin-5831';NEW_SHOP.salesPassword='Fresh-sales-9642';",shop.context);
  shop.context.setupFreshleaf();assert.equal(folders,1);assert.equal(shop.properties.get('FRESHLEAF_DATABASE_FILE_ID'),'new-database');
  const state=JSON.parse(created).state;validateState(state);assert.equal(state.settings.shopName,'My Vegetable Shop');assert.equal(state.demo,false);
  for(const key of ['products','purchases','sales','movements'])assert.equal(state[key].length,0);
  assert.equal(created.includes('Fresh-admin-5831'),false);assert.equal(created.includes('Fresh-sales-9642'),false);
  const admin=shop.client(),sales=shop.client();await admin.login('admin@freshleaf.local','Fresh-admin-5831');await sales.login('sales@freshleaf.local','Fresh-sales-9642');assert.equal(admin.getUser().role,'admin');assert.equal(sales.getUser().role,'sales');
  assert.throws(()=>shop.context.setupFreshleaf(),/already configured/);assert.equal(folders,1);
});
test('backup setup still imports the original records and passwords without new-shop credentials',async()=>{
  const shop=await sharedShop(),original=shop.read().state;shop.properties.clear();let created='';
  const context=vm.createContext({...shop.context,MimeType:{PLAIN_TEXT:'text/plain'},DriveApp:{getFileById:id=>{assert.equal(id,'private-backup');return {getBlob:()=>({getDataAsString:()=>JSON.stringify(original)})};},createFolder:()=>({createFile:(_,content)=>{created=content;return {getId:()=> 'imported-database'};}})}});
  const source=(await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8')).replace("const SOURCE_BACKUP_FILE_ID = '';","const SOURCE_BACKUP_FILE_ID = 'private-backup';");
  vm.runInContext(source,context);context.setupFreshleaf();assert.deepEqual(JSON.parse(created).state,original);assert.equal(shop.properties.get('FRESHLEAF_DATABASE_FILE_ID'),'imported-database');
});

test('shared login rejects bad credentials and never sends password hashes in ordinary snapshots',async()=>{
  const shop=await sharedShop();assert.equal(shop.sales.getUser().role,'sales');
  assert.ok(shop.sales.state.users.every(u=>u.passwordHash==='0'.repeat(64)&&u.salt==='0'.repeat(32)));
  await assert.rejects(shop.client().login('admin@freshleaf.local','incorrect'),/incorrect/);
  const reply=shop.dispatch({action:'read',token:'invalid'});assert.equal(reply.code,'AUTH');
  assert.equal(shop.dispatch({action:'info'}).state,undefined);
});
test('two devices cannot sell the final shared stock twice; receipts and recovery reconcile',async()=>{
  const shop=await sharedShop();
  const results=await Promise.allSettled([shop.sales.perform('checkout',saleFor(shop.sales)),shop.admin.perform('checkout',saleFor(shop.admin))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const state=shop.read().state;assert.equal(state.products[0].stock,0);assert.equal(state.sales.length,1);assert.equal(recoveryStats(state).remaining,0);validateState(state);
});
test('a lost save response can be retried without purchasing stock twice',async()=>{
  const shop=await sharedShop(),real=shop.admin.transport;let loseResponse=true;
  shop.admin.transport=async(...args)=>{const response=await real(...args);const data=await response.json();if(loseResponse&&JSON.parse(args[1].body).action==='command'){loseResponse=false;throw new Error('Network lost after commit');}return {json:async()=>data};};
  const purchase={productId:shop.admin.state.products[0].id,type:'receive',quantity:2,purchaseValue:30,note:'Morning delivery'};
  await assert.rejects(shop.admin.perform('stock',purchase),/Could not confirm/);
  const reopened=new CloudRepository(endpoint,{storage:shop.admin.storage,sessions:shop.admin.sessions,transport:real});await reopened.init();await reopened.perform('stock',purchase);
  assert.equal(shop.read().state.products[0].stock,3);assert.equal(shop.read().state.purchases.length,2);
});
test('server enforces sales permissions even when a client submits admin commands',async()=>{
  const shop=await sharedShop();
  for(const [action,payload] of [['erase',{confirmation:'CLEAR'}],['settings',{shopName:'Hacked'}],['stock',{productId:shop.sales.state.products[0].id,type:'receive',quantity:5,note:'Not allowed'}]])await assert.rejects(shop.sales.perform(action,payload),/Management/);
  await assert.rejects(shop.sales.backup(),/Management/);assert.equal(shop.read().state.products[0].stock,1);
});
test('a delayed refresh cannot overwrite a newer completed save',async()=>{
  const shop=await sharedShop(),real=shop.admin.transport;let release,readCaptured;const ready=new Promise(resolve=>{readCaptured=resolve;});
  await shop.sales.perform('checkout',saleFor(shop.sales,{items:[{productId:shop.sales.state.products[0].id,quantity:.25}],expectedTotal:1000}));
  shop.admin.transport=async(...args)=>{const response=await real(...args);const data=await response.json();if(JSON.parse(args[1].body).action==='read'){readCaptured();await new Promise(resolve=>{release=resolve;});}return {json:async()=>data};};
  const refresh=shop.admin.refresh();await ready;
  await shop.admin.perform('stock',{productId:shop.admin.state.products[0].id,type:'receive',quantity:2,purchaseValue:30,note:'New delivery'});release();await refresh;
  assert.equal(shop.admin.state.products[0].stock,2.75);assert.equal(shop.admin.state.revision,shop.read().state.revision);
});
test('an expired server session returns startup to the login screen',async()=>{
  const shop=await sharedShop();const session=shop.admin.session();session.token='expired-token';shop.admin.sessions.setItem(shop.admin.sessionKey,JSON.stringify(session));
  const reopened=new CloudRepository(endpoint,{storage:shop.admin.storage,sessions:shop.admin.sessions,transport:shop.admin.transport});await reopened.init();assert.equal(reopened.getUser(),null);
});
test('erase removes entered data, keeps both exact credentials, and rejects stale writes from another device',async()=>{
  const shop=await sharedShop();await shop.admin.perform('settings',{shopName:'My shop',address:'Test address',phone:'123',currency:'INR',receiptFooter:'Hello'});
  await shop.admin.perform('erase',{confirmation:'CLEAR'});const state=shop.read().state;
  assert.deepEqual(state.users,shop.originalUsers);for(const key of ['products','sales','movements','purchases'])assert.equal(state[key].length,0);assert.equal(state.settings.address,'');assert.equal(state.demo,false);validateState(state);
  await assert.rejects(shop.sales.perform('checkout',saleFor(shop.sales)),/erased or restored/);
  await shop.sales.refresh();assert.equal(shop.sales.state.products.length,0);assert.equal(shop.sales.getUser().role,'sales');
  await shop.client().login('admin@freshleaf.local','original-admin-pass');await shop.client().login('sales@freshleaf.local','original-sales-pass');
});
test('failed Drive writes leave shared stock unchanged and setup cannot overwrite a database',async()=>{
  const shop=await sharedShop();shop.failWrite();await assert.rejects(shop.sales.perform('checkout',saleFor(shop.sales)),/Drive save failed/);assert.equal(shop.read().state.products[0].stock,1);assert.equal(shop.read().state.sales.length,0);assert.throws(()=>shop.context.setupFreshleaf(),/already configured/);
});
test('cloud password update preserves the active login and invalidates other sessions',async()=>{
  const shop=await sharedShop(),other=shop.client();await other.login('admin@freshleaf.local','original-admin-pass');
  await shop.admin.updateAccount({name:'Shop owner',current:'original-admin-pass',password:'new-admin-password'});
  assert.equal(shop.admin.getUser().name,'Shop owner');await shop.admin.refresh();await assert.rejects(other.refresh(),/session has ended/);
  await assert.rejects(shop.client().login('admin@freshleaf.local','original-admin-pass'),/incorrect/);await shop.client().login('admin@freshleaf.local','new-admin-password');
});
test('manifest and offline shell support a GitHub repository subpath',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../manifest.webmanifest',import.meta.url),'utf8'));const base='https://example.github.io/my-shop/';
  assert.equal(new URL(manifest.start_url,base).href,base+'?workspace=sales');assert.equal(new URL(manifest.scope,base).href,base);assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){const bytes=await readFile(new URL('../'+icon.src,import.meta.url));const size=Number(icon.sizes.split('x')[0]);assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);}
  const source=await readFile(new URL('../sw.js',import.meta.url),'utf8');const assets=JSON.parse(source.match(/const ASSETS=(\[[^;]+\]);/)[1].replaceAll("'",'"'));
  for(const asset of assets)await readFile(new URL('../'+(asset==='./'?'index.html':asset),import.meta.url));
});
