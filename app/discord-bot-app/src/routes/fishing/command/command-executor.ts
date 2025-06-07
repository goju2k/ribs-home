import { AbstractCommand } from './abstract-command';
import { SampleRequest } from './sample-request';
import { StartCommand } from './start/start';
import { TestCommand } from './test/test';

const NotFoundResponse = { error: 'unknown command' };

class CommandExecutorClass {

  commandMap = new Map<string, AbstractCommand>([
    [ 'test', TestCommand ],
    [ 'start', StartCommand ],
  ]);

  exec(name:string, data:SampleRequest) {

    const header = {
      channel: {
        id: data.channel.id,
        name: data.channel.name,
      },
      user: {
        id: data.member.user.id,
        username: data.member.user.username,
      },
    };

    console.log('[command start]', name, header, data.data);

    const res = this.commandMap.get(name)?.setHeader(header).exec() || NotFoundResponse;

    console.log('[command e n d]', name, res);

    return res;

  }
}

export const CommandExecutor = new CommandExecutorClass();