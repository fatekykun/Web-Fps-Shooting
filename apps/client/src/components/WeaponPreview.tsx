import { useEffect, useRef, useState } from 'react';
import {
  skinDefinitions,
  type Equipment,
} from '@breakpoint/shared/weapons/loadouts';
import type { WeaponShowcase } from '../game/weapons/WeaponShowcase';

export function weaponThumbnail({ weapon, skin }: Equipment): string {
  return `${import.meta.env.BASE_URL}models/thumbnails/${weapon}-${skin}.webp`;
}

export function WeaponPreview({
  equipment,
  reducedMotion,
  inspecting,
  onInspect,
}: {
  equipment: Equipment;
  reducedMotion: boolean;
  inspecting: boolean;
  onInspect(): void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<WeaponShowcase>();
  const [unavailable, setUnavailable] = useState(false);
  const [result, setResult] = useState<{
    key: string;
    status: 'ready' | 'fallback';
  }>();
  const key = `${equipment.weapon}/${equipment.skin}`;
  useEffect(() => {
    let cancelled = false;
    let preview: WeaponShowcase | undefined;
    const host = surface.current!;
    void import('../game/weapons/WeaponShowcase')
      .then(({ WeaponShowcase }) => {
        if (cancelled) return;
        preview = new WeaponShowcase(host);
        setEngine(preview);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
      preview?.dispose();
    };
  }, []);
  useEffect(() => {
    engine?.setReducedMotion(reducedMotion);
  }, [engine, reducedMotion]);
  const { weapon, skin } = equipment;
  useEffect(() => {
    let cancelled = false;
    void engine
      ?.show({ weapon, skin })
      .then((status) => {
        if (status && !cancelled)
          setResult({ key: `${weapon}/${skin}`, status });
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [engine, weapon, skin]);
  const status = unavailable
    ? 'unavailable'
    : result?.key === key
      ? result.status
      : 'loading';
  return (
    <section
      className="weapon-showcase"
      aria-label="Weapon showcase"
      data-testid="weapon-showcase"
      data-status={status}
    >
      <div className="showcase-surface" ref={surface}>
        {unavailable && (
          <img
            src={weaponThumbnail(equipment)}
            alt={skinDefinitions[skin].name}
          />
        )}
      </div>
      {status !== 'ready' && (
        <span className="showcase-status" role="status">
          {status === 'loading'
            ? 'Loading weapon model…'
            : status === 'fallback'
              ? 'Showing the standard weapon'
              : 'Interactive preview unavailable'}
        </span>
      )}
      <div className="showcase-actions">
        <button
          type="button"
          disabled={!engine}
          onClick={() => engine?.reset()}
        >
          Reset View
        </button>
        <button type="button" aria-pressed={inspecting} onClick={onInspect}>
          {inspecting ? 'Exit Full Screen' : 'Full Screen Inspect'}
        </button>
      </div>
    </section>
  );
}
