export interface AudioVisualizerState {
  volume: number;
  frequencyData: Uint8Array;
}

export enum BotState {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}
