import fs from 'fs-extra';
import path from 'path';

import util from '@/lib/util.ts';

export type ModelCategory = 'image' | 'video' | 'seedance';

export interface ModelRecord {
  id: string;
  name: string;
  model_id: string;
  category: ModelCategory;
  description?: string;
  object: string;
  owned_by: string;
  sort: number;
  createdAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'models.json');

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  image: '图片模型',
  video: '视频模型',
  seedance: 'Seedance / 国际兼容',
};

export const DEFAULT_MODELS: Array<Omit<ModelRecord, 'id' | 'sort' | 'createdAt'>> = [
  {
    name: 'jimeng',
    model_id: 'jimeng',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
  },
  {
    name: 'jimeng-5.0',
    model_id: 'jimeng-5.0',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 5.0 版本（最新）',
  },
  {
    name: 'jimeng-4.6',
    model_id: 'jimeng-4.6',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 4.6 版本（最新）',
  },
  {
    name: 'jimeng-4.5',
    model_id: 'jimeng-4.5',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 4.5 版本',
  },
  {
    name: 'jimeng-4.1',
    model_id: 'jimeng-4.1',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 4.1 版本',
  },
  {
    name: 'jimeng-4.0',
    model_id: 'jimeng-4.0',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 4.0 版本',
  },
  {
    name: 'jimeng-3.1',
    model_id: 'jimeng-3.1',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 3.1 版本',
  },
  {
    name: 'jimeng-3.0',
    model_id: 'jimeng-3.0',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 3.0 版本',
  },
  {
    name: 'jimeng-2.1',
    model_id: 'jimeng-2.1',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 2.1 版本',
  },
  {
    name: 'jimeng-2.0-pro',
    model_id: 'jimeng-2.0-pro',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 2.0 专业版',
  },
  {
    name: 'jimeng-2.0',
    model_id: 'jimeng-2.0',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 2.0 版本',
  },
  {
    name: 'jimeng-1.4',
    model_id: 'jimeng-1.4',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 1.4 版本',
  },
  {
    name: 'jimeng-xl-pro',
    model_id: 'jimeng-xl-pro',
    category: 'image',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI图像生成模型 XL Pro 版本',
  },
  {
    name: 'jimeng-video-3.5-pro',
    model_id: 'jimeng-video-3.5-pro',
    category: 'video',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI视频生成模型 3.5 专业版',
  },
  {
    name: 'jimeng-video-3.0',
    model_id: 'jimeng-video-3.0',
    category: 'video',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI视频生成模型 3.0 版本',
  },
  {
    name: 'jimeng-video-3.0-pro',
    model_id: 'jimeng-video-3.0-pro',
    category: 'video',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: '即梦AI视频生成模型 3.0 专业版',
  },
  {
    name: 'jimeng-video-seedance-2.0',
    model_id: 'jimeng-video-seedance-2.0',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 多图智能视频生成模型（国内兼容接口可用；国际 token hk-/jp-/sg- 建议走 /v1/videos/international/generations）',
  },
  {
    name: 'seedance-2.0',
    model_id: 'seedance-2.0',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 多图智能视频生成模型（jimeng-video-seedance-2.0 的别名，向后兼容）',
  },
  {
    name: 'seedance-2.0-pro',
    model_id: 'seedance-2.0-pro',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 Pro 多图智能视频生成模型（jimeng-video-seedance-2.0 的别名，向后兼容）',
  },
  {
    name: 'jimeng-video-seedance-2.0-fast',
    model_id: 'jimeng-video-seedance-2.0-fast',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0-fast 快速多图智能视频生成模型（国内兼容接口可用；国际 token hk-/jp-/sg- 建议走 /v1/videos/international/generations）',
  },
  {
    name: 'seedance-2.0-fast',
    model_id: 'seedance-2.0-fast',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0-fast 快速多图智能视频生成模型（jimeng-video-seedance-2.0-fast 的别名，向后兼容）',
  },
  {
    name: 'jimeng-video-seedance-2.0-fast-vip',
    model_id: 'jimeng-video-seedance-2.0-fast-vip',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 Fast VIP Vision 文生视频模型（dreamina_seedance_40_vision，VIP 快速版，支持文生视频和图生视频）',
  },
  {
    name: 'seedance-2.0-fast-vip',
    model_id: 'seedance-2.0-fast-vip',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 Fast VIP Vision 文生视频模型（jimeng-video-seedance-2.0-fast-vip 的别名，向后兼容）',
  },
  {
    name: 'jimeng-video-seedance-2.0-vip',
    model_id: 'jimeng-video-seedance-2.0-vip',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 VIP Vision 主模态能力视频模型（dreamina_seedance_40_pro_vision，VIP 专业版，主模态能力）',
  },
  {
    name: 'seedance-2.0-vip',
    model_id: 'seedance-2.0-vip',
    category: 'seedance',
    object: 'model',
    owned_by: 'jimeng-free-api',
    description: 'Seedance 2.0 VIP Vision 主模态能力视频模型（jimeng-video-seedance-2.0-vip 的别名，向后兼容）',
  },
];

function normalizeCategory(category: string): ModelCategory {
  if (category === 'image' || category === 'video' || category === 'seedance') {
    return category;
  }
  throw new Error('不支持的模型分类，只允许 image、video、seedance');
}

function normalizeModel(input: Partial<ModelRecord>) {
  return {
    name: String(input.name || '').trim(),
    model_id: String(input.model_id || '').trim(),
    category: normalizeCategory(String(input.category || '').trim()),
    description: String(input.description || '').trim(),
    object: String(input.object || 'model').trim() || 'model',
    owned_by: String(input.owned_by || 'jimeng-free-api').trim() || 'jimeng-free-api',
  };
}

function sortModels(models: ModelRecord[]) {
  return [...models].sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    if (a.sort !== b.sort) {
      return a.sort - b.sort;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });
}

function resequenceByCategory(models: ModelRecord[]) {
  const sorted = sortModels(models);
  const nextByCategory: Record<ModelCategory, number> = {
    image: 0,
    video: 0,
    seedance: 0,
  };

  return sorted.map((model) => ({
    ...model,
    sort: nextByCategory[model.category]++,
  }));
}

function seedDefaultModels() {
  const now = new Date().toISOString();
  const counters: Record<ModelCategory, number> = {
    image: 0,
    video: 0,
    seedance: 0,
  };

  return DEFAULT_MODELS.map((model) => ({
    ...model,
    id: util.uuid(false),
    sort: counters[model.category]++,
    createdAt: now,
    description: model.description || '',
  }));
}

async function ensureStore() {
  await fs.ensureDir(DATA_DIR);
  const exists = await fs.pathExists(STORE_FILE);
  if (!exists) {
    await fs.writeJson(STORE_FILE, { models: seedDefaultModels() }, { spaces: 2 });
  }
}

async function readStore(): Promise<ModelRecord[]> {
  await ensureStore();
  const data = await fs.readJson(STORE_FILE);
  const models = Array.isArray(data?.models) ? data.models : [];
  return resequenceByCategory(models);
}

async function writeStore(models: ModelRecord[]) {
  await ensureStore();
  await fs.writeJson(STORE_FILE, { models: resequenceByCategory(models) }, { spaces: 2 });
}

export async function listModels() {
  return readStore();
}

export async function listModelsByCategory() {
  const models = await readStore();
  return {
    image: models.filter((model) => model.category === 'image'),
    video: models.filter((model) => model.category === 'video'),
    seedance: models.filter((model) => model.category === 'seedance'),
  };
}

export async function addModel(input: Pick<ModelRecord, 'name' | 'model_id' | 'category'> & Partial<Pick<ModelRecord, 'description' | 'object' | 'owned_by'>>) {
  const normalized = normalizeModel(input);
  if (!normalized.name) {
    throw new Error('模型名称不能为空');
  }
  if (!normalized.model_id) {
    throw new Error('模型 ID 不能为空');
  }

  const models = await readStore();
  const exists = models.find((model) => model.category === normalized.category && model.model_id === normalized.model_id);
  if (exists) {
    throw new Error('同分类下已存在相同 model_id 的模型');
  }

  const maxSort = models
    .filter((model) => model.category === normalized.category)
    .reduce((max, model) => Math.max(max, model.sort), -1);

  const nextModel: ModelRecord = {
    id: util.uuid(false),
    name: normalized.name,
    model_id: normalized.model_id,
    category: normalized.category,
    description: normalized.description,
    object: normalized.object,
    owned_by: normalized.owned_by,
    sort: maxSort + 1,
    createdAt: new Date().toISOString(),
  };

  models.push(nextModel);
  await writeStore(models);
  return nextModel;
}

export async function deleteModel(id: string) {
  const models = await readStore();
  const nextModels = models.filter((model) => model.id !== id);
  const deleted = nextModels.length !== models.length;
  if (deleted) {
    await writeStore(nextModels);
  }
  return deleted;
}

export async function moveModel(id: string, direction: 'up' | 'down') {
  const models = await readStore();
  const current = models.find((model) => model.id === id);
  if (!current) {
    return null;
  }

  const categoryModels = models
    .filter((model) => model.category === current.category)
    .sort((a, b) => a.sort - b.sort);
  const index = categoryModels.findIndex((model) => model.id === id);
  if (index === -1) {
    return null;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= categoryModels.length) {
    return current;
  }

  const target = categoryModels[targetIndex];
  const swapped = models.map((model) => {
    if (model.id === current.id) {
      return { ...model, sort: target.sort };
    }
    if (model.id === target.id) {
      return { ...model, sort: current.sort };
    }
    return model;
  });

  await writeStore(swapped);
  return swapped.find((model) => model.id === id) || current;
}

export async function getOpenAIModelsPayload() {
  const models = await readStore();
  return {
    data: models.map((model) => ({
      id: model.model_id,
      object: model.object || 'model',
      owned_by: model.owned_by || 'jimeng-free-api',
      description: model.description || undefined,
    })),
  };
}

export function getModelCategories() {
  return CATEGORY_LABELS;
}

export { STORE_FILE, seedDefaultModels };
