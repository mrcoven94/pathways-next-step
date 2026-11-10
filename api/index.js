// Vercel entry. Same app as `npm start`; the model log goes to /tmp, the only writable place.

import { createApp } from '../src/app.js';

const app = createApp({ logFile: '/tmp/model-calls.log' });

export default function handler(req, res) {
  return app.handle(req, res);
}
