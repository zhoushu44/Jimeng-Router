import { getOpenAIModelsPayload } from '@/lib/model-store.ts';

export default {

    prefix: '/v1',

    get: {
        '/models': async () => getOpenAIModelsPayload()

    }
}