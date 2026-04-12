import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { getTokenLiveStatus, getCredit, tokenSplit } from '@/api/controllers/core.ts';
import { recordSessionFailure, recordSessionSuccess } from '@/lib/session-store.ts';
import logger from '@/lib/logger.ts';

export default {

    prefix: '/token',

    post: {

        '/check': async (request: Request) => {
            request
                .validate('body.token', _.isString)
            const live = await getTokenLiveStatus(request.body.token);
            return {
                live
            }
        },

        '/points': async (request: Request) => {
            request
                .validate('headers.authorization', _.isString)
            const tokens = _.uniq(tokenSplit(request.headers.authorization));
            const points = await Promise.all(tokens.map(async (token) => {
                try {
                    const credit = await getCredit(token);
                    await recordSessionSuccess(token);
                    return {
                        token,
                        success: true,
                        points: credit,
                    };
                } catch (error: any) {
                    await recordSessionFailure(token, error);
                    return {
                        token,
                        success: false,
                        error: error?.message || String(error),
                    };
                }
            }))
            return points;
        }

    }

}
