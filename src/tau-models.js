import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";

export const baseUrl = "http://127.0.0.1:17653/v1";
export async function addModels(key, file = join(homedir(), ".editor", "setting.json")) {
  const response = await fetch(baseUrl + "/models", {
    headers: {Authorization: "Bearer " + key},
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw Error("读取账号模型失败 HTTP " + response.status);
  const list = (await response.json()).data;
  const ids = [...new Set(list.map(m => m.id).filter(id => typeof id === "string" && id.length))];
  if (!ids.length) throw Error("当前账号未返回可添加的模型");
  const before = await readFile(file, "utf8");
  const settings = JSON.parse(before);
  const providers = settings.llmProviders;
  if (!Array.isArray(providers)) throw Error("无法识别此版本的 Tau 服务商设置");
  let provider = providers.find(p => p.baseUrl?.replace(/\/$/, "") === baseUrl && p.api === "openai-completions");
  if (!provider) {
    provider = {id: randomUUID(), name: "Codex 订阅", baseUrl, api: "openai-completions", models: []};
    providers.push(provider);
  }
  const previous = JSON.stringify(provider);
  provider.apiKey = key;
  mergeModels(provider, list);
  if (JSON.stringify(provider) !== previous) {
    const temp = file + "." + randomUUID();
    try {
      await writeFile(temp, JSON.stringify(settings, null, 2), {mode:0o600,flag:"wx"});
      if (await readFile(file,"utf8") !== before) throw Error("Tau 设置刚刚发生变化，请重试");
      await rename(temp,file);
    } finally { await unlink(temp).catch(e=>{if(e.code!=="ENOENT") throw e}); }
  }
  return provider.name+" 已包含 "+ids.length+" 个账号模型。若模型选择器尚未刷新，请重启 Tau。";
}

export function mergeModels(provider, catalog) {
  const indexed = new Map(provider.models.map(model => [model.id,model]));
  const available = new Map(catalog.filter(m=>typeof m.id==="string" && m.id).map(m=>[m.id,m]));
  for (const id of available.keys()) {
    if (!indexed.has(id)) provider.models.push({id, name:id, api:provider.api});
  }
  for (const model of provider.models) {
    const info = available.get(model.id);
    if (!Array.isArray(model.input) || !model.input.length) {
      const input = info?.input?.filter(type=>type==="text" || type==="image");
      model.input = input?.length ? input : ["text"];
    }
    // Tau requires both budgets to register a custom model. Older bridges
    // omit capacity metadata; use conservative local budgets in that case.
    if (!positiveInteger(model.contextWindow)) {
      model.contextWindow = positiveInteger(info?.contextWindow) ? info.contextWindow : 32768;
    }
    if (!positiveInteger(model.maxTokens)) {
      const outputBudget = positiveInteger(info?.maxTokens) ? info.maxTokens : 8192;
      model.maxTokens = Math.min(outputBudget, model.contextWindow);
    }
    if (typeof model.reasoning!=="boolean") model.reasoning = info?.reasoning===true;
  }
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
