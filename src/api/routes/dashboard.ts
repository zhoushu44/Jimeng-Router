import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import imagesRoute from './images.ts';
import videosRoute from './videos.ts';
import {
  addSession,
  deleteSession,
  getAuthorizationFromStore,
  listMaskedSessions,
  listSessions,
} from '@/lib/session-store.ts';
import {
  addModel,
  deleteModel as deleteStoredModel,
  getModelCategories,
  getOpenAIModelsPayload,
  listModels,
  listModelsByCategory,
  moveModel as moveStoredModel,
} from '@/lib/model-store.ts';
import { getTokenLiveStatus, getCredit } from '@/api/controllers/core.ts';

function buildExamples() {
  return {
    examples: {
      image_text: {
        title: '文生图 JSON',
        group: 'image',
        description: '调用 OpenAI 兼容图片生成接口。管理台模式下无需手动传 Authorization，原生 API 模式下使用 Authorization: Bearer sessionid。',
        curl: `curl -X POST https://127.0.0.1/v1/images/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_sessionid" \\
  -d '{"model":"jimeng-5.0","prompt":"霓虹雨夜中的未来城市","ratio":"16:9","resolution":"2k"}'`,
        python: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="your_sessionid",\n    base_url="https://127.0.0.1/v1"\n)\n\nresult = client.images.generate(\n    model="jimeng-5.0",\n    prompt="霓虹雨夜中的未来城市",\n    extra_body={"ratio": "16:9", "resolution": "2k"}\n)\nprint(result.data[0].url)`,
        openai: {
          url: 'https://127.0.0.1/v1',
          api_key: 'your_sessionid',
          model: 'jimeng-5.0',
        },
      },
      image_edit: {
        title: '图生图 multipart',
        group: 'image',
        description: '图片 URL 数组与 multipart 上传都可用。/v1/images/generations 会自动根据是否有 images 切换文生图/图生图。',
        curl: `curl -X POST https://127.0.0.1/v1/images/generations \\
  -H "Authorization: Bearer your_sessionid" \\
  -F "model=jimeng-4.6" \\
  -F "prompt=将画面改成电影感海报风格" \\
  -F "images=@/path/to/reference.jpg" \\
  -F "ratio=1:1" \\
  -F "resolution=2k" \\
  -F "sample_strength=0.55"`,
        python: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="your_sessionid",\n    base_url="https://127.0.0.1/v1"\n)\n\nresult = client.images.generate(\n    model="jimeng-4.6",\n    prompt="将画面改成电影感海报风格",\n    extra_body={"images": ["https://example.com/reference.jpg"], "ratio": "1:1", "resolution": "2k", "sample_strength": 0.55}\n)\nprint(result.data[0].url)`,
        openai: {
          url: 'https://127.0.0.1/v1',
          api_key: 'your_sessionid',
          model: 'jimeng-4.6',
        },
      },
      video: {
        title: '视频生成',
        group: 'video',
        description: '第一版主流程接国内同步视频接口。普通视频支持 5/10 秒；Seedance 支持 4-15 秒，并建议配合素材使用。',
        curl: `curl -X POST https://127.0.0.1/v1/videos/generations \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer your_sessionid" \\
  -d '{"model":"jimeng-video-3.5-pro","prompt":"海边奔跑的白色小狗，电影镜头","ratio":"16:9","resolution":"720p","duration":5}'`,
        python: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="your_sessionid",\n    base_url="https://127.0.0.1/v1"\n)\n\nresponse = client.post(\n    "/videos/generations",\n    body={\n        "model": "jimeng-video-3.5-pro",\n        "prompt": "海边奔跑的白色小狗，电影镜头",\n        "ratio": "16:9",\n        "resolution": "720p",\n        "duration": 5,\n    },\n)\nprint(response)`,
        openai: {
          url: 'https://127.0.0.1/v1',
          api_key: 'your_sessionid',
          model: 'jimeng-video-3.5-pro',
          note: '视频接口是项目扩展能力；兼容 OpenAI 客户端时可填写 URL / API KEY / MODEL，但实际调用建议按上方 cURL 或自定义 HTTP 请求发送。',
        },
      },
      models: {
        title: '模型列表',
        group: 'models',
        description: '查询当前可用模型清单。模型管理页支持新增、删除和分类内优先级调整，变更会同步影响 /v1/models 与控制台下拉。',
        curl: 'curl https://127.0.0.1/v1/models',
        python: `from openai import OpenAI\n\nclient = OpenAI(\n    api_key="your_sessionid",\n    base_url="https://127.0.0.1/v1"\n)\n\nmodels = client.models.list()\nprint(models)`,
        openai: {
          url: 'https://127.0.0.1/v1',
          api_key: 'your_sessionid',
          model: 'gpt-5.4',
        },
      },
      international_note: {
        title: '国际版 / 异步补充',
        group: 'video',
        description: '国际版视频接口与异步查询先放在说明区，避免第一版主界面过重。国际 token 仍使用 Bearer sessionid，示例中的 sessionid 可带 sg-/hk-/jp- 等区域前缀。',
        curl: `curl -X POST https://127.0.0.1/v1/videos/international/generations \\
  -H "Authorization: Bearer sg-your_sessionid" \\
  -F "model=seedance-2.0-fast" \\
  -F "prompt=@1 中的人物开始微笑并转身" \\
  -F "duration=4" \\
  -F "image_file=@/path/to/image.jpg"`,
        python: `# 国际版异步接口：\n# POST /v1/videos/international/generations/async\n# GET  /v1/videos/international/generations/async/{task_id}`,
        openai: {
          url: 'https://127.0.0.1/v1',
          api_key: 'sg-your_sessionid',
          model: 'seedance-2.0-fast',
          note: '国际版同步/异步视频接口同样是项目扩展能力，建议按 cURL 直接调用。',
        },
      },
    },
  };
}

async function getModelsPayload() {
  const models = await listModels();
  const modelsByCategory = await listModelsByCategory();
  return {
    models,
    categories: getModelCategories(),
    models_by_category: modelsByCategory,
    openai_models: (await getOpenAIModelsPayload()).data,
  };
}

async function getSessionApiKeyPayload() {
  const authorization = await getAuthorizationFromStore();
  return {
    api_key: authorization.replace(/^Bearer\s+/i, ''),
    count: (await listSessions()).length,
  };
}

async function getSessionsPayload() {
  const sessions = await listMaskedSessions();
  return {
    sessions,
    count: sessions.length,
  };
}

export default {
  prefix: '/api',

  get: {
    '/sessions': async () => getSessionsPayload(),
    '/sessions/api-key': async () => getSessionApiKeyPayload(),
    '/models': async () => getModelsPayload(),
    '/examples': async () => buildExamples(),
  },

  post: {
    '/sessions': async (request: Request) => {
      request
        .validate('body.value', _.isString)
        .validate('body.name', (value) => _.isUndefined(value) || _.isString(value))
        .validate('body.note', (value) => _.isUndefined(value) || _.isString(value));

      const session = await addSession({
        name: request.body.name,
        value: request.body.value,
        note: request.body.note,
      });

      let live: boolean | null = null;
      let points: any = null;
      try {
        live = await getTokenLiveStatus(session.value);
      } catch {
        live = null;
      }

      try {
        points = await getCredit(session.value);
      } catch {
        points = null;
      }

      return {
        session: {
          id: session.id,
          name: session.name,
          note: session.note,
          createdAt: session.createdAt,
        },
        validation: {
          live,
          points,
        },
      };
    },
    '/models': async (request: Request) => {
      request
        .validate('body.name', _.isString)
        .validate('body.model_id', _.isString)
        .validate('body.category', _.isString)
        .validate('body.description', (value) => _.isUndefined(value) || _.isString(value));

      const model = await addModel({
        name: request.body.name,
        model_id: request.body.model_id,
        category: request.body.category,
        description: request.body.description,
      });

      return { model };
    },
    '/models/:id/move': async (request: Request) => {
      request.validate('body.direction', (value) => value === 'up' || value === 'down');
      const model = await moveStoredModel(request.params.id, request.body.direction);
      return {
        moved: Boolean(model),
        model,
      };
    },
    '/generate/image': async (request: Request) => {
      request.headers.authorization = await getAuthorizationFromStore();
      return imagesRoute.post['/generations'](request);
    },
    '/generate/video': async (request: Request) => {
      request.headers.authorization = await getAuthorizationFromStore();
      return videosRoute.post['/generations'](request);
    },
  },

  delete: {
    '/sessions/:id': async (request: Request) => {
      const deleted = await deleteSession(request.params.id);
      return { deleted };
    },
    '/models/:id': async (request: Request) => {
      const deleted = await deleteStoredModel(request.params.id);
      return { deleted };
    },
  },
};
