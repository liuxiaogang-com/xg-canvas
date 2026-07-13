/**
 * LLM extraction prompts. Each enforces strict JSON output via the
 * openai-compat adapter's json_mode flag.
 */

export const EXTRACT_CHARACTERS_PROMPT = `你是剧本结构化助手。从用户提供的剧本中抽取角色清单。
只输出 JSON: { "characters": [{ "name": string, "description": string, "traits"?: string[] }] }
- name 限制 12 字内, description 限制 60 字内
- 只列被剧情提到的角色, 不臆造`;

export const EXTRACT_SCENES_PROMPT = `你是剧本结构化助手。抽取场景清单。
只输出 JSON: { "scenes": [{ "name": string, "description": string, "time_of_day"?: string }] }
- name 限制 16 字内 (如 "废弃工厂内景"), description 限制 80 字`;

export const EXTRACT_PROPS_PROMPT = `你是剧本结构化助手。抽取关键物品/道具。
只输出 JSON: { "props": [{ "name": string, "description": string }] }
- 只抽取剧情承载道具, 不列日常摆设
- 不超过 12 个`;

export const GENERATE_STORYBOARD_PROMPT = `你是分镜导演。把剧本拆为分镜表。
只输出 JSON: {
  "shots": [
    {
      "shot_no": number,
      "summary": string,        // 一句镜头说明
      "dialogue"?: string,
      "prompt": string,         // 给图片/视频模型的英文 / 中文 prompt
      "duration_sec": number,   // 1-15
      "characters"?: string[],  // 引用上面 extract 出来的角色名
      "scene"?: string,         // 引用场景名
      "props"?: string[]
    }
  ]
}
- 至少 4 个镜头, 至多 12 个
- shot_no 从 1 连续递增
- 优先依赖已有的角色/场景列表 (会在 user message 里给出)`;

export const OPTIMIZE_SCRIPT_PROMPT = `你是中文编辑。优化用户提供的剧本片段，使语言更紧凑、画面感更强。
只输出 JSON: { "optimized_text": string }`;
