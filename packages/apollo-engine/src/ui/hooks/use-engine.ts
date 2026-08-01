import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Engine } from '../../runtime/engine.js';
import type { WorldBlueprint } from '../../assembly/demo.assembly.js';

export function useEngine(blueprint: WorldBlueprint): Engine {
  const engineRef = useRef<Engine | null>(null);

  if (!engineRef.current) {
    const engine = new Engine();
    engine.load(blueprint);
    engineRef.current = engine;
  }

  useEffect(() => {
    const engine = engineRef.current!;
    engine.start();
    return () => engine.stop();
  }, []);

  return engineRef.current;
}

export function useWorldVersion(engine: Engine): number {
  const snapshot = (): number => engine.world.getVersion();
  return useSyncExternalStore(
    (onStoreChange) => engine.subscribe(onStoreChange),
    snapshot,
    snapshot, // getServerSnapshot：SSR / renderToString 安全（服务端=客户端同快照）
  );
}
