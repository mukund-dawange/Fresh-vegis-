export const VERSION = 1;
export const CATEGORIES = ['Vegetables', 'Leafy greens', 'Roots & tubers', 'Herbs', 'Fruits'];
export const UNITS = ['kg', 'pcs', 'bunch'];
export const EMOJIS = ['🥬','🍅','🥔','🧅','🥕','🥦','🥒','🫑','🍆','🌽','🌿','🍋','🧄','🫛','🍄','🎃','🍎','🍌','🥑','🍠'];
export const roundQty = n => Math.round(Number(n) * 1000) / 1000;
export const uid = () => globalThis.crypto.randomUUID();
const fail = message => { throw new Error(message); };
const finite = (value, name, min = 0, max = 1e9) => {
  const n = Number(value);
  if (value === '' || value === null || !Number.isFinite(n) || n < min || n > max) fail(`${name} must be between ${min} and ${max}.`);
  return n;
};
export function quantity(value, unit, allowZero = false) {
  const q = finite(value, 'Quantity', allowZero ? 0 : 0.001, 1e6);
  if (Math.abs(q - roundQty(q)) > 1e-7) fail('Use no more than three decimal places for quantities.');
  if (unit !== 'kg' && !Number.isInteger(q)) fail('Pieces and bunches must have whole-number quantities.');
  return roundQty(q);
}
export function money(value, label = 'Amount') {
  const n = finite(value, label, 0, 1e7);
  return Math.round(n * 100);
}
export function dayKey(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function requireAdmin(user) { if (user?.role !== 'admin') fail('Management access is required.'); }
function authorized(user) { if (!user || !['admin', 'sales'].includes(user.role)) fail('Please sign in again.'); }
function productById(state, id, includeArchived = false) {
  const p = state.products.find(p => p.id === id && (includeArchived || p.active));
  if (!p) fail('This product is no longer available.');
  return p;
}
function ledger(state, p, delta, type, note, user, reference = '', at = new Date().toISOString()) {
  p.stock = roundQty(p.stock + delta);
  state.movements.push({id:uid(), productId:p.id, productName:p.name, unit:p.unit, delta:roundQty(delta), balance:p.stock, type, note, actor:user.name, reference, at});
}
export function saveProduct(state, input, user) {
  requireAdmin(user);
  const name = String(input.name || '').trim();
  const sku = String(input.sku || '').trim().toUpperCase();
  if (name.length < 2 || name.length > 80) fail('Product name must be 2–80 characters.');
  if (!/^[A-Z0-9_-]{2,30}$/.test(sku)) fail('SKU must be 2–30 letters, numbers, hyphens or underscores.');
  if (state.products.some(p => p.sku === sku && p.id !== input.id)) fail('That SKU is already in use, including archived products.');
  if (!CATEGORIES.includes(input.category) || !UNITS.includes(input.unit)) fail('Choose a valid category and unit.');
  if (input.emoji && !EMOJIS.includes(input.emoji)) fail('Choose a valid product icon.');
  const cost = money(input.cost, 'Cost price'), price = money(input.price, 'Selling price');
  if (price <= 0) fail('Selling price must be greater than zero.');
  const minStock = quantity(input.minStock, input.unit, true);
  let p;
  if (input.id) {
    p = productById(state, input.id, true);
    if (p.unit !== input.unit && state.movements.some(m => m.productId === p.id)) fail('The unit cannot change after stock is recorded. Create a new product for a different unit.');
    Object.assign(p, {name, sku, category:input.category, unit:input.unit, cost, price, minStock, supplier:String(input.supplier || '').trim().slice(0,100), emoji:input.emoji || p.emoji});
  } else {
    p = {id:uid(), name, sku, category:input.category, unit:input.unit, cost, price, minStock, supplier:String(input.supplier || '').trim().slice(0,100), emoji:input.emoji || '🥬', stock:0, active:true};
    const stock = quantity(input.stock ?? 0, p.unit, true);
    state.products.push(p);
    if (stock) ledger(state,p,stock,'opening','Opening stock',user);
  }
  return p.id;
}
export function archiveProduct(state, id, user) {
  requireAdmin(user);
  const p = productById(state,id,true);
  p.active = !p.active;
}
export function adjustStock(state, input, user) {
  requireAdmin(user);
  const p = productById(state, input.productId);
  if (!['receive','waste','adjust'].includes(input.type)) fail('Choose a stock movement type.');
  const note = String(input.note || '').trim();
  if (note.length < 3 || note.length > 250) fail('Add a stock note of 3–250 characters.');
  const q = quantity(input.quantity,p.unit,input.type === 'adjust');
  const delta = input.type === 'adjust' ? roundQty(q - p.stock) : input.type === 'waste' ? -q : q;
  if (!delta) fail('The stock count is already correct.');
  if (roundQty(p.stock + delta) < 0) fail('There is not enough stock for this adjustment.');
  if (input.type === 'receive' && input.purchaseCost !== '' && input.purchaseCost != null) {
    const purchaseCost = money(input.purchaseCost, 'Purchase cost');
    p.cost = Math.round((p.stock * p.cost + q * purchaseCost) / (p.stock + q));
  }
  ledger(state,p,delta,input.type,note,user);
}
export function calculateCart(state, items, discount = 0) {
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
export function checkout(state, input, user) {
  authorized(user);
  if (input.token && state.sales.some(s=>s.token === input.token)) fail('This order has already been completed.');
  const calculated = calculateCart(state,input.items,input.discount || 0);
  if(input.expectedTotal != null && calculated.total !== input.expectedTotal) fail('Prices have changed. Close this window and review the updated basket before paying.');
  if (!['Cash','UPI','Card'].includes(input.payment)) fail('Choose a payment method.');
  const received = input.payment === 'Cash' ? money(input.received,'Cash received') : calculated.total;
  if (received < calculated.total) fail('Cash received is less than the order total.');
  const at = input.at || new Date().toISOString();
  const sale = {id:uid(),number:`FL-${String(state.nextSale++).padStart(5,'0')}`,token:input.token || uid(),at,actor:user.name,customer:String(input.customer || '').trim().slice(0,80) || 'Walk-in customer',payment:input.payment,received,change:received-calculated.total,status:'completed',...calculated};
  for (const line of sale.lines) ledger(state,productById(state,line.productId),-line.quantity,'sale','Sale',user,sale.number,at);
  state.sales.push(sale);
  return sale.id;
}
export function voidSale(state,id,reason,user) {
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
export function stats(sales) {
  const completed=sales.filter(s=>s.status==='completed');
  return {revenue:completed.reduce((a,s)=>a+s.total,0),profit:completed.reduce((a,s)=>a+s.total-s.cost,0),orders:completed.length,average:completed.length ? Math.round(completed.reduce((a,s)=>a+s.total,0)/completed.length) : 0};
}
export function createInitialState(now = new Date()) {
  const state = {schemaVersion:VERSION,revision:0,demo:true,createdAt:now.toISOString(),nextSale:1,settings:{shopName:'Freshleaf',subtitle:'Your neighbourhood vegetable shop',address:'',phone:'',currency:'INR',receiptFooter:'Fresh picks. Happy meals. See you again!'},users:[{id:'admin',name:'Alex Morgan',email:'admin@freshleaf.local',role:'admin'},{id:'sales',name:'Sam Taylor',email:'sales@freshleaf.local',role:'sales'}],products:[],sales:[],movements:[]};
  const data = [
    ['Tomatoes','Vegetables','kg',24,40,90,15,'🍅'],['Potatoes','Roots & tubers','kg',18,30,110,20,'🥔'],['Red onions','Roots & tubers','kg',25,45,85,15,'🧅'],['Carrots','Roots & tubers','kg',32,60,65,12,'🥕'],['Broccoli','Vegetables','kg',65,100,45,10,'🥦'],['Spinach','Leafy greens','bunch',12,25,75,15,'🥬'],['Cucumber','Vegetables','kg',20,40,65,10,'🥒'],['Bell peppers','Vegetables','kg',55,90,55,10,'🫑'],['Aubergine','Vegetables','kg',25,45,55,10,'🍆'],['Sweet corn','Vegetables','pcs',15,30,100,15,'🌽'],['Coriander','Herbs','bunch',5,15,100,15,'🌿'],['Lemons','Fruits','pcs',3,8,150,20,'🍋']
  ];
  data.forEach((row,i)=>saveProduct(state,{name:row[0],sku:`VEG-${String(i+1).padStart(3,'0')}`,category:row[1],unit:row[2],cost:row[3],price:row[4],stock:row[5],minStock:row[6],emoji:row[7],supplier:i%2?'Green Valley Farms':'Morning Market'},state.users[0]));
  const start = new Date(now);start.setDate(start.getDate()-13);start.setHours(7,0,0,0);
  state.movements.forEach(m=>m.at=start.toISOString());
  let seed=42; const rand=()=>{seed=(seed*16807)%2147483647;return (seed-1)/2147483646;};
  for(let day=0;day<14;day++) {
    const count=6+Math.floor(rand()*8)+(day===13?3:0);
    for(let j=0;j<count;j++) {
      const candidates=[...state.products].sort(()=>0); const picks=[];
      for(let k=0;k<2+Math.floor(rand()*4);k++) {
        const p=candidates.splice(Math.floor(rand()*candidates.length),1)[0];
        const q=p.unit==='kg'? (1+Math.floor(rand()*6))/4:1+Math.floor(rand()*3);
        if(p.stock < q+2) ledger(state,p,p.unit==='kg'?40:50,'receive','Sample delivery',state.users[0],'',new Date(start.getTime()+day*864e5).toISOString());
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
export function validateState(s) {
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
  return s;
}
