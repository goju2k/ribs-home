import { InteractionResponseType } from 'discord-interactions';

export interface User {
  id: string;
  username: string;
}

export interface Channel {
  id: string;
  name: string;
}

export interface CommandHeader {
  user: User;
  channel: Channel;
}

export interface CommandResponse {
  type: InteractionResponseType;
  data: {
    content: string;
  };
}

export interface AbstractCommand {
  header:CommandHeader;
  setHeader: (header:CommandHeader) => this;
  exec: () => CommandResponse;
}