import {saveProduct,adjustStock,recordPurchase,archiveProduct,checkout,voidSale,eraseShopData,requireAdmin,validateState} from './store.js';

// These same commands run in Apps Script, against the latest locked Drive record.
export function applyShopAction(state,user,action,payload={}) {
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
