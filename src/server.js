// Local server: `npm start`. Every model call is appended to model-calls.log in the repo root.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { MOCK_MODEL_NAME } from './core/mock-model.js';

const port = Number(process.env.PORT ?? 3000);
const logFile = fileURLToPath(new URL('../model-calls.log', import.meta.url));
const app = createApp({ logFile, advisorCode: process.env.ADVISOR_CODE, ...(process.env.PATHWAYS_TODAY && { today: () => process.env.PATHWAYS_TODAY }) });

createServer(app.handle).listen(port, () => {
  console.log(`Pathways is running at http://localhost:${port}`);
  console.log(`Model: ${MOCK_MODEL_NAME}. Every call is logged to model-calls.log.`);
});
