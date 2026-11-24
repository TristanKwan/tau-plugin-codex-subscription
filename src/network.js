import { ProxyAgent } from "undici";

export async function createNetwork(ctx) {
  let proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  if (!proxy && process.platform === "win32") {
    const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
    const query = async name => (await ctx.process.run("reg", ["query", key, "/v", name], {signal:ctx.signal})).stdout;
    if (/REG_DWORD\s+0x1\b/i.test(await query("ProxyEnable"))) {
      const raw = /REG_SZ\s+([^\r\n]+)/i.exec(await query("ProxyServer"))?.[1]?.trim() || "";
      const entries = raw.split(";");
      proxy = (entries.find(s=>s.startsWith("https=")) || entries.find(s=>s.startsWith("http=")) || entries.find(s=>!s.includes("=")))?.replace(/^https?=/,"");
    }
  }
  const agent = proxy ? new ProxyAgent(proxy.includes("://") ? proxy : "http://"+proxy) : undefined;
  if (agent) ctx.register({dispose:()=>agent.destroy()});
  const bypass=(process.env.NO_PROXY || process.env.no_proxy || "").split(",").map(s=>s.trim().toLowerCase().replace(/^\./,"")).filter(Boolean);
  return (url,options)=>{
    const host=new URL(url).hostname;
    const direct=bypass.some(rule=>rule==="*" || rule===host || host.endsWith("."+rule));
    return fetch(url,{...options,...(agent && !direct ? {dispatcher:agent} : {})});
  };
}
