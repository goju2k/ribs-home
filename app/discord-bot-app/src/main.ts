/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */
import express from 'express';

import * as path from 'path';

import fishingRouter from './routes/fishing';

const app = express();

app.use('/assets', express.static(path.join(__dirname, 'assets')));

// health check
app.get('/', (req, res) => {
  res.send('ok');
});

// fishing game
app.use('/fishing', fishingRouter);

const port = process.env.PORT || 3333;
const server = app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}/api`);
});
server.on('error', console.error);