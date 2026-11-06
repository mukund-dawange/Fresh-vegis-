let promptEvent=null;
let registration=null;
let status='Preparing offline access…';
export const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function changed(){window.dispatchEvent(new Event('freshleaf-app-status'));}
export function appStatus(){return {installed:isStandalone(),canInstall:!!promptEvent,status,updateReady:!!registration?.waiting};}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;changed();});
window.addEventListener('appinstalled',()=>{promptEvent=null;changed();});
export async function installApp(){
  if(!promptEvent)return false;
  const event=promptEvent;promptEvent=null;
  await event.prompt();await event.userChoice;changed();return true;
}
export async function registerApp(){
  if(!('serviceWorker' in navigator)||!isSecureContext){status='Use the HTTPS shop address to enable offline access.';changed();return;}
  try{
    registration=await navigator.serviceWorker.register(new URL('../sw.js',import.meta.url),{scope:new URL('../',import.meta.url).pathname,updateViaCache:'none'});
    const refresh=()=>{status=registration.active?'Ready for offline use on this device.':'Preparing offline access…';changed();};
    registration.addEventListener('updatefound',()=>{registration.installing?.addEventListener('statechange',refresh);});
    refresh();
    navigator.serviceWorker.ready.then(()=>{status='Ready for offline use on this device.';changed();});
  }catch{status='Offline setup could not finish. Reopen the shop while online to retry.';changed();}
}
