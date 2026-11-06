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
