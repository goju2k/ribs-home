import { InteractionResponseType, InteractionType, verifyKeyMiddleware } from 'discord-interactions';
import { Router } from 'express';

import { CommandExecutor } from './command/command-executor';

const fishingRouter = Router();

fishingRouter.get('/', (req, res) => {
  console.log('fishing req', req.path);
  res.send('welcome to fishing ok');
});

fishingRouter.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async (req, res) => {

  // Interaction id, type and data
  // console.log('interactions body', req.body);
  const { type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  // console.log('interactions data', data);
  if (type === InteractionType.APPLICATION_COMMAND) {

    // command name
    const { name } = data;

    // execute commands
    const resData = CommandExecutor.exec(name, req.body);
    return res.send(resData);
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

export default fishingRouter;