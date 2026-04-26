import { Behavior } from './Behavior.js';
import { AppearanceBehavior } from './AppearanceBehavior.js';
import { BehaviorManager } from './BehaviorManager.js';
import { BehaviorRegistry } from './BehaviorRegistry.js';
import { ExporterBehavior } from './ExporterBehavior.js';
import { FilterBehavior } from './FilterBehavior.js';
import { HoverBehavior } from './HoverBehavior.js';
import { InterfaceBehavior } from './InterfaceBehavior.js';
import { LayoutBehavior } from './LayoutBehavior.js';
import { LegendsBehavior } from './LegendsBehavior.js';
import { LabelsBehavior } from './LabelsBehavior.js';
import { MappersBehavior } from './MappersBehavior.js';
import { SelectionBehavior } from './SelectionBehavior.js';

export const BEHAVIOR_IDS = Object.freeze([
  AppearanceBehavior.id,
  ExporterBehavior.id,
  MappersBehavior.id,
  FilterBehavior.id,
  InterfaceBehavior.id,
  LayoutBehavior.id,
  LegendsBehavior.id,
  LabelsBehavior.id,
  HoverBehavior.id,
  SelectionBehavior.id,
]);

export function createDefaultBehaviorRegistry() {
  return new BehaviorRegistry()
    .register(BEHAVIOR_IDS[0], AppearanceBehavior)
    .register(BEHAVIOR_IDS[1], ExporterBehavior)
    .register(BEHAVIOR_IDS[2], MappersBehavior)
    .register(BEHAVIOR_IDS[3], FilterBehavior)
    .register(BEHAVIOR_IDS[4], InterfaceBehavior)
    .register(BEHAVIOR_IDS[5], LayoutBehavior)
    .register(BEHAVIOR_IDS[6], LegendsBehavior)
    .register(BEHAVIOR_IDS[7], LabelsBehavior)
    .register(BEHAVIOR_IDS[8], HoverBehavior)
    .register(BEHAVIOR_IDS[9], SelectionBehavior);
}

export {
  AppearanceBehavior,
  Behavior,
  BehaviorManager,
  BehaviorRegistry,
  ExporterBehavior,
  FilterBehavior,
  HoverBehavior,
  InterfaceBehavior,
  LayoutBehavior,
  LegendsBehavior,
  LabelsBehavior,
  MappersBehavior,
  SelectionBehavior,
};
