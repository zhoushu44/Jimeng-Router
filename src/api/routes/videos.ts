import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { withTokenFallback } from '@/api/controllers/core.ts';
import { generateVideo, generateSeedanceVideo, generateInternationalVideo, generateInternationalSeedanceVideo, isSeedanceModel, isInternationalSeedanceModel, isInternationalVideoModel, DEFAULT_MODEL, submitAsyncVideoTask, queryAsyncVideoTask, submitInternationalAsyncVideoTask } from '@/api/controllers/videos.ts';
import util from '@/lib/util.ts';

export default {

  prefix: '/v1/videos',

  post: {

    '/generations': async (request: Request) => {
      // 检查是否使用了不支持的参数
      const unsupportedParams = ['size', 'width', 'height'];
      const bodyKeys = Object.keys(request.body);
      const foundUnsupported = unsupportedParams.filter(param => bodyKeys.includes(param));

      if (foundUnsupported.length > 0) {
        throw new Error(`不支持的参数: ${foundUnsupported.join(', ')}。请使用 ratio 和 resolution 参数控制视频尺寸。`);
      }

      const contentType = request.headers['content-type'] || '';
      const isMultiPart = contentType.startsWith('multipart/form-data');

      request
        .validate('body.model', v => _.isUndefined(v) || _.isString(v))
        .validate('body.prompt', v => _.isUndefined(v) || _.isString(v))
        .validate('body.ratio', v => _.isUndefined(v) || _.isString(v))
        .validate('body.resolution', v => _.isUndefined(v) || _.isString(v))
        .validate('body.duration', v => {
          if (_.isUndefined(v)) return true;
          // 对于 multipart/form-data，允许字符串类型的数字
          if (isMultiPart && typeof v === 'string') {
            const num = parseInt(v);
            // Seedance 支持 4-15 秒连续范围，普通视频支持 5 或 10 秒
            return (num >= 4 && num <= 15) || num === 5 || num === 10;
          }
          // 对于 JSON，要求数字类型
          // Seedance 支持 4-15 秒连续范围，普通视频支持 5 或 10 秒
          return _.isFinite(v) && ((v >= 4 && v <= 15) || v === 5 || v === 10);
        })
        .validate('body.file_paths', v => _.isUndefined(v) || _.isArray(v))
        .validate('body.filePaths', v => _.isUndefined(v) || _.isArray(v))
        .validate('body.response_format', v => _.isUndefined(v) || _.isString(v))
        .validate('headers.authorization', _.isString);

      const {
        model = DEFAULT_MODEL,
        prompt,
        ratio = '1:1',
        resolution = '720p',
        duration = 5,
        file_paths = [],
        filePaths = [],
        response_format = 'url',
      } = request.body;

      const finalDuration = isMultiPart && typeof duration === 'string'
        ? parseInt(duration)
        : duration;

      const finalFilePaths = filePaths.length > 0 ? filePaths : file_paths;

      return await withTokenFallback(request.headers.authorization, async (token) => {
        let videoUrl: string;
        if (isSeedanceModel(model)) {
          const seedanceDuration = finalDuration === 5 ? 4 : finalDuration;
          const seedanceRatio = ratio === '1:1' ? '4:3' : ratio;

          videoUrl = await generateSeedanceVideo(
            model,
            prompt,
            {
              ratio: seedanceRatio,
              resolution,
              duration: seedanceDuration,
              filePaths: finalFilePaths,
              files: request.files,
            },
            token
          );
        } else {
          videoUrl = await generateVideo(
            model,
            prompt,
            {
              ratio,
              resolution,
              duration: finalDuration,
              filePaths: finalFilePaths,
              files: request.files,
            },
            token
          );
        }

        if (response_format === 'b64_json') {
          const videoBase64 = await util.fetchFileBASE64(videoUrl);
          return {
            created: util.unixTimestamp(),
            data: [{
              b64_json: videoBase64,
              revised_prompt: prompt,
            }]
          };
        }

        return {
          created: util.unixTimestamp(),
          data: [{
            url: videoUrl,
            revised_prompt: prompt,
          }]
        };
      });
    },

    '/international/generations': async (request: Request) => {
      const contentType = request.headers['content-type'] || '';
      const isMultiPart = contentType.startsWith('multipart/form-data');
      const allowedModels = [
        'seedance-2.0-fast', 'seedance-2.0-pro', 'jimeng-video-seedance-2.0-fast', 'jimeng-video-seedance-2.0', 'jimeng-video-seedance-2.0-fast-vip', 'seedance-2.0-fast-vip', 'jimeng-video-seedance-2.0-vip', 'seedance-2.0-vip',
        'jimeng-video-3.5-pro', 'jimeng-video-3.0', 'jimeng-video-3.0-pro'
      ];
      const hasKeyedUrlFields = Object.keys(request.body || {}).some(key => (
        key === 'image_file' || key === 'video_file' || key.startsWith('image_file_') || key.startsWith('video_file_')
      ) && _.isString(request.body[key]));
      const hasKeyedFiles = Object.keys(request.filesMap || {}).some(key =>
        key === 'image_file' || key === 'video_file' || key.startsWith('image_file_') || key.startsWith('video_file_')
      );

      request
        .validate('body.model', v => _.isString(v) && allowedModels.includes(v))
        .validate('body.prompt', v => _.isUndefined(v) || _.isString(v))
        .validate('body.ratio', v => _.isUndefined(v) || _.isString(v))
        .validate('body.resolution', v => _.isUndefined(v) || _.isString(v))
        .validate('body.file_paths', v => _.isUndefined(v) || _.isArray(v))
        .validate('body.filePaths', v => _.isUndefined(v) || _.isArray(v))
        .validate('body.response_format', v => _.isUndefined(v) || _.isString(v))
        .validate('headers.authorization', _.isString);

      const {
        model,
        prompt = '',
        ratio,
        resolution = '720p',
        duration,
        file_paths = [],
        filePaths = [],
        response_format = 'url',
      } = request.body;

      const isSeedance = isInternationalSeedanceModel(model);
      const finalDuration = _.isUndefined(duration)
        ? (isSeedance ? 4 : 5)
        : (isMultiPart && typeof duration === 'string' ? parseInt(duration) : duration);
      const finalRatio = _.isUndefined(ratio)
        ? (isSeedance ? '4:3' : '1:1')
        : ratio;
      const finalFilePaths = filePaths.length > 0 ? filePaths : file_paths;

      if (!_.isFinite(finalDuration) || !Number.isInteger(Number(finalDuration))) {
        throw new Error('duration 参数无效');
      }
      if (isSeedance) {
        if (finalDuration < 4 || finalDuration > 15) {
          throw new Error('国际 Seedance 模型 duration 仅支持 4-15 秒');
        }
        if (!hasKeyedFiles && !hasKeyedUrlFields && finalFilePaths.length === 0) {
          throw new Error('国际 Seedance 接口至少需要一个素材：keyed multipart 文件、keyed URL 字段或 file_paths/filePaths');
        }
      } else {
        if (finalDuration !== 5 && finalDuration !== 10) {
          throw new Error('国际普通视频模型 duration 仅支持 5 或 10 秒');
        }
      }

      return await withTokenFallback(request.headers.authorization, async (token) => {
        let videoUrl: string;
        if (isSeedance) {
          videoUrl = await generateInternationalSeedanceVideo(
            model,
            prompt,
            {
              ratio: finalRatio,
              resolution,
              duration: finalDuration,
              filePaths: finalFilePaths,
              filesMap: request.filesMap,
              body: request.body,
            },
            token
          );
        } else if (isInternationalVideoModel(model)) {
          videoUrl = await generateInternationalVideo(
            model,
            prompt,
            {
              ratio: finalRatio,
              resolution,
              duration: finalDuration,
              filePaths: finalFilePaths,
              files: request.files,
            },
            token
          );
        } else {
          throw new Error(`国际接口暂不支持模型: ${model}`);
        }

        if (response_format === 'b64_json') {
          const videoBase64 = await util.fetchFileBASE64(videoUrl);
          return {
            created: util.unixTimestamp(),
            data: [{ b64_json: videoBase64, revised_prompt: prompt }]
          };
        }

        return {
          created: util.unixTimestamp(),
          data: [{ url: videoUrl, revised_prompt: prompt }]
        };
      });
    },

    '/international/generations/async': async (request: Request) => {
      const contentType = request.headers['content-type'] || '';
      const isMultiPart = contentType.startsWith('multipart/form-data');
      const allowedModels = [
        'seedance-2.0-fast', 'seedance-2.0-pro', 'jimeng-video-seedance-2.0-fast', 'jimeng-video-seedance-2.0', 'jimeng-video-seedance-2.0-fast-vip', 'seedance-2.0-fast-vip', 'jimeng-video-seedance-2.0-vip', 'seedance-2.0-vip',
        'jimeng-video-3.5-pro', 'jimeng-video-3.0', 'jimeng-video-3.0-pro'
      ];
      const hasKeyedUrlFields = Object.keys(request.body || {}).some(key => (
        key === 'image_file' || key === 'video_file' || key.startsWith('image_file_') || key.startsWith('video_file_')
      ) && _.isString(request.body[key]));
      const hasKeyedFiles = Object.keys(request.filesMap || {}).some(key =>
        key === 'image_file' || key === 'video_file' || key.startsWith('image_file_') || key.startsWith('video_file_')
      );

      request
        .validate('body.model', v => _.isString(v) && allowedModels.includes(v))
        .validate('body.prompt', v => _.isUndefined(v) || _.isString(v))
        .validate('body.ratio', v => _.isUndefined(v) || _.isString(v))
        .validate('body.resolution', v => _.isUndefined(v) || _.isString(v))
        .validate('body.file_paths', v => _.isUndefined(v) || _.isArray(v))
        .validate('body.filePaths', v => _.isUndefined(v) || _.isArray(v))
        .validate('headers.authorization', _.isString);

      const {
        model,
        prompt = '',
        ratio,
        resolution = '720p',
        duration,
        file_paths = [],
        filePaths = [],
      } = request.body;

      const isSeedance = isInternationalSeedanceModel(model);
      const finalDuration = _.isUndefined(duration)
        ? (isSeedance ? 4 : 5)
        : (isMultiPart && typeof duration === 'string' ? parseInt(duration) : duration);
      const finalRatio = _.isUndefined(ratio)
        ? (isSeedance ? '4:3' : '1:1')
        : ratio;
      const finalFilePaths = filePaths.length > 0 ? filePaths : file_paths;

      if (!_.isFinite(finalDuration) || !Number.isInteger(Number(finalDuration))) {
        throw new Error('duration 参数无效');
      }
      if (isSeedance) {
        if (finalDuration < 4 || finalDuration > 15) {
          throw new Error('国际 Seedance 模型 duration 仅支持 4-15 秒');
        }
        if (!hasKeyedFiles && !hasKeyedUrlFields && finalFilePaths.length === 0) {
          throw new Error('国际 Seedance 接口至少需要一个素材：keyed multipart 文件、keyed URL 字段或 file_paths/filePaths');
        }
      } else if (isInternationalVideoModel(model)) {
        if (finalDuration !== 5 && finalDuration !== 10) {
          throw new Error('国际普通视频模型 duration 仅支持 5 或 10 秒');
        }
      } else {
        throw new Error(`国际接口暂不支持模型: ${model}`);
      }

      return await withTokenFallback(request.headers.authorization, async (token) => {
        const taskId = submitInternationalAsyncVideoTask(
          model,
          prompt,
          {
            ratio: finalRatio,
            resolution,
            duration: finalDuration,
            filePaths: finalFilePaths,
            files: request.files,
            filesMap: request.filesMap,
            body: request.body,
          },
          token
        );

        return {
          created: util.unixTimestamp(),
          task_id: taskId,
          status: 'processing',
          message: '任务已提交，请使用 GET /v1/videos/international/generations/async/{task_id} 查询结果',
        };
      });
    },

    '/generations/async': async (request: Request) => {
      const contentType = request.headers['content-type'] || '';
      const isMultiPart = contentType.startsWith('multipart/form-data');

      request
        .validate('body.model', v => _.isUndefined(v) || _.isString(v))
        .validate('body.prompt', v => _.isUndefined(v) || _.isString(v))
        .validate('body.ratio', v => _.isUndefined(v) || _.isString(v))
        .validate('body.resolution', v => _.isUndefined(v) || _.isString(v))
        .validate('body.duration', v => {
          if (_.isUndefined(v)) return true;
          if (isMultiPart && typeof v === 'string') {
            const num = parseInt(v);
            return (num >= 4 && num <= 15) || num === 5 || num === 10;
          }
          return _.isFinite(v) && ((v >= 4 && v <= 15) || v === 5 || v === 10);
        })
        .validate('body.file_paths', v => _.isUndefined(v) || _.isArray(v))
        .validate('body.filePaths', v => _.isUndefined(v) || _.isArray(v))
        .validate('headers.authorization', _.isString);

      const {
        model = DEFAULT_MODEL,
        prompt,
        ratio = '1:1',
        resolution = '720p',
        duration = 5,
        file_paths = [],
        filePaths = [],
      } = request.body;

      const finalDuration = isMultiPart && typeof duration === 'string'
        ? parseInt(duration)
        : duration;

      const finalFilePaths = filePaths.length > 0 ? filePaths : file_paths;

      return await withTokenFallback(request.headers.authorization, async (token) => {
        const taskId = submitAsyncVideoTask(
          model,
          prompt,
          {
            ratio,
            resolution,
            duration: finalDuration,
            filePaths: finalFilePaths,
            files: request.files,
          },
          token
        );

        return {
          created: util.unixTimestamp(),
          task_id: taskId,
          status: 'processing',
          message: '任务已提交，请使用 GET /v1/videos/generations/async/{task_id} 查询结果',
        };
      });
    },

  },

  get: {

    '/international/generations/async/:taskId': async (request: Request) => {
      const { taskId } = request.params;
      if (!taskId) {
        throw new Error('缺少 task_id 参数');
      }

      const task = await queryAsyncVideoTask(taskId);

      if (task.status === 'succeeded') {
        return {
          created: util.unixTimestamp(),
          task_id: task.taskId,
          status: 'succeeded',
          data: [{
            url: task.result.url,
            revised_prompt: task.result.revised_prompt,
          }],
        };
      } else if (task.status === 'failed') {
        return {
          created: util.unixTimestamp(),
          task_id: task.taskId,
          status: 'failed',
          error: task.error,
        };
      } else {
        return {
          created: util.unixTimestamp(),
          task_id: task.taskId,
          status: task.status,
          message: '任务处理中',
        };
      }
    },

    '/generations/async/:taskId': async (request: Request) => {
      const { taskId } = request.params;
      if (!taskId) {
        throw new Error('缺少 task_id 参数');
      }

      const task = await queryAsyncVideoTask(taskId);

      if (task.status === 'succeeded') {
        return {
          created: util.unixTimestamp(),
          task_id: task.taskId,
          status: 'succeeded',
          data: [{
            url: task.result.url,
            revised_prompt: task.result.revised_prompt,
          }],
        };
      } else if (task.status === 'failed') {
        return {
          created: util.unixTimestamp(),
          task_id: task.taskId,
          status: 'failed',
          error: task.error,
        };
      } else {
        return {
          created: util.unixTimestamp(),
          task_id: task.taskId,
          status: task.status,
          message: '任务处理中',
        };
      }
    },

  },

}
