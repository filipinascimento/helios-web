import { Behavior } from './Behavior.js';
import { BehaviorManager } from './BehaviorManager.js';
import { BehaviorRegistry } from './BehaviorRegistry.js';
import { HoverBehavior } from './HoverBehavior.js';
import { LegendsBehavior } from './LegendsBehavior.js';
import { LabelsBehavior } from './LabelsBehavior.js';
import { SelectionBehavior } from './SelectionBehavior.js';

export function createDefaultBehaviorRegistry() {
  return new BehaviorRegistry()
    .register(LegendsBehavior.id, LegendsBehavior)
    .register(LabelsBehavior.id, LabelsBehavior)
    .register(HoverBehavior.id, HoverBehavior)
    .register(SelectionBehavior.id, SelectionBehavior);
}

export {
  Behavior,
  BehaviorManager,
  BehaviorRegistry,
  HoverBehavior,
  LegendsBehavior,
  LabelsBehavior,
  SelectionBehavior,
};
