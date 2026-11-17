import {waitUntil} from '@vercel/functions';
import worker from '../dist/server/index.js';
import {createVercelHandler} from '../src/vercel.js';

export const maxDuration=60;
export default {
 fetch(request){return createVercelHandler(worker,process.env,fetch,waitUntil)(request);}
};
