import { useMemo } from 'react';
import type { Component, ComponentType, EntityId } from '@engine/core/types.js';
import type { Engine } from '../../runtime/engine.js';
import { useWorldVersion } from './use-engine.js';

export function useComponent<T extends Component>(
  engine: Engine,
  entityId: EntityId,
  type: ComponentType,
): T | undefined {
  const version = useWorldVersion(engine);
  return useMemo(
    () => engine.world.getComponent<T>(entityId, type),
    [engine, entityId, type, version],
  );
}
