import {browserLogin} from "./browser-login.js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const client = "app_EMoamEEZ73f0CkXaXp7hrann";
const auth = "https://auth.openai.com";
export async function account(signal,request=fetch) {
  const dir = join(homedir(), ".tau-codex-subscription");
  await mkdir(dir,{recursive:true,mode:0o700});
  const file = join(dir,"account.json");
  let state;
  try { state = JSON.parse(await readFile(file,"utf8")); }
  catch(e) { if(e.code !== "ENOENT") throw e; state = {key:randomBytes(32).toString("hex")}; }
  if (!/^[a-f0-9]{64}$/.test(state.key)) throw Error("本机密钥文件损坏");
  async function save(next) {
    const tmp = file + "." + randomUUID();
    await writeFile(tmp, JSON.stringify(next), {mode:0o600});
    await rename(tmp,file);
    state=next;
  }
  await save(state);
  let pending, refreshing, browser;
  async function exchange(params) {
    const res = await request(auth+"/oauth/token", {method:"POST",body:new URLSearchParams({...params,client_id:client}),signal});
    if(!res.ok) {
      const reason=(await res.json().catch(()=>null))?.error?.code;
      throw Error("令牌交换 HTTP "+res.status+(typeof reason==="string" && /^[a-z0-9_-]{1,80}$/i.test(reason)?" ("+reason+")":""));
    }
    const t=await res.json();
    if(!t.access_token || !t.refresh_token || !Number(t.expires_in)) throw Error("授权响应不完整");
    await save({key:state.key,access:t.access_token,refresh:t.refresh_token,expires:Date.now()+1000*t.expires_in});
  }
  async function device(path,body) {
    return request(auth+"/api/accounts/deviceauth/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal});
  }
  return {
    key:state.key, status:()=>browser?.status() ?? (state.refresh?"已登录":"尚未登录"),
    async browserLogin() {
      browser?.close();
      browser = null;
      pending = null;
      browser = await browserLogin(client,signal,exchange);
      return browser.url;
    },
    async login() {
      browser?.close();
      browser = null;
      const res=await device("usercode",{client_id:client});
      if(!res.ok) throw Error("获取设备码失败 HTTP "+res.status+"，可选择「浏览器登录」");
      const data=await res.json();
      if(!data.user_code || !data.device_auth_id) throw Error("设备码响应不完整");
      pending={id:data.device_auth_id,code:data.user_code,after:Date.now()+1000*Math.max(5,Number(data.interval)||5),until:Date.now()+900000};
      return data.user_code;
    },
    async confirm() {
      if(browser){
        if(browser.status()!=="已登录") throw Error(browser.status());
        browser.close();
        browser=null;
        return;
      }
      if(!pending || Date.now()>pending.until) throw Error("请重新获取设备码");
      if(Date.now()<pending.after) throw Error("请稍候几秒，再确认登录");
      pending.after=Date.now()+5000;
      const res=await device("token",{device_auth_id:pending.id,user_code:pending.code});
      if([403,404].includes(res.status)) throw Error("等待浏览器授权，请稍后确认");
      if(!res.ok) throw Error("确认设备授权失败 HTTP "+res.status);
      const d=await res.json();
      await exchange({grant_type:"authorization_code",code:d.authorization_code,code_verifier:d.code_verifier,redirect_uri:auth+"/deviceauth/callback"});
      pending=null;
    },
    async logout(){ browser?.close(); browser=null; if(refreshing) await refreshing.catch(()=>{}); pending=null; await save({key:state.key}); },
    async headers() {
      if(!state.refresh) throw Error("请先在插件设置中登录 ChatGPT");
      if(state.expires<Date.now()+60000) {
        refreshing ??= exchange({grant_type:"refresh_token",refresh_token:state.refresh}).finally(()=>{refreshing=null});
        await refreshing;
      }
      const claims=JSON.parse(Buffer.from(state.access.split(".")[1],"base64url").toString());
      const id=claims["https://api.openai.com/auth"]?.chatgpt_account_id;
      return {Authorization:"Bearer "+state.access,...(id?{"ChatGPT-Account-Id":id}:{}),originator:"codex_cli_rs"};
    }
  };
}

