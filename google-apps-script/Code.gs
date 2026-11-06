// GENERATED: paste this entire file into Code.gs in Google Apps Script.
// NEW SHOP: set the two NEW_SHOP passwords below, save, then run setupFreshleaf.
// Freshleaf shared shop. See SETUP.md. Do not share the Drive database file.
// NEW SHOP: leave this blank. IMPORT AN EXISTING SHOP: paste a private backup file ID.
const SOURCE_BACKUP_FILE_ID = '';
// For a new empty shop, choose both passwords here before running setupFreshleaf.
// These are shop logins, not your Google account password. Keep this script private.
const NEW_SHOP = {
  shopName: 'Freshleaf',
  adminEmail: 'admin@freshleaf.local',
  adminPassword: 'CHANGE_ADMIN_PASSWORD',
  salesEmail: 'sales@freshleaf.local',
  salesPassword: 'CHANGE_SALES_PASSWORD'
};
const DATABASE_PROPERTY = 'FRESHLEAF_DATABASE_FILE_ID';

function setupFreshleaf() {
  const lock=LockService.getScriptLock();lock.waitLock(25000);
  try {
    const properties=PropertiesService.getScriptProperties();
    if(properties.getProperty(DATABASE_PROPERTY))throw new Error('A database is already configured. Setup will not overwrite it.');
    const backupId=SOURCE_BACKUP_FILE_ID.trim();
    if(backupId==='PASTE_YOUR_BACKUP_FILE_ID_HERE')throw new Error('For a new shop, leave SOURCE_BACKUP_FILE_ID blank. For an import, enter the backup file ID.');
    const state=domain.validateState(backupId?JSON.parse(DriveApp.getFileById(backupId).getBlob().getDataAsString()):newEmptyShop_());
    const serialized=JSON.stringify({state,epoch:Utilities.getUuid(),operations:[]});
    if(Utilities.newBlob(serialized).getBytes().length>8000000)throw new Error('The backup exceeds the 8 MB shared database limit. Reduce stored photos before importing.');
    const folder=DriveApp.createFolder('Freshleaf private shop database');
    const file=folder.createFile('freshleaf-database.json',serialized,MimeType.PLAIN_TEXT);
    properties.setProperty(DATABASE_PROPERTY,file.getId());
    console.log(backupId?'Database created. Imported shop logins and passwords are preserved. Keep the folder private.':'Database created. Your empty shop is ready. Sign in using the emails and passwords you entered in NEW_SHOP. Keep the folder private.');
  }finally{lock.releaseLock();}
}
function newEmptyShop_(){
  const name=String(NEW_SHOP.shopName||'').trim();if(!name||name.length>80)throw new Error('Enter a shopName of 1–80 characters in NEW_SHOP.');
  const accounts=[{id:'admin',name:'Shop owner',role:'admin',email:NEW_SHOP.adminEmail,password:NEW_SHOP.adminPassword},{id:'sales',name:'Sales staff',role:'sales',email:NEW_SHOP.salesEmail,password:NEW_SHOP.salesPassword}];
  accounts.forEach(account=>{
    account.email=String(account.email||'').trim().toLowerCase();
    if(account.email.length>120||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email))throw new Error('Enter a valid '+account.role+'Email in NEW_SHOP.');
    if(typeof account.password!=='string'||account.password.length<8||account.password.length>128||account.password.startsWith('CHANGE_'))throw new Error('Replace '+account.role+'Password in NEW_SHOP with your own password (8–128 characters).');
  });
  if(accounts[0].email===accounts[1].email)throw new Error('Admin and sales must have different email addresses.');
  const crypto=freshleafPasswordCrypto_();
  const state=domain.createInitialState();domain.eraseShopData(state,state.users[0]);state.settings.shopName=name;
  state.users=accounts.map(account=>{
    const salt=Utilities.getUuid().replace(/-/g,'');
    // Match the existing browser's PBKDF2-SHA256 format so both login modes work.
    const passwordHash=crypto.PBKDF2(account.password,crypto.enc.Hex.parse(salt),{keySize:8,iterations:120000,hasher:crypto.algo.SHA256}).toString(crypto.enc.Hex);
    return {id:account.id,name:account.name,role:account.role,email:account.email,salt,passwordHash};
  });
  return state;
}
function doGet(){return output_({ok:true,service:'Freshleaf shared shop',message:'Configure this /exec URL in js/cloud-config.js. Shop records require sign-in.'});}
function doPost(event){
  const lock=LockService.getScriptLock();
  try{
    if(!event?.postData?.contents||event.postData.contents.length>9000000)throw new Error('Request is missing or too large.');
    const request=JSON.parse(event.postData.contents);
    lock.waitLock(25000);
    return output_(handleRequest_(request));
  }catch(error){return output_({ok:false,error:error.message||'The shared shop could not complete this action.',code:error.code||'REQUEST'});}
  finally{if(lock.hasLock())lock.releaseLock();}
}
function output_(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function database_(){
  const id=PropertiesService.getScriptProperties().getProperty(DATABASE_PROPERTY);
  if(!id)throw new Error('Run setupFreshleaf in Apps Script before connecting the shop.');
  const file=DriveApp.getFileById(id),database=JSON.parse(file.getBlob().getDataAsString());
  if(!database.state||!database.epoch||!Array.isArray(database.operations))throw new Error('The Drive database is not a supported Freshleaf database.');
  return {file,database};
}
function bytes_(hex){return hex.match(/.{2}/g).map(value=>{const n=parseInt(value,16);return n>127?n-256:n;});}
function hex_(bytes){return bytes.map(n=>(n&255).toString(16).padStart(2,'0')).join('');}
function digest_(value){return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8));}
function proof_(key,message){return hex_(Utilities.computeHmacSha256Signature(Utilities.newBlob(message).getBytes(),bytes_(key)));}
function same_(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
function deny_(){const error=new Error('Your session has ended. Please sign in again.');error.code='AUTH';throw error;}
function publicState_(state){const copy=JSON.parse(JSON.stringify(state));copy.users=copy.users.map(user=>({id:user.id,name:user.name,email:user.email,role:user.role,salt:'0'.repeat(32),passwordHash:'0'.repeat(64)}));return copy;}
function snapshot_(database){return {state:publicState_(database.state),epoch:database.epoch};}
function actor_(request,state){
  if(typeof request.token!=='string'||request.token.length>150)deny_();
  const raw=CacheService.getScriptCache().get('session:'+digest_(request.token));if(!raw)deny_();
  const session=JSON.parse(raw),user=state.users.find(u=>u.id===session.id&&same_(u.passwordHash,session.fingerprint));
  if(!user||session.expiresAt<Date.now())deny_();return {user,session};
}
function handleRequest_(request){
  const {file,database}=database_(),state=database.state,cache=CacheService.getScriptCache();
  if(request.action==='info')return {ok:true,shopName:state.settings.shopName};
  if(['challenge','login'].includes(request.action)){
    const email=String(request.email||'').trim().toLowerCase().slice(0,120),rateKey='auth:'+digest_(email);
    const attempts=Number(cache.get(rateKey)||0);if(attempts>=30)throw new Error('Too many sign-in attempts. Wait 15 minutes and try again.');
    cache.put(rateKey,String(attempts+1),900);
    const user=state.users.find(u=>u.email.toLowerCase()===email);
    if(request.action==='challenge'){
      const nonce=Utilities.getUuid()+Utilities.getUuid();cache.put('challenge:'+digest_(nonce),email,300);
      return {ok:true,salt:user?.salt||digest_(email+'freshleaf').slice(0,32),nonce};
    }
    const nonceKey='challenge:'+digest_(String(request.nonce||'')),expectedEmail=cache.get(nonceKey);cache.remove(nonceKey);
    if(!user||expectedEmail!==email||!same_(request.proof,proof_(user.passwordHash,request.nonce)))throw new Error('Email or password is incorrect.');
    cache.remove(rateKey);
    const token=Utilities.getUuid()+Utilities.getUuid(),expiresAt=Date.now()+6*60*60*1000;
    cache.put('session:'+digest_(token),JSON.stringify({id:user.id,fingerprint:user.passwordHash,expiresAt}),21600);
    return {ok:true,token,expiresAt,user:{id:user.id,role:user.role},...snapshot_(database)};
  }
  const {user,session}=actor_(request,state);
  if(request.action==='read')return {ok:true,...(request.revision===state.revision&&request.epoch===database.epoch?{}:snapshot_(database))};
  if(request.action==='backup'){domain.requireAdmin(user);return {ok:true,state};}
  if(request.action==='accountChallenge'){domain.requireAdmin(user);return {ok:true,salt:user.salt};}
  if(request.action!=='command')throw new Error('Unknown request.');
  if(!/^[a-zA-Z0-9_-]{10,100}$/.test(request.requestId||''))throw new Error('A valid request ID is required.');
  const prior=database.operations.find(op=>op.id===request.requestId);
  if(prior){if(prior.userId!==user.id||prior.command!==request.command)throw new Error('Request ID belongs to another action.');return {ok:true,result:prior.result,...snapshot_(database)};}
  if(request.epoch!==database.epoch)throw new Error('Shop data was erased or restored on another device. Refresh the shop and enter this action again.');
  let result=null;
  if(request.command==='account'){
    domain.requireAdmin(user);const input=request.payload||{};
    if(!same_(input.currentProof,proof_(user.passwordHash,request.token+':account')))throw new Error('Your current password is incorrect.');
    const name=String(input.name||'').trim();if(!name||name.length>80)throw new Error('Enter a display name of up to 80 characters.');user.name=name;
    if(input.passwordHash||input.salt){if(!/^[a-f0-9]{64}$/.test(input.passwordHash)||! /^[a-f0-9]{32}$/.test(input.salt))throw new Error('Invalid new password credentials.');user.passwordHash=input.passwordHash;user.salt=input.salt;}
  }else{result=domain.applyShopAction(state,user,request.command,request.payload)||null;}
  state.revision++;domain.validateState(state);
  if(['erase','restore'].includes(request.command)){database.epoch=Utilities.getUuid();database.operations=[];}
  database.operations.push({id:request.requestId,userId:user.id,command:request.command,result,at:Date.now()});database.operations=database.operations.slice(-1000);
  const serialized=JSON.stringify(database);if(Utilities.newBlob(serialized).getBytes().length>8000000)throw new Error('The shared database exceeds 8 MB. Export a backup and reduce stored product photos.');
  file.setContent(serialized);
  if(request.command==='account')cache.put('session:'+digest_(request.token),JSON.stringify({...session,fingerprint:user.passwordHash}),Math.max(1,Math.floor((session.expiresAt-Date.now())/1000)));
  return {ok:true,result,...snapshot_(database)};
}

const domain=(function(){
function structuredClone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
function atob(value){return Utilities.base64Decode(value).map(n=>String.fromCharCode(n&255)).join('');}
const VERSION = 2;
const CATEGORIES = ['Vegetables', 'Leafy greens', 'Roots & tubers', 'Herbs', 'Fruits'];
const UNITS = ['kg', 'pcs', 'bunch'];
const EMOJIS = ['🥬','🍅','🥔','🧅','🥕','🥦','🥒','🫑','🍆','🌽','🌿','🍋','🧄','🫛','🍄','🎃','🍎','🍌','🥑','🍠'];
const roundQty = n => Math.round(Number(n) * 1000) / 1000;
const uid = () => Utilities.getUuid();
const MAX_IMAGE_LENGTH = 120000;
const fail = message => { throw new Error(message); };
const finite = (value, name, min = 0, max = 1e9) => {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n) || n < min || n > max) fail(`${name} must be between ${min} and ${max}.`);
  return n;
};
function quantity(value, unit, allowZero = false) {
  const q = finite(value, 'Quantity', allowZero ? 0 : 0.001, 1e6);
  if (Math.abs(q - roundQty(q)) > 1e-7) fail('Use no more than three decimal places for quantities.');
  if (unit !== 'kg' && !Number.isInteger(q)) fail('Pieces and bunches must have whole-number quantities.');
  return roundQty(q);
}
function money(value, label = 'Amount') {
  const n = finite(value, label, 0, 1e7);
  return Math.round(n * 100);
}
function validateProductImage(value) {
  if(value === '' || value == null) return '';
  if(typeof value!=='string' || value.length>MAX_IMAGE_LENGTH || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) fail('Choose a JPG, PNG or WebP product photo under 90 KB after compression.');
  let bytes;try{bytes=atob(value.split(',')[1]);}catch{fail('The product photo is not valid.');}
  const valid=value.startsWith('data:image/jpeg')?bytes.startsWith('\xff\xd8\xff'):value.startsWith('data:image/png')?bytes.startsWith('\x89PNG\r\n\x1a\n'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
  if(!valid) fail('The product photo format does not match its contents.');
  return value;
}
function calculateWeightPrice(rate, weight, unit = 'kg') {
  if(!['kg','g'].includes(unit)) fail('Choose kilograms or grams.');
  const value=finite(weight,'Weight',unit==='g'?1:0.001,unit==='g'?1e9:1e6);
  if(unit==='g'&&!Number.isInteger(value)) fail('Enter grams as a whole number (minimum 1 g).');
  const q=quantity(unit==='g'?value/1000:value,'kg');
  const price=money(rate,'Price per kilogram');
  if(!price) fail('Price per kilogram must be greater than zero.');
  return {quantity:q,price,total:Math.round(price*q)};
}
// Existing receipts remain intact. Old sales are excluded because v1 did not record investments.
function upgradeState(state, now = new Date()) {
  if(state?.schemaVersion===1 && Array.isArray(state.products) && Array.isArray(state.sales)) {
    const next=structuredClone(state);
    next.schemaVersion=VERSION;
    next.products.forEach(p=>{p.image='';});
    next.purchases=[];
    next.recovery={startedAt:now.toISOString(),excludedSaleIds:next.sales.map(s=>s.id),nextOrder:1};
    return next;
  }
  return state;
}
function purchaseEntry(state,p,amount,user,{quantity=null,source='value_only',note='',movementId=null,at=new Date().toISOString()}={}) {
  const record={id:uid(),productId:p.id,productName:p.name,amount,quantity,unit:p.unit,source,note,actor:user.name,movementId,at,recoveryOrder:state.recovery.nextOrder++};
  state.purchases.push(record);
  return record.id;
}
function recordPurchase(state,input,user) {
  requireAdmin(user);
  const p=productById(state,input.productId,true);
  const note=String(input.note||'').trim();
  if(note.length<3||note.length>250) fail('Add a purchase note of 3–250 characters.');
  const amount=money(input.amount,'Purchased goods value');
  if(!amount) fail('Purchased goods value must be greater than zero.');
  return purchaseEntry(state,p,amount,user,{note});
}
function recoveryStats(state) {
  const excluded=new Set(state.recovery.excludedSaleIds);
  const sales=state.sales.filter(s=>s.status==='completed'&&!excluded.has(s.id));
  const events=[...state.purchases.map(p=>({kind:'purchase',record:p})),...sales.map(s=>({kind:'sale',record:s}))].sort((a,b)=>a.record.recoveryOrder-b.record.recoveryOrder);
  const records=[],byPurchase={};let invested=0,revenue=0,surplus=0,oldest=0;
  for(const event of events) {
    const item=event.record;
    if(event.kind==='purchase') {
      invested+=item.amount;
      const progress={id:item.id,amount:item.amount,recovered:0,remaining:item.amount};
      records.push(progress);byPurchase[item.id]=progress;
    } else {
      revenue+=item.total;let available=item.total;
      while(available>0&&oldest<records.length) {
        const purchase=records[oldest],applied=Math.min(available,purchase.remaining);
        purchase.remaining-=applied;purchase.recovered+=applied;available-=applied;
        if(!purchase.remaining)oldest++;
      }
      // Extra sales stay separate: they must never silently settle a future restock.
      surplus+=available;
    }
  }
  const remaining=records.reduce((n,p)=>n+p.remaining,0),recovered=invested-remaining;
  return {invested,revenue,recovered,remaining,surplus,percent:invested?recovered/invested*100:0,purchaseCount:records.length,outstandingCount:records.filter(p=>p.remaining>0).length,byPurchase};
}
function dayKey(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function requireAdmin(user) { if (user?.role !== 'admin') fail('Management access is required.'); }
function authorized(user) { if (!user || !['admin', 'sales'].includes(user.role)) fail('Please sign in again.'); }
function productById(state, id, includeArchived = false) {
  const p = state.products.find(p => p.id === id && (includeArchived || p.active));
  if (!p) fail('This product is no longer available.');
  return p;
}
function ledger(state, p, delta, type, note, user, reference = '', at = new Date().toISOString()) {
  p.stock = roundQty(p.stock + delta);
  const entry={id:uid(), productId:p.id, productName:p.name, unit:p.unit, delta:roundQty(delta), balance:p.stock, type, note, actor:user.name, reference, at};
  state.movements.push(entry);
  return entry;
}
function saveProduct(state, input, user) {
  requireAdmin(user);
  const name = String(input.name || '').trim();
  const sku = String(input.sku || '').trim().toUpperCase();
  if (name.length < 2 || name.length > 80) fail('Product name must be 2–80 characters.');
  if (!/^[A-Z0-9_-]{2,30}$/.test(sku)) fail('SKU must be 2–30 letters, numbers, hyphens or underscores.');
  if (state.products.some(p => p.sku === sku && p.id !== input.id)) fail('That SKU is already in use, including archived products.');
  if (!CATEGORIES.includes(input.category) || !UNITS.includes(input.unit)) fail('Choose a valid category and unit.');
  if (input.emoji && !EMOJIS.includes(input.emoji)) fail('Choose a valid product icon.');
  const image=input.image === undefined ? undefined : validateProductImage(input.image);
  const cost = money(input.cost, 'Cost price'), price = money(input.price, 'Selling price');
  if (price <= 0) fail('Selling price must be greater than zero.');
  const minStock = quantity(input.minStock, input.unit, true);
  let p;
  if (input.id) {
    p = productById(state, input.id, true);
    if (p.unit !== input.unit && state.movements.some(m => m.productId === p.id)) fail('The unit cannot change after stock is recorded. Create a new product for a different unit.');
    Object.assign(p, {name, sku, category:input.category, unit:input.unit, cost, price, minStock, supplier:String(input.supplier || '').trim().slice(0,100), emoji:input.emoji || p.emoji});
    if(image!==undefined) p.image=image;
  } else {
    p = {id:uid(), name, sku, category:input.category, unit:input.unit, cost, price, minStock, supplier:String(input.supplier || '').trim().slice(0,100), emoji:input.emoji || '🥬', image:image||'', stock:0, active:true};
    const stock = quantity(input.stock ?? 0, p.unit, true);
    const amount=input.purchaseValue!==undefined&&input.purchaseValue!==''?money(input.purchaseValue,'Purchased goods value'):Math.round(stock*cost);
    if(!stock&&amount) fail('Enter opening stock before recording its purchase value.');
    if(stock&&input.purchaseValue!==undefined&&input.purchaseValue!=='') p.cost=Math.round(amount/stock);
    state.products.push(p);
    if (stock) {
      const m=ledger(state,p,stock,'opening','Opening stock',user);
      purchaseEntry(state,p,amount,user,{quantity:stock,source:'opening',note:'Opening stock purchase',movementId:m.id,at:m.at});
    }
  }
  return p.id;
}
function archiveProduct(state, id, user) {
  requireAdmin(user);
  const p = productById(state,id,true);
  p.active = !p.active;
}
function adjustStock(state, input, user) {
  requireAdmin(user);
  const p = productById(state, input.productId);
  if (!['receive','waste','adjust'].includes(input.type)) fail('Choose a stock movement type.');
  const note = String(input.note || '').trim();
  if (note.length < 3 || note.length > 250) fail('Add a stock note of 3–250 characters.');
  const q = quantity(input.quantity,p.unit,input.type === 'adjust');
  const delta = input.type === 'adjust' ? roundQty(q - p.stock) : input.type === 'waste' ? -q : q;
  if (!delta) fail('The stock count is already correct.');
  if (roundQty(p.stock + delta) < 0) fail('There is not enough stock for this adjustment.');
  let purchaseAmount;
  if (input.type === 'receive') {
    const purchaseCost=input.purchaseCost!==''&&input.purchaseCost!=null?money(input.purchaseCost,'Purchase cost'):p.cost;
    purchaseAmount=input.purchaseValue!==''&&input.purchaseValue!=null?money(input.purchaseValue,'Purchased goods value'):Math.round(q*purchaseCost);
    p.cost = Math.round((p.stock * p.cost + purchaseAmount) / (p.stock + q));
  }
  const m=ledger(state,p,delta,input.type,note,user);
  if(input.type==='receive') purchaseEntry(state,p,purchaseAmount,user,{quantity:q,source:'receive',note,movementId:m.id,at:m.at});
}
function calculateCart(state, items, discount = 0) {
  if (!Array.isArray(items) || !items.length) fail('Add at least one product to the basket.');
  const seen = new Set();
  const lines = items.map(item => {
    if (seen.has(item.productId)) fail('A product is duplicated in the basket.');
    seen.add(item.productId);
    const p = productById(state, item.productId);
    const q = quantity(item.quantity,p.unit);
    if (q > p.stock) fail(`Only ${p.stock} ${p.unit} of ${p.name} is available.`);
    return {productId:p.id,name:p.name,sku:p.sku,emoji:p.emoji,category:p.category,unit:p.unit,quantity:q,price:p.price,cost:p.cost,total:Math.round(p.price*q),costTotal:Math.round(p.cost*q)};
  });
  const subtotal = lines.reduce((a,l)=>a+l.total,0);
  const discountAmount = money(discount,'Discount');
  if (discountAmount > subtotal) fail('Discount cannot exceed the subtotal.');
  const total = subtotal - discountAmount;
  return {lines,subtotal,discount:discountAmount,total,cost:lines.reduce((a,l)=>a+l.costTotal,0)};
}
function checkout(state, input, user) {
  authorized(user);
  if (input.token && state.sales.some(s=>s.token === input.token)) fail('This order has already been completed.');
  const calculated = calculateCart(state,input.items,input.discount || 0);
  if(input.expectedTotal != null && calculated.total !== input.expectedTotal) fail('Prices have changed. Close this window and review the updated basket before paying.');
  if (!['Cash','UPI','Card'].includes(input.payment)) fail('Choose a payment method.');
  const received = input.payment === 'Cash' ? money(input.received,'Cash received') : calculated.total;
  if (received < calculated.total) fail('Cash received is less than the order total.');
  const at = input.at || new Date().toISOString();
  const sale = {id:uid(),number:`FL-${String(state.nextSale++).padStart(5,'0')}`,token:input.token || uid(),at,actor:user.name,customer:String(input.customer || '').trim().slice(0,80) || 'Walk-in customer',payment:input.payment,received,change:received-calculated.total,status:'completed',recoveryOrder:state.recovery.nextOrder++,...calculated};
  for (const line of sale.lines) ledger(state,productById(state,line.productId),-line.quantity,'sale','Sale',user,sale.number,at);
  state.sales.push(sale);
  return sale.id;
}
function voidSale(state,id,reason,user) {
  requireAdmin(user);
  const sale = state.sales.find(s=>s.id===id);
  if (!sale || sale.status !== 'completed') fail('This sale cannot be voided.');
  if (String(reason).trim().length < 3) fail('Enter a reason for the void.');
  for (const line of sale.lines) {
    const p=productById(state,line.productId,true);
    p.cost=Math.round((p.stock*p.cost+line.quantity*line.cost)/(p.stock+line.quantity));
    ledger(state,p,line.quantity,'void',String(reason).trim().slice(0,250),user,sale.number);
  }
  sale.status='voided'; sale.voidReason=String(reason).trim().slice(0,250);sale.voidAt=new Date().toISOString();sale.voidBy=user.name;
}
function stats(sales) {
  const completed=sales.filter(s=>s.status==='completed');
  return {revenue:completed.reduce((a,s)=>a+s.total,0),profit:completed.reduce((a,s)=>a+s.total-s.cost,0),orders:completed.length,average:completed.length ? Math.round(completed.reduce((a,s)=>a+s.total,0)/completed.length) : 0};
}
function eraseShopData(state, user, now = new Date()) {
  requireAdmin(user);
  state.products=[]; state.sales=[]; state.movements=[]; state.purchases=[];
  state.recovery={startedAt:now.toISOString(),excludedSaleIds:[],nextOrder:1};
  state.nextSale=1; state.demo=false;
  state.settings={shopName:'Freshleaf',subtitle:'Your neighbourhood vegetable shop',address:'',phone:'',currency:'INR',receiptFooter:'Fresh picks. Happy meals. See you again!'};
  // Accounts, password hashes, salts and session identity are deliberately retained.
}
function createInitialState(now = new Date()) {
  const state = {schemaVersion:VERSION,revision:0,demo:true,createdAt:now.toISOString(),nextSale:1,settings:{shopName:'Freshleaf',subtitle:'Your neighbourhood vegetable shop',address:'',phone:'',currency:'INR',receiptFooter:'Fresh picks. Happy meals. See you again!'},users:[{id:'admin',name:'Alex Morgan',email:'admin@freshleaf.local',role:'admin'},{id:'sales',name:'Sam Taylor',email:'sales@freshleaf.local',role:'sales'}],products:[],sales:[],movements:[],purchases:[],recovery:{startedAt:now.toISOString(),excludedSaleIds:[],nextOrder:1}};
  const data = [
    ['Tomatoes','Vegetables','kg',24,40,90,15,'🍅'],['Potatoes','Roots & tubers','kg',18,30,110,20,'🥔'],['Red onions','Roots & tubers','kg',25,45,85,15,'🧅'],['Carrots','Roots & tubers','kg',32,60,65,12,'🥕'],['Broccoli','Vegetables','kg',65,100,45,10,'🥦'],['Spinach','Leafy greens','bunch',12,25,75,15,'🥬'],['Cucumber','Vegetables','kg',20,40,65,10,'🥒'],['Bell peppers','Vegetables','kg',55,90,55,10,'🫑'],['Aubergine','Vegetables','kg',25,45,55,10,'🍆'],['Sweet corn','Vegetables','pcs',15,30,100,15,'🌽'],['Coriander','Herbs','bunch',5,15,100,15,'🌿'],['Lemons','Fruits','pcs',3,8,150,20,'🍋']
  ];
  data.forEach((row,i)=>saveProduct(state,{name:row[0],sku:`VEG-${String(i+1).padStart(3,'0')}`,category:row[1],unit:row[2],cost:row[3],price:row[4],stock:row[5],minStock:row[6],emoji:row[7],supplier:i%2?'Green Valley Farms':'Morning Market'},state.users[0]));
  const start = new Date(now);start.setDate(start.getDate()-13);start.setHours(7,0,0,0);
  state.movements.forEach(m=>m.at=start.toISOString());
  state.purchases.forEach(p=>p.at=start.toISOString());state.recovery.startedAt=start.toISOString();
  let seed=42; const rand=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  for(let day=0;day<14;day++) {
    const count=6+Math.floor(rand()*8)+(day===13?3:0);
    for(let j=0;j<count;j++) {
      const candidates=[...state.products].sort(()=>0); const picks=[];
      for(let k=0;k<2+Math.floor(rand()*4);k++) {
        const p=candidates.splice(Math.floor(rand()*candidates.length),1)[0];
        const q=p.unit==='kg'? (1+Math.floor(rand()*6))/4:1+Math.floor(rand()*3);
        if(p.stock < q+2) {
          const amount=p.unit==='kg'?40:50;
          const m=ledger(state,p,amount,'receive','Sample delivery',state.users[0],'',new Date(start.getTime()+day*864e5).toISOString());
          purchaseEntry(state,p,Math.round(amount*p.cost),state.users[0],{quantity:amount,source:'receive',note:'Sample delivery',movementId:m.id,at:m.at});
        }
        picks.push({productId:p.id,quantity:q});
      }
      const at=new Date(now);at.setDate(at.getDate()-(13-day));at.setHours(8+Math.floor(j/2),j%2?38:12,0,0);
      if(day===13 && at>now) at.setTime(now.getTime()-(count-j)*60000);
      checkout(state,{items:picks,discount:0,payment:['Cash','UPI','Card'][Math.floor(rand()*3)],received:1000,at:at.toISOString()},state.users[1]);
    }
  }
  [0,4,5].forEach((index,i)=>{const p=state.products[index];ledger(state,p,-p.stock+[8.5,4,0][i],'adjust','Sample stock count',state.users[0]);});
  return state;
}
function validateState(s) {
  s=upgradeState(s);
  if(!s || s.schemaVersion!==VERSION || !s.settings || !Array.isArray(s.products) || !Array.isArray(s.sales) || !Array.isArray(s.movements) || !Array.isArray(s.users)) fail('This is not a supported Freshleaf backup.');
  if(s.products.length>10000 || s.sales.length>100000 || s.movements.length>500000) fail('The backup is too large for this browser app.');
  if(typeof s.demo!=='boolean' || !Number.isInteger(s.nextSale) || s.nextSale<1 || !Number.isInteger(s.revision) || s.revision<0) fail('Invalid backup metadata.');
  const string=(v,max=250)=>typeof v==='string' && v.length<=max;
  const validId=v=>string(v,100)&&/^[a-zA-Z0-9_-]+$/.test(v);
  const amount=v=>Number.isSafeInteger(v)&&v>=0;
  const date=v=>typeof v==='string' && Number.isFinite(Date.parse(v));
  if(!string(s.settings.shopName,80)||!s.settings.shopName.trim()||!string(s.settings.address)||!string(s.settings.phone,40)||!string(s.settings.receiptFooter)||!['INR','USD','GBP','EUR'].includes(s.settings.currency)) fail('Invalid shop settings in backup.');
  const ids=new Set(), skus=new Set();
  for(const p of s.products) {
    if(!validId(p.id)||ids.has(p.id)||!string(p.name,80)||!p.name.trim()||!string(p.sku,30)||skus.has(p.sku)||!CATEGORIES.includes(p.category)||!UNITS.includes(p.unit)||!amount(p.cost)||!amount(p.price)||p.price===0||typeof p.active!=='boolean'||!EMOJIS.includes(p.emoji)||!string(p.supplier,100)) fail('Invalid or duplicated product in backup.');
    quantity(p.stock,p.unit,true);quantity(p.minStock,p.unit,true);ids.add(p.id);skus.add(p.sku);
    validateProductImage(p.image);
  }
  const users=new Set();
  for(const u of s.users) {
    if(!validId(u.id)||users.has(u.id)||!string(u.name,80)||!string(u.email,120)||!['admin','sales'].includes(u.role)||!string(u.salt,64)||!/^[0-9a-f]{32}$/.test(u.salt)||!string(u.passwordHash,128)||!/^[0-9a-f]{64}$/.test(u.passwordHash)) fail('Invalid accounts in backup.');
    users.add(u.id);
  }
  if(!s.users.some(u=>u.role==='admin')) fail('Backup must contain a management account.');
  const salesIds=new Set(), numbers=new Set();let largest=0;
  for(const sale of s.sales) {
    if(!validId(sale.id)||salesIds.has(sale.id)||!/^FL-\d{5,}$/.test(sale.number)||numbers.has(sale.number)||!date(sale.at)||!['completed','voided'].includes(sale.status)||!['Cash','UPI','Card'].includes(sale.payment)||!string(sale.actor,80)||!string(sale.customer,80)||!Array.isArray(sale.lines)||!sale.lines.length) fail('Invalid sale in backup.');
    for(const k of ['subtotal','discount','total','cost','received','change']) if(!amount(sale[k])) fail('Invalid sale amount in backup.');
    let subtotal=0,cost=0;const lineIds=new Set();
    for(const l of sale.lines) {
      if(!ids.has(l.productId)||lineIds.has(l.productId)||!string(l.name,80)||!string(l.sku,30)||!EMOJIS.includes(l.emoji)||!CATEGORIES.includes(l.category)||!UNITS.includes(l.unit)||!amount(l.price)||!amount(l.cost)||!amount(l.total)||!amount(l.costTotal)) fail('Invalid sale item in backup.');
      quantity(l.quantity,l.unit);if(l.total!==Math.round(l.price*l.quantity)||l.costTotal!==Math.round(l.cost*l.quantity)) fail('Sale item totals do not match.');
      subtotal+=l.total;cost+=l.costTotal;lineIds.add(l.productId);
    }
    if(subtotal!==sale.subtotal||cost!==sale.cost||sale.discount>subtotal||sale.total!==subtotal-sale.discount||sale.received<sale.total||sale.change!==sale.received-sale.total) fail('Sale totals do not match.');
    salesIds.add(sale.id);numbers.add(sale.number);largest=Math.max(largest,Number(sale.number.slice(3)));
  }
  if(s.nextSale<=largest) fail('The receipt sequence is invalid.');
  const balances=new Map(), movementIds=new Set();
  for(const m of s.movements) {
    if(!string(m.id,100)||movementIds.has(m.id)||!ids.has(m.productId)||!string(m.productName,80)||!UNITS.includes(m.unit)||!['opening','receive','waste','adjust','sale','void'].includes(m.type)||!date(m.at)||!string(m.actor,80)||!string(m.note)||!string(m.reference,100)||!Number.isFinite(m.delta)||!Number.isFinite(m.balance)||m.balance<0) fail('Invalid stock movement in backup.');
    const prev=balances.get(m.productId)||0;
    if(roundQty(prev+m.delta)!==m.balance) fail('Stock ledger balances do not match.');
    balances.set(m.productId,m.balance);movementIds.add(m.id);
  }
  for(const p of s.products) if((balances.get(p.id)||0)!==p.stock) fail('Inventory and stock ledger do not match.');
  if(!Array.isArray(s.purchases)||s.purchases.length>100000||!s.recovery||!date(s.recovery.startedAt)||!Number.isSafeInteger(s.recovery.nextOrder)||s.recovery.nextOrder<1||!Array.isArray(s.recovery.excludedSaleIds)||s.recovery.excludedSaleIds.some(id=>!salesIds.has(id))||new Set(s.recovery.excludedSaleIds).size!==s.recovery.excludedSaleIds.length) fail('Invalid purchase recovery records in backup.');
  const orders=new Set(),excluded=new Set(s.recovery.excludedSaleIds);
  for(const item of [...s.purchases,...s.sales.filter(sale=>!excluded.has(sale.id))]) {
    if(!Number.isSafeInteger(item.recoveryOrder)||item.recoveryOrder<1||item.recoveryOrder>=s.recovery.nextOrder||orders.has(item.recoveryOrder))fail('Invalid investment event sequence in backup.');
    orders.add(item.recoveryOrder);
  }
  const purchaseIds=new Set(),linkedMovements=new Set(),movementsById=new Map(s.movements.map(m=>[m.id,m]));
  for(const p of s.purchases) {
    if(!validId(p.id)||purchaseIds.has(p.id)||!ids.has(p.productId)||!string(p.productName,80)||!amount(p.amount)||!UNITS.includes(p.unit)||!['opening','receive','value_only'].includes(p.source)||!date(p.at)||!string(p.note)||!string(p.actor,80)) fail('Invalid purchase in backup.');
    if(p.source==='value_only'){if(p.quantity!==null||p.movementId!==null)fail('Value-only purchases must not change stock.');}
    else {quantity(p.quantity,p.unit);const m=movementsById.get(p.movementId);if(!m||linkedMovements.has(m.id)||m.productId!==p.productId||m.type!==p.source||m.delta!==p.quantity||m.unit!==p.unit)fail('Purchase and stock movement do not match.');linkedMovements.add(m.id);}
    purchaseIds.add(p.id);
  }
  return s;
}


// These same commands run in Apps Script, against the latest locked Drive record.
function applyShopAction(state,user,action,payload={}) {
  switch(action) {
    case 'product':return saveProduct(state,payload,user);
    case 'stock':return adjustStock(state,payload,user);
    case 'purchase':return payload.mode==='delivery'?adjustStock(state,{productId:payload.productId,type:'receive',quantity:payload.quantity,purchaseValue:payload.amount,note:payload.note},user):recordPurchase(state,payload,user);
    case 'archive':return archiveProduct(state,payload.id,user);
    case 'checkout':return checkout(state,payload,user);
    case 'void':return voidSale(state,payload.id,payload.reason,user);
    case 'erase':requireAdmin(user);if(payload.confirmation!=='CLEAR')throw new Error('Type CLEAR to confirm.');return eraseShopData(state,user);
    case 'settings':{
      requireAdmin(user);const name=String(payload.shopName||'').trim();if(!name||name.length>80)throw new Error('Enter a shop name of up to 80 characters.');
      state.settings={...state.settings,shopName:name,address:String(payload.address||'').trim().slice(0,250),phone:String(payload.phone||'').trim().slice(0,40),currency:payload.currency,receiptFooter:String(payload.receiptFooter||'').trim().slice(0,250)};
      if(!['INR','USD','GBP','EUR'].includes(state.settings.currency))throw new Error('Choose a supported currency.');return;
    }
    case 'restore':{
      requireAdmin(user);if(payload.confirmation!=='RESTORE')throw new Error('Type RESTORE to confirm.');
      const restored=structuredClone(validateState(payload.state));Object.keys(state).forEach(key=>delete state[key]);Object.assign(state,restored);return;
    }
    default:throw new Error('Unknown shop action.');
  }
}

return {validateState,requireAdmin,applyShopAction,createInitialState,eraseShopData};
})();
// CryptoJS 4.2.0: bundled official core/SHA256/HMAC/PBKDF2 modules, used only for initial account setup.
/*
# License

[The MIT License (MIT)](http://opensource.org/licenses/MIT)

Copyright (c) 2009-2013 Jeff Mott  
Copyright (c) 2013-2016 Evan Vosberg

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

*/
function freshleafPasswordCrypto_(){
const modules={};
function require(name){if(!Object.hasOwnProperty.call(modules,name))throw new Error('Module unavailable: '+name);return modules[name];}
(function(){var module={exports:{}},exports=module.exports;
;(function (root, factory) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory();
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define([], factory);
	}
	else {
		// Global (browser)
		root.CryptoJS = factory();
	}
}(this, function () {

	/*globals window, global, require*/

	/**
	 * CryptoJS core components.
	 */
	var CryptoJS = CryptoJS || (function (Math, undefined) {

	    var crypto;

	    // Native crypto from window (Browser)
	    if (typeof window !== 'undefined' && window.crypto) {
	        crypto = window.crypto;
	    }

	    // Native crypto in web worker (Browser)
	    if (typeof self !== 'undefined' && self.crypto) {
	        crypto = self.crypto;
	    }

	    // Native crypto from worker
	    if (typeof globalThis !== 'undefined' && globalThis.crypto) {
	        crypto = globalThis.crypto;
	    }

	    // Native (experimental IE 11) crypto from window (Browser)
	    if (!crypto && typeof window !== 'undefined' && window.msCrypto) {
	        crypto = window.msCrypto;
	    }

	    // Native crypto from global (NodeJS)
	    if (!crypto && typeof global !== 'undefined' && global.crypto) {
	        crypto = global.crypto;
	    }

	    // Native crypto import via require (NodeJS)
	    if (!crypto && typeof require === 'function') {
	        try {
	            crypto = require('crypto');
	        } catch (err) {}
	    }

	    /*
	     * Cryptographically secure pseudorandom number generator
	     *
	     * As Math.random() is cryptographically not safe to use
	     */
	    var cryptoSecureRandomInt = function () {
	        if (crypto) {
	            // Use getRandomValues method (Browser)
	            if (typeof crypto.getRandomValues === 'function') {
	                try {
	                    return crypto.getRandomValues(new Uint32Array(1))[0];
	                } catch (err) {}
	            }

	            // Use randomBytes method (NodeJS)
	            if (typeof crypto.randomBytes === 'function') {
	                try {
	                    return crypto.randomBytes(4).readInt32LE();
	                } catch (err) {}
	            }
	        }

	        throw new Error('Native crypto module could not be used to get secure random number.');
	    };

	    /*
	     * Local polyfill of Object.create

	     */
	    var create = Object.create || (function () {
	        function F() {}

	        return function (obj) {
	            var subtype;

	            F.prototype = obj;

	            subtype = new F();

	            F.prototype = null;

	            return subtype;
	        };
	    }());

	    /**
	     * CryptoJS namespace.
	     */
	    var C = {};

	    /**
	     * Library namespace.
	     */
	    var C_lib = C.lib = {};

	    /**
	     * Base object for prototypal inheritance.
	     */
	    var Base = C_lib.Base = (function () {


	        return {
	            /**
	             * Creates a new object that inherits from this object.
	             *
	             * @param {Object} overrides Properties to copy into the new object.
	             *
	             * @return {Object} The new object.
	             *
	             * @static
	             *
	             * @example
	             *
	             *     var MyType = CryptoJS.lib.Base.extend({
	             *         field: 'value',
	             *
	             *         method: function () {
	             *         }
	             *     });
	             */
	            extend: function (overrides) {
	                // Spawn
	                var subtype = create(this);

	                // Augment
	                if (overrides) {
	                    subtype.mixIn(overrides);
	                }

	                // Create default initializer
	                if (!subtype.hasOwnProperty('init') || this.init === subtype.init) {
	                    subtype.init = function () {
	                        subtype.$super.init.apply(this, arguments);
	                    };
	                }

	                // Initializer's prototype is the subtype object
	                subtype.init.prototype = subtype;

	                // Reference supertype
	                subtype.$super = this;

	                return subtype;
	            },

	            /**
	             * Extends this object and runs the init method.
	             * Arguments to create() will be passed to init().
	             *
	             * @return {Object} The new object.
	             *
	             * @static
	             *
	             * @example
	             *
	             *     var instance = MyType.create();
	             */
	            create: function () {
	                var instance = this.extend();
	                instance.init.apply(instance, arguments);

	                return instance;
	            },

	            /**
	             * Initializes a newly created object.
	             * Override this method to add some logic when your objects are created.
	             *
	             * @example
	             *
	             *     var MyType = CryptoJS.lib.Base.extend({
	             *         init: function () {
	             *             // ...
	             *         }
	             *     });
	             */
	            init: function () {
	            },

	            /**
	             * Copies properties into this object.
	             *
	             * @param {Object} properties The properties to mix in.
	             *
	             * @example
	             *
	             *     MyType.mixIn({
	             *         field: 'value'
	             *     });
	             */
	            mixIn: function (properties) {
	                for (var propertyName in properties) {
	                    if (properties.hasOwnProperty(propertyName)) {
	                        this[propertyName] = properties[propertyName];
	                    }
	                }

	                // IE won't copy toString using the loop above
	                if (properties.hasOwnProperty('toString')) {
	                    this.toString = properties.toString;
	                }
	            },

	            /**
	             * Creates a copy of this object.
	             *
	             * @return {Object} The clone.
	             *
	             * @example
	             *
	             *     var clone = instance.clone();
	             */
	            clone: function () {
	                return this.init.prototype.extend(this);
	            }
	        };
	    }());

	    /**
	     * An array of 32-bit words.
	     *
	     * @property {Array} words The array of 32-bit words.
	     * @property {number} sigBytes The number of significant bytes in this word array.
	     */
	    var WordArray = C_lib.WordArray = Base.extend({
	        /**
	         * Initializes a newly created word array.
	         *
	         * @param {Array} words (Optional) An array of 32-bit words.
	         * @param {number} sigBytes (Optional) The number of significant bytes in the words.
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.lib.WordArray.create();
	         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
	         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
	         */
	        init: function (words, sigBytes) {
	            words = this.words = words || [];

	            if (sigBytes != undefined) {
	                this.sigBytes = sigBytes;
	            } else {
	                this.sigBytes = words.length * 4;
	            }
	        },

	        /**
	         * Converts this word array to a string.
	         *
	         * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
	         *
	         * @return {string} The stringified word array.
	         *
	         * @example
	         *
	         *     var string = wordArray + '';
	         *     var string = wordArray.toString();
	         *     var string = wordArray.toString(CryptoJS.enc.Utf8);
	         */
	        toString: function (encoder) {
	            return (encoder || Hex).stringify(this);
	        },

	        /**
	         * Concatenates a word array to this word array.
	         *
	         * @param {WordArray} wordArray The word array to append.
	         *
	         * @return {WordArray} This word array.
	         *
	         * @example
	         *
	         *     wordArray1.concat(wordArray2);
	         */
	        concat: function (wordArray) {
	            // Shortcuts
	            var thisWords = this.words;
	            var thatWords = wordArray.words;
	            var thisSigBytes = this.sigBytes;
	            var thatSigBytes = wordArray.sigBytes;

	            // Clamp excess bits
	            this.clamp();

	            // Concat
	            if (thisSigBytes % 4) {
	                // Copy one byte at a time
	                for (var i = 0; i < thatSigBytes; i++) {
	                    var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	                    thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
	                }
	            } else {
	                // Copy one word at a time
	                for (var j = 0; j < thatSigBytes; j += 4) {
	                    thisWords[(thisSigBytes + j) >>> 2] = thatWords[j >>> 2];
	                }
	            }
	            this.sigBytes += thatSigBytes;

	            // Chainable
	            return this;
	        },

	        /**
	         * Removes insignificant bits.
	         *
	         * @example
	         *
	         *     wordArray.clamp();
	         */
	        clamp: function () {
	            // Shortcuts
	            var words = this.words;
	            var sigBytes = this.sigBytes;

	            // Clamp
	            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
	            words.length = Math.ceil(sigBytes / 4);
	        },

	        /**
	         * Creates a copy of this word array.
	         *
	         * @return {WordArray} The clone.
	         *
	         * @example
	         *
	         *     var clone = wordArray.clone();
	         */
	        clone: function () {
	            var clone = Base.clone.call(this);
	            clone.words = this.words.slice(0);

	            return clone;
	        },

	        /**
	         * Creates a word array filled with random bytes.
	         *
	         * @param {number} nBytes The number of random bytes to generate.
	         *
	         * @return {WordArray} The random word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.lib.WordArray.random(16);
	         */
	        random: function (nBytes) {
	            var words = [];

	            for (var i = 0; i < nBytes; i += 4) {
	                words.push(cryptoSecureRandomInt());
	            }

	            return new WordArray.init(words, nBytes);
	        }
	    });

	    /**
	     * Encoder namespace.
	     */
	    var C_enc = C.enc = {};

	    /**
	     * Hex encoding strategy.
	     */
	    var Hex = C_enc.Hex = {
	        /**
	         * Converts a word array to a hex string.
	         *
	         * @param {WordArray} wordArray The word array.
	         *
	         * @return {string} The hex string.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
	         */
	        stringify: function (wordArray) {
	            // Shortcuts
	            var words = wordArray.words;
	            var sigBytes = wordArray.sigBytes;

	            // Convert
	            var hexChars = [];
	            for (var i = 0; i < sigBytes; i++) {
	                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	                hexChars.push((bite >>> 4).toString(16));
	                hexChars.push((bite & 0x0f).toString(16));
	            }

	            return hexChars.join('');
	        },

	        /**
	         * Converts a hex string to a word array.
	         *
	         * @param {string} hexStr The hex string.
	         *
	         * @return {WordArray} The word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
	         */
	        parse: function (hexStr) {
	            // Shortcut
	            var hexStrLength = hexStr.length;

	            // Convert
	            var words = [];
	            for (var i = 0; i < hexStrLength; i += 2) {
	                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
	            }

	            return new WordArray.init(words, hexStrLength / 2);
	        }
	    };

	    /**
	     * Latin1 encoding strategy.
	     */
	    var Latin1 = C_enc.Latin1 = {
	        /**
	         * Converts a word array to a Latin1 string.
	         *
	         * @param {WordArray} wordArray The word array.
	         *
	         * @return {string} The Latin1 string.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
	         */
	        stringify: function (wordArray) {
	            // Shortcuts
	            var words = wordArray.words;
	            var sigBytes = wordArray.sigBytes;

	            // Convert
	            var latin1Chars = [];
	            for (var i = 0; i < sigBytes; i++) {
	                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	                latin1Chars.push(String.fromCharCode(bite));
	            }

	            return latin1Chars.join('');
	        },

	        /**
	         * Converts a Latin1 string to a word array.
	         *
	         * @param {string} latin1Str The Latin1 string.
	         *
	         * @return {WordArray} The word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
	         */
	        parse: function (latin1Str) {
	            // Shortcut
	            var latin1StrLength = latin1Str.length;

	            // Convert
	            var words = [];
	            for (var i = 0; i < latin1StrLength; i++) {
	                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
	            }

	            return new WordArray.init(words, latin1StrLength);
	        }
	    };

	    /**
	     * UTF-8 encoding strategy.
	     */
	    var Utf8 = C_enc.Utf8 = {
	        /**
	         * Converts a word array to a UTF-8 string.
	         *
	         * @param {WordArray} wordArray The word array.
	         *
	         * @return {string} The UTF-8 string.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
	         */
	        stringify: function (wordArray) {
	            try {
	                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
	            } catch (e) {
	                throw new Error('Malformed UTF-8 data');
	            }
	        },

	        /**
	         * Converts a UTF-8 string to a word array.
	         *
	         * @param {string} utf8Str The UTF-8 string.
	         *
	         * @return {WordArray} The word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
	         */
	        parse: function (utf8Str) {
	            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
	        }
	    };

	    /**
	     * Abstract buffered block algorithm template.
	     *
	     * The property blockSize must be implemented in a concrete subtype.
	     *
	     * @property {number} _minBufferSize The number of blocks that should be kept unprocessed in the buffer. Default: 0
	     */
	    var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
	        /**
	         * Resets this block algorithm's data buffer to its initial state.
	         *
	         * @example
	         *
	         *     bufferedBlockAlgorithm.reset();
	         */
	        reset: function () {
	            // Initial values
	            this._data = new WordArray.init();
	            this._nDataBytes = 0;
	        },

	        /**
	         * Adds new data to this block algorithm's buffer.
	         *
	         * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
	         *
	         * @example
	         *
	         *     bufferedBlockAlgorithm._append('data');
	         *     bufferedBlockAlgorithm._append(wordArray);
	         */
	        _append: function (data) {
	            // Convert string to WordArray, else assume WordArray already
	            if (typeof data == 'string') {
	                data = Utf8.parse(data);
	            }

	            // Append
	            this._data.concat(data);
	            this._nDataBytes += data.sigBytes;
	        },

	        /**
	         * Processes available data blocks.
	         *
	         * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
	         *
	         * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
	         *
	         * @return {WordArray} The processed data.
	         *
	         * @example
	         *
	         *     var processedData = bufferedBlockAlgorithm._process();
	         *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
	         */
	        _process: function (doFlush) {
	            var processedWords;

	            // Shortcuts
	            var data = this._data;
	            var dataWords = data.words;
	            var dataSigBytes = data.sigBytes;
	            var blockSize = this.blockSize;
	            var blockSizeBytes = blockSize * 4;

	            // Count blocks ready
	            var nBlocksReady = dataSigBytes / blockSizeBytes;
	            if (doFlush) {
	                // Round up to include partial blocks
	                nBlocksReady = Math.ceil(nBlocksReady);
	            } else {
	                // Round down to include only full blocks,
	                // less the number of blocks that must remain in the buffer
	                nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
	            }

	            // Count words ready
	            var nWordsReady = nBlocksReady * blockSize;

	            // Count bytes ready
	            var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

	            // Process blocks
	            if (nWordsReady) {
	                for (var offset = 0; offset < nWordsReady; offset += blockSize) {
	                    // Perform concrete-algorithm logic
	                    this._doProcessBlock(dataWords, offset);
	                }

	                // Remove processed words
	                processedWords = dataWords.splice(0, nWordsReady);
	                data.sigBytes -= nBytesReady;
	            }

	            // Return processed words
	            return new WordArray.init(processedWords, nBytesReady);
	        },

	        /**
	         * Creates a copy of this object.
	         *
	         * @return {Object} The clone.
	         *
	         * @example
	         *
	         *     var clone = bufferedBlockAlgorithm.clone();
	         */
	        clone: function () {
	            var clone = Base.clone.call(this);
	            clone._data = this._data.clone();

	            return clone;
	        },

	        _minBufferSize: 0
	    });

	    /**
	     * Abstract hasher template.
	     *
	     * @property {number} blockSize The number of 32-bit words this hasher operates on. Default: 16 (512 bits)
	     */
	    var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
	        /**
	         * Configuration options.
	         */
	        cfg: Base.extend(),

	        /**
	         * Initializes a newly created hasher.
	         *
	         * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
	         *
	         * @example
	         *
	         *     var hasher = CryptoJS.algo.SHA256.create();
	         */
	        init: function (cfg) {
	            // Apply config defaults
	            this.cfg = this.cfg.extend(cfg);

	            // Set initial values
	            this.reset();
	        },

	        /**
	         * Resets this hasher to its initial state.
	         *
	         * @example
	         *
	         *     hasher.reset();
	         */
	        reset: function () {
	            // Reset data buffer
	            BufferedBlockAlgorithm.reset.call(this);

	            // Perform concrete-hasher logic
	            this._doReset();
	        },

	        /**
	         * Updates this hasher with a message.
	         *
	         * @param {WordArray|string} messageUpdate The message to append.
	         *
	         * @return {Hasher} This hasher.
	         *
	         * @example
	         *
	         *     hasher.update('message');
	         *     hasher.update(wordArray);
	         */
	        update: function (messageUpdate) {
	            // Append
	            this._append(messageUpdate);

	            // Update the hash
	            this._process();

	            // Chainable
	            return this;
	        },

	        /**
	         * Finalizes the hash computation.
	         * Note that the finalize operation is effectively a destructive, read-once operation.
	         *
	         * @param {WordArray|string} messageUpdate (Optional) A final message update.
	         *
	         * @return {WordArray} The hash.
	         *
	         * @example
	         *
	         *     var hash = hasher.finalize();
	         *     var hash = hasher.finalize('message');
	         *     var hash = hasher.finalize(wordArray);
	         */
	        finalize: function (messageUpdate) {
	            // Final message update
	            if (messageUpdate) {
	                this._append(messageUpdate);
	            }

	            // Perform concrete-hasher logic
	            var hash = this._doFinalize();

	            return hash;
	        },

	        blockSize: 512/32,

	        /**
	         * Creates a shortcut function to a hasher's object interface.
	         *
	         * @param {Hasher} hasher The hasher to create a helper for.
	         *
	         * @return {Function} The shortcut function.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
	         */
	        _createHelper: function (hasher) {
	            return function (message, cfg) {
	                return new hasher.init(cfg).finalize(message);
	            };
	        },

	        /**
	         * Creates a shortcut function to the HMAC's object interface.
	         *
	         * @param {Hasher} hasher The hasher to use in this HMAC helper.
	         *
	         * @return {Function} The shortcut function.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
	         */
	        _createHmacHelper: function (hasher) {
	            return function (message, key) {
	                return new C_algo.HMAC.init(hasher, key).finalize(message);
	            };
	        }
	    });

	    /**
	     * Algorithm namespace.
	     */
	    var C_algo = C.algo = {};

	    return C;
	}(Math));


	return CryptoJS;

}));
modules['./core']=module.exports;})();
(function(){var module={exports:{}},exports=module.exports;
;(function (root, factory) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory(require("./core"));
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define(["./core"], factory);
	}
	else {
		// Global (browser)
		factory(root.CryptoJS);
	}
}(this, function (CryptoJS) {

	(function (Math) {
	    // Shortcuts
	    var C = CryptoJS;
	    var C_lib = C.lib;
	    var WordArray = C_lib.WordArray;
	    var Hasher = C_lib.Hasher;
	    var C_algo = C.algo;

	    // Initialization and round constants tables
	    var H = [];
	    var K = [];

	    // Compute constants
	    (function () {
	        function isPrime(n) {
	            var sqrtN = Math.sqrt(n);
	            for (var factor = 2; factor <= sqrtN; factor++) {
	                if (!(n % factor)) {
	                    return false;
	                }
	            }

	            return true;
	        }

	        function getFractionalBits(n) {
	            return ((n - (n | 0)) * 0x100000000) | 0;
	        }

	        var n = 2;
	        var nPrime = 0;
	        while (nPrime < 64) {
	            if (isPrime(n)) {
	                if (nPrime < 8) {
	                    H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
	                }
	                K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

	                nPrime++;
	            }

	            n++;
	        }
	    }());

	    // Reusable object
	    var W = [];

	    /**
	     * SHA-256 hash algorithm.
	     */
	    var SHA256 = C_algo.SHA256 = Hasher.extend({
	        _doReset: function () {
	            this._hash = new WordArray.init(H.slice(0));
	        },

	        _doProcessBlock: function (M, offset) {
	            // Shortcut
	            var H = this._hash.words;

	            // Working variables
	            var a = H[0];
	            var b = H[1];
	            var c = H[2];
	            var d = H[3];
	            var e = H[4];
	            var f = H[5];
	            var g = H[6];
	            var h = H[7];

	            // Computation
	            for (var i = 0; i < 64; i++) {
	                if (i < 16) {
	                    W[i] = M[offset + i] | 0;
	                } else {
	                    var gamma0x = W[i - 15];
	                    var gamma0  = ((gamma0x << 25) | (gamma0x >>> 7))  ^
	                                  ((gamma0x << 14) | (gamma0x >>> 18)) ^
	                                   (gamma0x >>> 3);

	                    var gamma1x = W[i - 2];
	                    var gamma1  = ((gamma1x << 15) | (gamma1x >>> 17)) ^
	                                  ((gamma1x << 13) | (gamma1x >>> 19)) ^
	                                   (gamma1x >>> 10);

	                    W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
	                }

	                var ch  = (e & f) ^ (~e & g);
	                var maj = (a & b) ^ (a & c) ^ (b & c);

	                var sigma0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22));
	                var sigma1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7)  | (e >>> 25));

	                var t1 = h + sigma1 + ch + K[i] + W[i];
	                var t2 = sigma0 + maj;

	                h = g;
	                g = f;
	                f = e;
	                e = (d + t1) | 0;
	                d = c;
	                c = b;
	                b = a;
	                a = (t1 + t2) | 0;
	            }

	            // Intermediate hash value
	            H[0] = (H[0] + a) | 0;
	            H[1] = (H[1] + b) | 0;
	            H[2] = (H[2] + c) | 0;
	            H[3] = (H[3] + d) | 0;
	            H[4] = (H[4] + e) | 0;
	            H[5] = (H[5] + f) | 0;
	            H[6] = (H[6] + g) | 0;
	            H[7] = (H[7] + h) | 0;
	        },

	        _doFinalize: function () {
	            // Shortcuts
	            var data = this._data;
	            var dataWords = data.words;

	            var nBitsTotal = this._nDataBytes * 8;
	            var nBitsLeft = data.sigBytes * 8;

	            // Add padding
	            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
	            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
	            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
	            data.sigBytes = dataWords.length * 4;

	            // Hash final blocks
	            this._process();

	            // Return final computed hash
	            return this._hash;
	        },

	        clone: function () {
	            var clone = Hasher.clone.call(this);
	            clone._hash = this._hash.clone();

	            return clone;
	        }
	    });

	    /**
	     * Shortcut function to the hasher's object interface.
	     *
	     * @param {WordArray|string} message The message to hash.
	     *
	     * @return {WordArray} The hash.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var hash = CryptoJS.SHA256('message');
	     *     var hash = CryptoJS.SHA256(wordArray);
	     */
	    C.SHA256 = Hasher._createHelper(SHA256);

	    /**
	     * Shortcut function to the HMAC's object interface.
	     *
	     * @param {WordArray|string} message The message to hash.
	     * @param {WordArray|string} key The secret key.
	     *
	     * @return {WordArray} The HMAC.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var hmac = CryptoJS.HmacSHA256(message, key);
	     */
	    C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
	}(Math));


	return CryptoJS.SHA256;

}));
modules['./sha256']=module.exports;})();
(function(){var module={exports:{}},exports=module.exports;
;(function (root, factory) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory(require("./core"));
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define(["./core"], factory);
	}
	else {
		// Global (browser)
		factory(root.CryptoJS);
	}
}(this, function (CryptoJS) {

	(function () {
	    // Shortcuts
	    var C = CryptoJS;
	    var C_lib = C.lib;
	    var Base = C_lib.Base;
	    var C_enc = C.enc;
	    var Utf8 = C_enc.Utf8;
	    var C_algo = C.algo;

	    /**
	     * HMAC algorithm.
	     */
	    var HMAC = C_algo.HMAC = Base.extend({
	        /**
	         * Initializes a newly created HMAC.
	         *
	         * @param {Hasher} hasher The hash algorithm to use.
	         * @param {WordArray|string} key The secret key.
	         *
	         * @example
	         *
	         *     var hmacHasher = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, key);
	         */
	        init: function (hasher, key) {
	            // Init hasher
	            hasher = this._hasher = new hasher.init();

	            // Convert string to WordArray, else assume WordArray already
	            if (typeof key == 'string') {
	                key = Utf8.parse(key);
	            }

	            // Shortcuts
	            var hasherBlockSize = hasher.blockSize;
	            var hasherBlockSizeBytes = hasherBlockSize * 4;

	            // Allow arbitrary length keys
	            if (key.sigBytes > hasherBlockSizeBytes) {
	                key = hasher.finalize(key);
	            }

	            // Clamp excess bits
	            key.clamp();

	            // Clone key for inner and outer pads
	            var oKey = this._oKey = key.clone();
	            var iKey = this._iKey = key.clone();

	            // Shortcuts
	            var oKeyWords = oKey.words;
	            var iKeyWords = iKey.words;

	            // XOR keys with pad constants
	            for (var i = 0; i < hasherBlockSize; i++) {
	                oKeyWords[i] ^= 0x5c5c5c5c;
	                iKeyWords[i] ^= 0x36363636;
	            }
	            oKey.sigBytes = iKey.sigBytes = hasherBlockSizeBytes;

	            // Set initial values
	            this.reset();
	        },

	        /**
	         * Resets this HMAC to its initial state.
	         *
	         * @example
	         *
	         *     hmacHasher.reset();
	         */
	        reset: function () {
	            // Shortcut
	            var hasher = this._hasher;

	            // Reset
	            hasher.reset();
	            hasher.update(this._iKey);
	        },

	        /**
	         * Updates this HMAC with a message.
	         *
	         * @param {WordArray|string} messageUpdate The message to append.
	         *
	         * @return {HMAC} This HMAC instance.
	         *
	         * @example
	         *
	         *     hmacHasher.update('message');
	         *     hmacHasher.update(wordArray);
	         */
	        update: function (messageUpdate) {
	            this._hasher.update(messageUpdate);

	            // Chainable
	            return this;
	        },

	        /**
	         * Finalizes the HMAC computation.
	         * Note that the finalize operation is effectively a destructive, read-once operation.
	         *
	         * @param {WordArray|string} messageUpdate (Optional) A final message update.
	         *
	         * @return {WordArray} The HMAC.
	         *
	         * @example
	         *
	         *     var hmac = hmacHasher.finalize();
	         *     var hmac = hmacHasher.finalize('message');
	         *     var hmac = hmacHasher.finalize(wordArray);
	         */
	        finalize: function (messageUpdate) {
	            // Shortcut
	            var hasher = this._hasher;

	            // Compute HMAC
	            var innerHash = hasher.finalize(messageUpdate);
	            hasher.reset();
	            var hmac = hasher.finalize(this._oKey.clone().concat(innerHash));

	            return hmac;
	        }
	    });
	}());


}));
modules['./hmac']=module.exports;})();
(function(){var module={exports:{}},exports=module.exports;
;(function (root, factory, undef) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory(require("./core"), require("./sha256"), require("./hmac"));
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define(["./core", "./sha256", "./hmac"], factory);
	}
	else {
		// Global (browser)
		factory(root.CryptoJS);
	}
}(this, function (CryptoJS) {

	(function () {
	    // Shortcuts
	    var C = CryptoJS;
	    var C_lib = C.lib;
	    var Base = C_lib.Base;
	    var WordArray = C_lib.WordArray;
	    var C_algo = C.algo;
	    var SHA256 = C_algo.SHA256;
	    var HMAC = C_algo.HMAC;

	    /**
	     * Password-Based Key Derivation Function 2 algorithm.
	     */
	    var PBKDF2 = C_algo.PBKDF2 = Base.extend({
	        /**
	         * Configuration options.
	         *
	         * @property {number} keySize The key size in words to generate. Default: 4 (128 bits)
	         * @property {Hasher} hasher The hasher to use. Default: SHA256
	         * @property {number} iterations The number of iterations to perform. Default: 250000
	         */
	        cfg: Base.extend({
	            keySize: 128/32,
	            hasher: SHA256,
	            iterations: 250000
	        }),

	        /**
	         * Initializes a newly created key derivation function.
	         *
	         * @param {Object} cfg (Optional) The configuration options to use for the derivation.
	         *
	         * @example
	         *
	         *     var kdf = CryptoJS.algo.PBKDF2.create();
	         *     var kdf = CryptoJS.algo.PBKDF2.create({ keySize: 8 });
	         *     var kdf = CryptoJS.algo.PBKDF2.create({ keySize: 8, iterations: 1000 });
	         */
	        init: function (cfg) {
	            this.cfg = this.cfg.extend(cfg);
	        },

	        /**
	         * Computes the Password-Based Key Derivation Function 2.
	         *
	         * @param {WordArray|string} password The password.
	         * @param {WordArray|string} salt A salt.
	         *
	         * @return {WordArray} The derived key.
	         *
	         * @example
	         *
	         *     var key = kdf.compute(password, salt);
	         */
	        compute: function (password, salt) {
	            // Shortcut
	            var cfg = this.cfg;

	            // Init HMAC
	            var hmac = HMAC.create(cfg.hasher, password);

	            // Initial values
	            var derivedKey = WordArray.create();
	            var blockIndex = WordArray.create([0x00000001]);

	            // Shortcuts
	            var derivedKeyWords = derivedKey.words;
	            var blockIndexWords = blockIndex.words;
	            var keySize = cfg.keySize;
	            var iterations = cfg.iterations;

	            // Generate key
	            while (derivedKeyWords.length < keySize) {
	                var block = hmac.update(salt).finalize(blockIndex);
	                hmac.reset();

	                // Shortcuts
	                var blockWords = block.words;
	                var blockWordsLength = blockWords.length;

	                // Iterations
	                var intermediate = block;
	                for (var i = 1; i < iterations; i++) {
	                    intermediate = hmac.finalize(intermediate);
	                    hmac.reset();

	                    // Shortcut
	                    var intermediateWords = intermediate.words;

	                    // XOR intermediate with block
	                    for (var j = 0; j < blockWordsLength; j++) {
	                        blockWords[j] ^= intermediateWords[j];
	                    }
	                }

	                derivedKey.concat(block);
	                blockIndexWords[0]++;
	            }
	            derivedKey.sigBytes = keySize * 4;

	            return derivedKey;
	        }
	    });

	    /**
	     * Computes the Password-Based Key Derivation Function 2.
	     *
	     * @param {WordArray|string} password The password.
	     * @param {WordArray|string} salt A salt.
	     * @param {Object} cfg (Optional) The configuration options to use for this computation.
	     *
	     * @return {WordArray} The derived key.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var key = CryptoJS.PBKDF2(password, salt);
	     *     var key = CryptoJS.PBKDF2(password, salt, { keySize: 8 });
	     *     var key = CryptoJS.PBKDF2(password, salt, { keySize: 8, iterations: 1000 });
	     */
	    C.PBKDF2 = function (password, salt, cfg) {
	        return PBKDF2.create(cfg).compute(password, salt);
	    };
	}());


	return CryptoJS.PBKDF2;

}));
modules['./pbkdf2']=module.exports;})();
return modules['./core'];
}
