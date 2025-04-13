export interface ComponentHistoryOption {
  url?:string | URL | null;
  onActive?: (data:unknown)=>void;
}

export interface ComponentHistoryData {
  id: string;
  name: string;
  data:unknown;
  option:ComponentHistoryOption;
}

export class ComponentHistory {

  stack: ComponentHistoryData[] = [];

  idSet: Set<string> = new Set();

  constructor() {
    window.addEventListener('popstate', this.handlePopState);
  }
  
  handlePopState(event:PopStateEvent) {

    const { state } = event;

    // component history 의 state 이면...
    if (state.id && this.idSet.has(state.id)) {

      const targetData = this.stack.pop();
      if (targetData?.id === state.id) {
        targetData?.option.onActive?.(targetData.data);
      }

    }
    
  }

  push(data: ComponentHistoryData) {

    data.id = `history-${this.generateHistoryId()}`;
    this.idSet.add(data.id);
    
    this.stack.push(data);

    window.history.pushState(data, '', data.option.url);
  }

  generateHistoryId() {
    return Date.now();
  }

  destroy() {
    window.removeEventListener('popstate', this.handlePopState);
  }

}