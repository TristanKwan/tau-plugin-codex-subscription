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
    <p>{logged ? "请在 Tau 的大语言模型设置中手动配置服务商和模型，再在聊天中选择。" : "登录 OpenAI 后即可连接账号。"}</p>
    <div className="tau-codex-actions">{Object.entries(logged
      ? {logout:"退出登录"}
      : {browser:"浏览器登录",login:"使用设备码登录",...(code?{confirm:"确认设备授权"}:{})}
    ).map(([id,label])=><button type="button" key={id} disabled={busy} onClick={()=>run(id)}>{label}</button>)}</div>
    {logged&&<Quota context={context}/>}
    {logged&&<section aria-label="手动配置服务商">
      <h4>手动配置服务商</h4>
      <ol>
        <li>打开 Tau「设置 → 大语言模型 → 服务商与模型」，点击「添加服务商 → 其他服务商」，名称可填「Codex 订阅」，接口类型选择「OpenAI 兼容（最常见）」。</li>
        <li>Base URL 填写 <code>http://127.0.0.1:17653/v1</code>。</li>
        <li>点击下方按钮复制本机 API Key，粘贴到服务商的 API Key 输入框。</li>
        <li>在 Tau 中获取模型列表或手动添加模型 ID，保存后在聊天中选择对应模型。账号新增模型后，也在 Tau 中重新获取或手动添加。</li>
      </ol>
      <div className="tau-codex-actions"><button type="button" disabled={busy} onClick={()=>run("key")}>复制本机 API Key</button></div>
      <p>服务商和模型配置由 Tau 保存。插件不会直接读取或改写 Tau 的全局设置文件。</p>
    </section>}
    {url&&<p><a style={{textDecoration:"underline"}} href={url} target="_blank" rel="noreferrer">打开 OpenAI 登录页面</a></p>}
    {code&&<p><a href="https://auth.openai.com/codex/device" target="_blank" rel="noreferrer">打开 OpenAI 设备授权页面</a>　设备码 <strong>{code}</strong></p>}
    <p role="status" style={{whiteSpace:"pre-line"}}>{message}</p></section>
}
export default definePlugin({...__PLUGIN_META__,create:()=>({activate(ctx){ctx.settings.register({id:"subscription",title:"Codex 订阅连接",component:Preferences})}})});


