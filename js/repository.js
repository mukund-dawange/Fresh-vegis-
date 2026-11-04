import {createInitialState, validateState} from './store.js';

export const STORAGE_KEY = 'freshleaf.workspace.v1';
const SESSION_KEY = 'freshleaf.session.v1';
const hex = buffer => [...new Uint8Array(buffer)].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function hashPassword(password,salt) {
  const bytes = new Uint8Array(salt.match(/.{2}/g).map(v=>parseInt(v,16)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes,iterations:120000,hash:'SHA-256'},key,256));
}
export async function setPassword(user,password) {
  if(password.length<6) throw new Error('Use a password with at least 6 characters.');
  user.salt=hex(crypto.getRandomValues(new Uint8Array(16)));
  user.passwordHash=await hashPassword(password,user.salt);
}
export class Repository {
  constructor(storage=localStorage) {this.storage=storage;this.state=null;}
  async lock(callback) {
    if(!navigator.locks) throw new Error('This app requires a current browser on localhost or HTTPS. Open the GitHub Pages HTTPS URL.');
    return navigator.locks.request('freshleaf-write',callback);
  }
  read() {
    const raw=this.storage.getItem(STORAGE_KEY);
    if(!raw) throw new Error('Shop data is missing. Reload this page to initialise the workspace.');
    try {return JSON.parse(raw);} catch {throw new Error('Stored shop data could not be read. Restore a valid backup.');}
  }
  persist(state) {
    try {this.storage.setItem(STORAGE_KEY,JSON.stringify(state));}
    catch {throw new Error('Could not save. Browser storage may be full or disabled. Export a backup before clearing any data. No changes were applied.');}
    this.state=state;
  }
  async init() {
    if(!crypto.subtle) throw new Error('Open Freshleaf using localhost or an HTTPS website so local login can work.');
    await this.lock(async()=>{
      if(!this.storage.getItem(STORAGE_KEY)) {
        const state=createInitialState();
        await setPassword(state.users[0],'admin123');await setPassword(state.users[1],'sales123');
        this.persist(state);
      } else this.state=validateState(this.read());
    });
  }
  async transaction(mutator) {
    return this.lock(async()=>{
      const latest=this.read();
      const session=this.session();
      const user=latest.users.find(u=>u.id===session?.id && u.passwordHash===session?.fingerprint);
      if(!user) throw new Error('Your session has ended. Please sign in again.');
      const result=await mutator(latest,user);
      latest.revision++;
      this.persist(latest);
      return result;
    });
  }
  session(){try {return JSON.parse(sessionStorage.getItem(SESSION_KEY));} catch {return null;}}
  getUser(){const session=this.session();return this.state.users.find(u=>u.id===session?.id && u.passwordHash===session?.fingerprint) || null;}
  async login(email,password) {
    this.state=this.read();
    const user=this.state.users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase());
    if(!user || (await hashPassword(password,user.salt))!==user.passwordHash) throw new Error('Email or password is incorrect.');
    sessionStorage.setItem(SESSION_KEY,JSON.stringify({id:user.id,fingerprint:user.passwordHash}));
    return user;
  }
  refreshSession(user){sessionStorage.setItem(SESSION_KEY,JSON.stringify({id:user.id,fingerprint:user.passwordHash}));}
  logout(){sessionStorage.removeItem(SESSION_KEY);}
}
