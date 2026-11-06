import {hashPassword,setPassword} from './repository.js';
import {validateState,uid} from './store.js';

export async function passwordProof(key,message){
  const bytes=Uint8Array.from(key.match(/.{2}/g),value=>parseInt(value,16));
  const cryptoKey=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,new TextEncoder().encode(message)))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export class CloudRepository {
  constructor(url,{storage=localStorage,sessions=sessionStorage,transport=fetch}={}){
    this.validURL=/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url);
    this.url=url;this.storage=storage;this.sessions=sessions;this.transport=transport;this.cloud=true;this.pending=new Map();this.syncing=false;this.status='Connecting to shared shop…';
    this.cacheKey='freshleaf.cloud.cache.v1:'+url;this.sessionKey='freshleaf.cloud.session.v1:'+url;
    try{this.pending=new Map(JSON.parse(this.sessions.getItem(this.sessionKey+':pending')||'[]'));}catch{}
    this.state={settings:{shopName:'Freshleaf',currency:'INR'},users:[],products:[],sales:[],movements:[],purchases:[]};
  }
  session(){try{return JSON.parse(this.sessions.getItem(this.sessionKey));}catch{return null;}}
  getUser(){const session=this.session();return session&&session.expiresAt>Date.now()?this.state.users.find(user=>user.id===session.id)||null:null;}
  read(){return structuredClone(this.state);}
  logout(){this.sessions.removeItem(this.sessionKey);this.sessions.removeItem(this.sessionKey+':pending');this.pending.clear();}
  persistPending(){try{this.sessions.setItem(this.sessionKey+':pending',JSON.stringify([...this.pending]));}catch{}}
  notify(){if(typeof window!=='undefined')window.dispatchEvent(new Event('freshleaf-cloud-status'));}
  async call(action,payload={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await this.transport(this.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},redirect:'follow',credentials:'omit',body:JSON.stringify({action,...payload}),signal:controller.signal});
      const data=await response.json();
      if(!data.ok){const error=new Error(data.error||'The shared shop could not save this change.');error.definitive=true;error.code=data.code;if(data.code==='AUTH')this.logout();throw error;}
      this.status='Shared shop connected';this.notify();return data;
    }catch(error){
      if(error.definitive)throw error;
      this.status='Connection interrupted · reconnect before saving';this.notify();
      throw new Error('Could not confirm the shared shop response. Check your connection and try the same action again. It will not be saved twice.');
    }finally{clearTimeout(timer);}
  }
  accept(data){
    if(data.state){this.state=validateState(data.state);this.epoch=data.epoch;try{this.storage.setItem(this.cacheKey,JSON.stringify({state:this.state,epoch:this.epoch}));}catch{/* Server save remains authoritative if this device cache is full. */}}
  }
  async init(){
    if(!this.validURL)throw new Error('Use the deployed Apps Script URL ending in /exec in js/cloud-config.js.');
    try{const cached=JSON.parse(this.storage.getItem(this.cacheKey));if(cached)this.accept(cached);}catch{}
    if(this.getUser()){try{await this.refresh();}catch{/* A rejected session returns to sign-in; an offline device keeps its last snapshot. */}return;}
    try{const info=await this.call('info');this.state.settings.shopName=info.shopName;}catch{this.status='Connect to the internet to sign in';}
  }
  async login(email,password){
    const challenge=await this.call('challenge',{email});
    const key=await hashPassword(password,challenge.salt);
    const result=await this.call('login',{email,nonce:challenge.nonce,proof:await passwordProof(key,challenge.nonce)});
    this.sessions.setItem(this.sessionKey,JSON.stringify({token:result.token,id:result.user.id,expiresAt:result.expiresAt}));this.accept(result);return this.getUser();
  }
  async refresh(){
    if(this.syncing||!this.session())return false;this.syncing=true;
    try{const before=this.state.revision,epoch=this.epoch;const data=await this.call('read',{token:this.session().token,revision:before,epoch});if(this.state.revision===before&&this.epoch===epoch)this.accept(data);return before!==this.state.revision||epoch!==this.epoch;}finally{this.syncing=false;}
  }
  async perform(action,payload={}){
    if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('You are offline. Reconnect before saving shared stock or sales.');
    const session=this.session();if(!session)throw new Error('Please sign in again.');
    const key=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([action,payload]))))].map(n=>n.toString(16).padStart(2,'0')).join('');let attempt=this.pending.get(key);
    if(!attempt){attempt={requestId:uid(),epoch:this.epoch};this.pending.set(key,attempt);this.persistPending();}
    try{
      const response=await this.call('command',{token:session.token,command:action,payload,...attempt});
      this.accept(response);this.pending.delete(key);this.persistPending();return response.result;
    }catch(error){if(error.definitive){this.pending.delete(key);this.persistPending();}throw error;}
  }
  async backup(){const response=await this.call('backup',{token:this.session()?.token});return validateState(response.state);}
  async updateAccount(values){
    const challenge=await this.call('accountChallenge',{token:this.session()?.token});
    const key=await hashPassword(values.current,challenge.salt);
    const data={name:values.name,currentProof:await passwordProof(key,this.session().token+':account')};
    if(values.password){const next={};await setPassword(next,values.password);data.salt=next.salt;data.passwordHash=next.passwordHash;}
    await this.perform('account',data);
  }
}
