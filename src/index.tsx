import {Quota} from "./Quota";
import "./settings.css";
import {definePlugin} from "@tau/plugins";
import {useEffect,useState} from "react";
function Preferences({context}) {
  const [message,setMessage]=useState("正在连接本机服务…");
  const [logged,setLogged]=useState(false);
  const [code,setCode]=useState("");
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let live=true;context.backend.call("settings.action","status").then(v=>{if(live){setMessage(v);setLogged(v==="已登录")}},e=>live&&setMessage(e.message));return ()=>{live=false}},[context]);
  useEffect(()=>{
    if(!url) return;
    let live=true;
    const timer=setInterval(async()=>{
      try{
        const status=await context.backend.call("settings.action","status");
        if(live){if(status==="已登录")setLogged(true);setMessage(status);if(status==="已登录" || status.startsWith("登录失败") || status.includes("已过期"))setUrl("")}
      }catch(e){if(live)setMessage(e.message)}
    },1500);
    return ()=>{live=false;clearInterval(timer)};
  },[url,context]);
  async function run(action){
    setBusy(true);
    try {
      if(["login","browser"].includes(action)){setUrl("");setCode("")}
      const value=await context.backend.call("settings.action",action);
      if(action==="key"){await navigator.clipboard.writeText(value);setMessage("已复制本机 API Key")}
      else if(action==="browser"){setUrl(value);window.open(value,"_blank","noopener,noreferrer");setMessage("请在浏览器完成授权。如果页面未打开，可点击下方链接。")}
      else if(action==="login"){setCode(value);setMessage("请在 OpenAI 设备授权页面输入设备码，再确认登录")}
      else {if(["confirm","logout"].includes(action)){setCode("");setUrl("");setLogged(action==="confirm")}setMessage(value)}
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  return <section className="tau-codex-settings">
    <h3>{logged ? "已连接 ChatGPT 订阅" : "连接 ChatGPT 订阅"}</h3>
    <p>{logged ? "将账号模型添加到 Tau，即可在聊天中选择。" : "登录 OpenAI 后即可连接账号。"}</p>
    <div className="tau-codex-actions">{Object.entries(logged
      ? {models:"添加到 Tau 模型选择器",logout:"退出登录"}
      : {browser:"浏览器登录",login:"使用设备码登录",...(code?{confirm:"确认设备授权"}:{})}
    ).map(([id,label])=><button type="button" key={id} disabled={busy} onClick={()=>run(id)}>{label}</button>)}</div>
    {logged&&<Quota context={context}/>}
    {logged&&<details><summary>手动配置服务商</summary><p>选择 OpenAI Chat Completions，Base URL 填 <code>http://127.0.0.1:17653/v1</code>。</p><div className="tau-codex-actions"><button disabled={busy} onClick={()=>run("key")}>复制本机 API Key</button></div></details>}
    {url&&<p><a style={{textDecoration:"underline"}} href={url} target="_blank" rel="noreferrer">打开 OpenAI 登录页面</a></p>}
    {code&&<p><a href="https://auth.openai.com/codex/device" target="_blank" rel="noreferrer">打开 OpenAI 设备授权页面</a>　设备码 <strong>{code}</strong></p>}
    <p role="status" style={{whiteSpace:"pre-line"}}>{message}</p></section>
}
export default definePlugin({...__PLUGIN_META__,create:()=>({activate(ctx){ctx.settings.register({id:"subscription",title:"Codex 订阅连接",component:Preferences})}})});


