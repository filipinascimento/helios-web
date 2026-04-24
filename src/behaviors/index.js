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

export function createDefaultBehaviorRegistry() {
  return new BehaviorRegistry()
    .register(AppearanceBehavior.id, AppearanceBehavior)
    .register(ExporterBehavior.id, ExporterBehavior)
    .register(MappersBehavior.id, MappersBehavior)
    .register(FilterBehavior.id, FilterBehavior)
    .register(InterfaceBehavior.id, InterfaceBehavior)
    .register(LayoutBehavior.id, LayoutBehavior)
    .register(LegendsBehavior.id, LegendsBehavior)
    .register(LabelsBehavior.id, LabelsBehavior)
    .register(HoverBehavior.id, HoverBehavior)
    .register(SelectionBehavior.id, SelectionBehavior);
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
