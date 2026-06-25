import type HeliosNetwork from 'helios-network';

export interface RenderFrame {
  network: HeliosNetwork;
  timestamp: number;
  camera?: unknown;
}
