import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";

export async function browserLogin(client, signal, exchange) {
  signal.throwIfAborted();
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  const redirect = "http://localhost:1455/auth/callback";
  const expires = Date.now() + 600000;
  let status="等待浏览器授权", timer, consumed=false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, redirect);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" || url.pathname !== "/auth/callback" || url.searchParams.get("state") !== state) {
      res.writeHead(400);
      return res.end("无效的授权回调，请回到 Tau 继续登录。");
    }
    if(consumed){res.writeHead(409);return res.end("此登录请求已处理");}
    consumed=true;
    const code=url.searchParams.get("code");
    try {
      if(!code) throw Error("未收到授权码");
      status="正在交换登录令牌";
      await exchange({grant_type:"authorization_code",code,code_verifier:verifier,redirect_uri:redirect});
      status="已登录";
      res.end("登录成功，订阅凭据已保存。可以关闭此页并回到 Tau。");
    } catch(e) {
      status="登录失败："+e.message;
      res.writeHead(502);
      res.end(status);
    }
    close();
  });
  function close() {
    clearTimeout(timer);
    signal.removeEventListener("abort", close);
    server.close();
  }
  await new Promise((resolve,reject)=>{
    server.once("error", reject);
    server.listen(1455, "127.0.0.1", resolve);
  }).catch(e=>{throw Error(e.code === "EADDRINUSE" ? "登录端口 1455 已占用，请结束其他 Codex 登录后重试" : e.message)});
  timer = setTimeout(close,600000);
  signal.addEventListener("abort",close,{once:true});
  if(signal.aborted){close();signal.throwIfAborted()}
  const params = new URLSearchParams({
    client_id:client,response_type:"code",redirect_uri:redirect,scope:"openid profile email offline_access",
    code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",
    state,id_token_add_organizations:"true",codex_cli_simplified_flow:"true",originator:"codex_cli_rs"
  });
  return {
    url:"https://auth.openai.com/oauth/authorize?"+params,
    close,
    status:()=>!consumed && Date.now()>expires?"登录链接已过期":status
  };
}
