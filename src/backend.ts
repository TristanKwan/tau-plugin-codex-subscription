import {quotaSnapshot} from "./quota.js";
import {defineBackend} from "@tau/plugins/backend";
import {createNetwork} from "./network.js";
import {account} from "./account.js";
import {addModels} from "./tau-models.js";
import {bridge} from "./bridge.js";
export default defineBackend({create:()=>({
  async activate(ctx){
    const request=await createNetwork(ctx);
    const user=await account(ctx.signal,request);
    const server=bridge(user,request);
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(17653,"127.0.0.1",resolve)});
    ctx.register({dispose(){server.close();server.closeAllConnections()}});
    let busy=false;
    ctx.rpc.register("settings.action",{
      input:{parse(action){if(!["status","key","browser","login","confirm","logout","models","quota"].includes(action)) throw Error("未知操作");return action}},
      output:{parse(value){if(typeof value!=="string") throw Error("结果无效");return value}}
    },async action=>{
      if(action==="key") return user.key;
      if(action==="status") return user.status();
      if(action==="quota"){
        const response=await request("https://chatgpt.com/backend-api/wham/usage",{headers:await user.headers(),signal:ctx.signal});
        if(!response.ok) throw Error("读取额度失败 HTTP "+response.status);
        const data=await response.json();
        return JSON.stringify(quotaSnapshot(data));
      }
      if(busy) throw Error("请等待当前操作完成");
      busy=true;
      try{
        if(action==="browser") return await user.browserLogin();
        if(action==="models") return await addModels(user.key);
        if(action==="login") return await user.login();
        if(action==="confirm"){await user.confirm();return "已登录"}
        if(action==="logout"){await user.logout();return "已退出"}
      }finally{busy=false}
    });
  }
})});

