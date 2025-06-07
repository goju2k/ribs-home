import { InteractionResponseType } from 'discord-interactions';

import { AbstractCommand, CommandHeader } from '../abstract-command';

class TestCommandClass implements AbstractCommand {

  header: CommandHeader;

  items = [ 
    { name: '빈캔', rate: '60' },
    { name: '대구', rate: '25' },
    { name: '연어', rate: '10' },
    { name: '롱소드', rate: '5' },
  ];

  rateBox:[number, number, { name: string; rate: string; }][] = [];

  maxRateValue = 0;
  
  constructor() {
    this.setupItemRate();

    // test ramdom
    const lastItem = this.items[0];
    Array.from(Array(1000)).some((_, idx) => {
      const itemName = this.getItem();

      if (itemName === lastItem.name) {
        console.log(`random test ${lastItem.name} ${idx} 번째 당첨!!!`);
        return true;
      }

      return false;
    });

  }

  setupItemRate() {

    const [ minRateItem ] = this.items.sort((a, b) => (Number(a.rate) - Number(b.rate)));
    const minRate = minRateItem.rate;
    console.log('minRate', minRate);

    const multiple = 10 ** this.countDecimalPlaces(minRate);
    console.log('multiple', multiple);

    let acc = 0;
    this.rateBox = this.items.map((item) => {

      const rate = Number(item.rate);
      const from = acc;
      const to = acc + Math.floor(rate * multiple) - 1;

      acc = to + 1;

      return [ from, to, item ];
    });

    this.rateBox.reverse();
    console.log('rateBox', this.rateBox);

    // eslint-disable-next-line prefer-destructuring
    this.maxRateValue = this.rateBox[0][1];
    console.log('maxRateValue', this.maxRateValue);
  }

  countDecimalPlaces(num) {
    if (Math.floor(num) === num) return 0; // It's an integer
    const decimalStr = num.toString().split('.')[1];
    return decimalStr?.replace(/0+$/, '').length || 0; // Remove trailing zeros
  }

  setHeader(header) {
    this.header = header;
    return this;
  }

  exec() {
    return { 
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `fishing test command.\n\n${this.header.user.username} got ${this.getItem()}!!!` }, 
    };
  }

  getItem() {

    let selectedItem = this.rateBox[0][2];

    const seed = this.getRandom();
    // console.log('getItem seed', seed);

    this.rateBox.some(([ from, to, item ]) => {
      if (seed >= from && seed <= to) {
        selectedItem = item;
        return true;
      }
      return false;
    });

    // console.log('selectedItem', selectedItem.name);

    return selectedItem.name;
  }

  getRandom() {
    return Math.min(Math.floor(Math.random() * this.maxRateValue), this.maxRateValue);
  }

}

export const TestCommand = new TestCommandClass();