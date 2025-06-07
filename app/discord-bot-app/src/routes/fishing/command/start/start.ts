import { InteractionResponseType } from 'discord-interactions';

import { AbstractCommand, CommandHeader } from '../abstract-command';

class StartCommandClass implements AbstractCommand {

  header: CommandHeader;

  setHeader(header) {
    this.header = header;
    return this;
  }

  exec() {
    return { type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'fishing start.' } };
  }

}

export const StartCommand = new StartCommandClass();