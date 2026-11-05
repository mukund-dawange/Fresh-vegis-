import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialState,saveProduct,adjustStock,checkout,voidSale,archiveProduct,calculateCart,stats,validateState,quantity,recordPurchase,recoveryStats,calculateWeightPrice,upgradeState,validateProductImage} from '../js/store.js';
import {Repository,STORAGE_KEY,setPassword} from '../js/repository.js';

function fixture(){const s=createInitialState();s.products=[];s.movements=[];s.sales=[];s.purchases=[];s.recovery={startedAt:new Date().toISOString(),excludedSaleIds:[],nextOrder:1};s.nextSale=1;s.demo=false;for(const u of s.users){u.salt='00'.repeat(16);u.passwordHash='aa'.repeat(32);}saveProduct(s,{name:'Tomatoes',sku:'TOM-01',category:'Vegetables',unit:'kg',cost:20,price:40,stock:10,minStock:2,emoji:'🍅'},s.users[0]);return s;}
const order=(s,overrides={})=>({items:[{productId:s.products[0].id,quantity:1.25}],payment:'Cash',received:100,discount:5,...overrides});

test('fractional checkout records exact money, stock, margin and change',()=>{const s=fixture();checkout(s,order(s),s.users[1]);const sale=s.sales[0];assert.equal(s.products[0].stock,8.75);assert.equal(sale.subtotal,5000);assert.equal(sale.total,4500);assert.equal(sale.cost,2500);assert.equal(sale.change,5500);assert.equal(s.movements.at(-1).balance,8.75);assert.equal(stats(s.sales).profit,2000);validateState(s);});
test('overselling, fractional pieces, negative prices and excessive discount are rejected',()=>{const s=fixture();assert.throws(()=>checkout(s,order(s,{items:[{productId:s.products[0].id,quantity:11}]}),s.users[1]),/Only 10/);assert.throws(()=>quantity(.5,'pcs'),/whole-number/);assert.throws(()=>quantity(.0001,'kg'),/Quantity/);assert.throws(()=>calculateCart(s,order(s).items,500),/exceed/);assert.throws(()=>saveProduct(s,{...s.products[0],cost:-1,price:40},s.users[0]),/Cost price/);assert.equal(s.sales.length,0);assert.equal(s.products[0].stock,10);});
test('duplicate items and checkout tokens cannot deduct stock twice',()=>{const s=fixture(),o=order(s,{token:'test-token'});checkout(s,o,s.users[1]);assert.throws(()=>checkout(s,o,s.users[1]),/already been completed/);assert.throws(()=>calculateCart(s,[...o.items,...o.items]),/duplicated/);assert.equal(s.products[0].stock,8.75);});
test('insufficient cash and stale price confirmation fail before any write',()=>{const s=fixture();assert.throws(()=>checkout(s,order(s,{received:1}),s.users[1]),/less than/);assert.throws(()=>checkout(s,order(s,{expectedTotal:100}),s.users[1]),/Prices have changed/);assert.equal(s.sales.length,0);assert.equal(s.nextSale,1);assert.equal(s.products[0].stock,10);});
test('weighted average cost affects future sales without rewriting prior margins',()=>{const s=fixture();checkout(s,order(s,{items:[{productId:s.products[0].id,quantity:2}],discount:0}),s.users[1]);adjustStock(s,{productId:s.products[0].id,type:'receive',quantity:8,purchaseCost:30,note:'Farm delivery'},s.users[0]);assert.equal(s.products[0].cost,2500);assert.equal(s.products[0].stock,16);assert.equal(s.sales[0].cost,4000);validateState(s);});
test('wastage and stock counts maintain ledger balances',()=>{const s=fixture(),p=s.products[0];adjustStock(s,{productId:p.id,type:'waste',quantity:2,note:'Spoiled produce'},s.users[0]);adjustStock(s,{productId:p.id,type:'adjust',quantity:3.5,note:'Closing count'},s.users[0]);assert.equal(p.stock,3.5);assert.equal(s.movements.at(-1).delta,-4.5);assert.throws(()=>adjustStock(s,{productId:p.id,type:'waste',quantity:4,note:'Spoiled produce'},s.users[0]),/not enough/);validateState(s);});
test('sale void restores archived stock once and removes revenue',()=>{const s=fixture();const id=checkout(s,order(s),s.users[1]);archiveProduct(s,s.products[0].id,s.users[0]);assert.throws(()=>calculateCart(s,order(s).items),/no longer available/);voidSale(s,id,'Cancelled before pickup',s.users[0]);assert.equal(s.products[0].stock,10);assert.equal(s.products[0].active,false);assert.equal(stats(s.sales).revenue,0);assert.throws(()=>voidSale(s,id,'Twice',s.users[0]),/cannot be voided/);validateState(s);});
test('void after a new delivery restores the original cost into the weighted average',()=>{const s=fixture(),p=s.products[0];const id=checkout(s,order(s,{items:[{productId:p.id,quantity:10}],discount:0,received:400}),s.users[1]);adjustStock(s,{productId:p.id,type:'receive',quantity:10,purchaseCost:40,note:'New delivery'},s.users[0]);voidSale(s,id,'Customer returned all goods',s.users[0]);assert.equal(p.cost,3000);assert.equal(p.stock,20);validateState(s);});
test('sales role cannot change products, stock or receipts',()=>{const s=fixture();assert.throws(()=>archiveProduct(s,s.products[0].id,s.users[1]),/Management/);assert.throws(()=>saveProduct(s,{},s.users[1]),/Management/);assert.throws(()=>adjustStock(s,{},s.users[1]),/Management/);assert.throws(()=>voidSale(s,'a','test',s.users[1]),/Management/);});
test('SKU uniqueness includes archived products; historical units are fixed',()=>{const s=fixture(),p=s.products[0];assert.throws(()=>saveProduct(s,{...p,unit:'pcs',price:40,cost:20},s.users[0]),/unit cannot change/);archiveProduct(s,p.id,s.users[0]);assert.throws(()=>saveProduct(s,{...p,id:undefined,cost:20,price:40},s.users[0]),/SKU is already/);});
test('validated backup detects tampered stock, totals, markup IDs and account records',()=>{const good=fixture();checkout(good,order(good),good.users[1]);for(const change of [s=>s.products[0].stock=999,s=>s.sales[0].total=1,s=>s.products[0].id='bad" onclick="x',s=>s.products[0].emoji='<script>',s=>s.users=[]]){const bad=structuredClone(good);change(bad);assert.throws(()=>validateState(bad));}validateState(JSON.parse(JSON.stringify(good)));});
test('seeded demo has a reconciled stock ledger and meaningful reports',()=>{const s=createInitialState();for(const u of s.users){u.salt='00'.repeat(16);u.passwordHash='aa'.repeat(32);}validateState(s);assert.equal(s.products.length,12);assert.ok(s.sales.length>80);assert.ok(stats(s.sales).revenue>0);assert.ok(s.products.some(p=>p.stock===0));});

class MemoryStorage{data=new Map();fail=false;getItem(k){return this.data.get(k)||null;}setItem(k,v){if(this.fail)throw new Error('QuotaExceededError');this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const session=new MemoryStorage();Object.defineProperty(globalThis,'sessionStorage',{value:session,configurable:true});
let queue=Promise.resolve();Object.defineProperty(globalThis,'navigator',{value:{locks:{request:(_,fn)=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;}}},configurable:true});

test('repository rejects a failed save without changing its live state',async()=>{const storage=new MemoryStorage(),r=new Repository(storage);await r.init();await r.login('admin@freshleaf.local','admin123');const before=JSON.stringify(r.state);storage.fail=true;await assert.rejects(r.transaction(s=>{s.products[0].stock=999;}),/Could not save/);assert.equal(JSON.stringify(r.state),before);assert.equal(storage.getItem(STORAGE_KEY),before);});
test('two tab checkouts serialize and cannot sell the final stock twice',async()=>{const storage=new MemoryStorage(),a=new Repository(storage),b=new Repository(storage);await a.init();await a.login('admin@freshleaf.local','admin123');const base=fixture();base.users=a.state.users;base.products[0].stock=1;base.movements[0].delta=1;base.movements[0].balance=1;base.purchases[0].quantity=1;a.persist(base);b.state=JSON.parse(storage.getItem(STORAGE_KEY));const o=order(base,{items:[{productId:base.products[0].id,quantity:1}],discount:0,payment:'UPI'});const results=await Promise.allSettled([a.transaction((s,u)=>checkout(s,o,u)),b.transaction((s,u)=>checkout(s,o,u))]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const saved=JSON.parse(storage.getItem(STORAGE_KEY));assert.equal(saved.sales.length,1);assert.equal(saved.products[0].stock,0);validateState(saved);});

test('smart calculator converts grams and kilograms with the same checkout rounding',()=>{
  assert.deepEqual(calculateWeightPrice(40,750,'g'),{quantity:.75,price:4000,total:3000});
  assert.deepEqual(calculateWeightPrice(18,.125,'kg'),{quantity:.125,price:1800,total:225});
  assert.equal(calculateWeightPrice(33.33,250,'g').total,833);
  for(const args of [[40,0,'g'],[40,1.5,'g'],[40,-1,'kg'],[40,.0001,'kg'],[0,1,'kg'],[40,1,'lb']])assert.throws(()=>calculateWeightPrice(...args));
});
test('product photos survive edits and backups and can be explicitly removed',()=>{
  const s=fixture(),p=s.products[0];const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB8sAAAAASUVORK5CYII=';
  saveProduct(s,{...p,cost:20,price:40,image},s.users[0]);assert.equal(p.image,image);
  saveProduct(s,{id:p.id,name:p.name,sku:p.sku,category:p.category,unit:p.unit,cost:21,price:45,minStock:2},s.users[0]);assert.equal(p.image,image);assert.equal(s.purchases.length,1);
  assert.equal(validateState(JSON.parse(JSON.stringify(s))).products[0].image,image);
  saveProduct(s,{...p,cost:21,price:45,image:''},s.users[0]);assert.equal(p.image,'');
  for(const image of ['https://example.com/photo.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,dGVzdA==','data:image/png;base64,'+'A'.repeat(120000)])assert.throws(()=>validateProductImage(image));
});
test('opening goods value determines unit cost and creates exactly one investment',()=>{
  const s=fixture();const id=saveProduct(s,{name:'Carrots',sku:'CAR-01',category:'Vegetables',unit:'kg',cost:1,price:80,stock:7.5,purchaseValue:300,minStock:1},s.users[0]);
  const p=s.products.find(p=>p.id===id);assert.equal(p.cost,4000);assert.equal(s.purchases.at(-1).amount,30000);assert.equal(s.purchases.at(-1).quantity,7.5);validateState(s);
});
test('delivery total is recorded exactly and determines weighted average cost',()=>{
  const s=fixture(),p=s.products[0];adjustStock(s,{productId:p.id,type:'receive',quantity:2.5,purchaseValue:100,purchaseCost:999,note:'Actual delivery invoice'},s.users[0]);
  assert.equal(p.cost,2400);assert.equal(p.stock,12.5);assert.equal(s.purchases.at(-1).amount,10000);assert.equal(recoveryStats(s).remaining,30000);validateState(s);
});
test('rolling recovery handles 2–3 day restocks without spending old surplus twice',()=>{
  const s=fixture(),p=s.products[0];
  checkout(s,order(s,{items:[{productId:p.id,quantity:6}],payment:'UPI',discount:0}),s.users[1]);
  let r=recoveryStats(s);assert.equal(r.remaining,0);assert.equal(r.surplus,4000);assert.equal(p.stock,4);
  adjustStock(s,{productId:p.id,type:'receive',quantity:10,purchaseValue:300,note:'Next delivery two days later'},s.users[0]);
  r=recoveryStats(s);assert.equal(r.remaining,30000);assert.equal(r.surplus,4000);
  checkout(s,order(s,{items:[{productId:p.id,quantity:5}],payment:'Card',discount:0}),s.users[1]);
  r=recoveryStats(s);assert.equal(r.remaining,10000);assert.equal(r.recovered,40000);assert.equal(r.invested,50000);assert.equal(r.surplus,4000);assert.equal(p.stock,9);validateState(s);
});
test('sales settle the oldest unpaid purchase first across different products',()=>{
  const s=fixture(),first=s.purchases[0];recordPurchase(s,{productId:s.products[0].id,amount:100,note:'Additional goods value'},s.users[0]);const second=s.purchases[1];
  checkout(s,order(s,{items:[{productId:s.products[0].id,quantity:6}],payment:'UPI',discount:10}),s.users[1]);
  const r=recoveryStats(s);assert.equal(r.byPurchase[first.id].remaining,0);assert.equal(r.byPurchase[second.id].recovered,3000);assert.equal(r.byPurchase[second.id].remaining,7000);assert.equal(r.surplus,0);
});
test('voids reallocate recovery and wastage/archive never erase money owed',()=>{
  const s=fixture(),p=s.products[0];const sale=checkout(s,order(s,{items:[{productId:p.id,quantity:6}],payment:'UPI',discount:0}),s.users[1]);
  adjustStock(s,{productId:p.id,type:'receive',quantity:10,purchaseValue:300,note:'Restock delivery'},s.users[0]);
  checkout(s,order(s,{items:[{productId:p.id,quantity:5}],payment:'UPI',discount:0}),s.users[1]);
  voidSale(s,sale,'Goods returned',s.users[0]);assert.equal(recoveryStats(s).remaining,30000);assert.equal(recoveryStats(s).surplus,0);
  adjustStock(s,{productId:p.id,type:'waste',quantity:1,note:'Spoiled goods'},s.users[0]);archiveProduct(s,p.id,s.users[0]);assert.equal(recoveryStats(s).remaining,30000);validateState(s);
});
test('value-only entries do not double stock and require management access',()=>{
  const s=fixture(),p=s.products[0],before=s.movements.length;recordPurchase(s,{productId:p.id,amount:150,note:'Unrecorded invoice value'},s.users[0]);assert.equal(p.stock,10);assert.equal(p.cost,2000);assert.equal(s.movements.length,before);assert.equal(recoveryStats(s).remaining,35000);
  assert.throws(()=>recordPurchase(s,{productId:p.id,amount:20,note:'Forbidden'},s.users[1]),/Management/);assert.throws(()=>recordPurchase(s,{productId:p.id,amount:-1,note:'Negative'},s.users[0]),/Purchased goods/);validateState(s);
});
test('v1 migration preserves original records and excludes pre-feature sales',()=>{
  const old=fixture();checkout(old,order(old,{payment:'UPI',discount:0}),old.users[1]);old.schemaVersion=1;delete old.purchases;delete old.recovery;old.products.forEach(p=>delete p.image);old.sales.forEach(s=>delete s.recoveryOrder);
  const original=JSON.stringify(old),migrated=validateState(upgradeState(old));assert.equal(JSON.stringify(old),original);assert.deepEqual(migrated.sales,old.sales);assert.equal(migrated.products[0].stock,8.75);assert.equal(recoveryStats(migrated).revenue,0);
  recordPurchase(migrated,{productId:migrated.products[0].id,amount:100,note:'Outstanding opening investment'},migrated.users[0]);
  checkout(migrated,order(migrated,{items:[{productId:migrated.products[0].id,quantity:1}],payment:'UPI',discount:0}),migrated.users[1]);assert.equal(recoveryStats(migrated).remaining,6000);validateState(migrated);
});
test('backups reject invalid purchase links, duplicate order and negative investment',()=>{
  const good=fixture();checkout(good,order(good),good.users[1]);for(const change of [s=>s.purchases[0].amount=-1,s=>s.purchases[0].movementId='missing',s=>s.purchases[0].quantity=5,s=>s.sales[0].recoveryOrder=s.purchases[0].recoveryOrder,s=>s.recovery.nextOrder=1]){const bad=structuredClone(good);change(bad);assert.throws(()=>validateState(bad));}
  const copy=validateState(JSON.parse(JSON.stringify(good)));assert.deepEqual(recoveryStats(copy),recoveryStats(good));
});
test('repository persists migration once without resetting logins or stock',async()=>{
  const storage=new MemoryStorage(),r=new Repository(storage);await r.init();await r.login('admin@freshleaf.local','admin123');const old=structuredClone(r.state);old.schemaVersion=1;delete old.purchases;delete old.recovery;old.products.forEach(p=>delete p.image);old.sales.forEach(s=>delete s.recoveryOrder);storage.setItem(STORAGE_KEY,JSON.stringify(old));const upgraded=new Repository(storage);await upgraded.init();assert.equal(upgraded.getUser().role,'admin');assert.equal(upgraded.state.sales.length,old.sales.length);assert.equal(upgraded.state.products[0].stock,old.products[0].stock);assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion,2);const raw=storage.getItem(STORAGE_KEY);await upgraded.init();assert.equal(storage.getItem(STORAGE_KEY),raw);
});
test('password change invalidates old sessions and login verifies hashes',async()=>{const storage=new MemoryStorage(),r=new Repository(storage);await r.init();await assert.rejects(r.login('admin@freshleaf.local','wrong'),/incorrect/);await r.login('admin@freshleaf.local','admin123');await r.transaction(async(s,u)=>setPassword(u,'changed-pass'));assert.equal(r.getUser(),null);await assert.rejects(r.transaction(()=>{}),/session has ended/);await r.login('admin@freshleaf.local','changed-pass');assert.equal(r.getUser().role,'admin');});
