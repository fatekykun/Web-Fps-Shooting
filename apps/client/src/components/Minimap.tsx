import { memo, useLayoutEffect, useRef, type Ref } from 'react';
import { arenas, type ArenaId } from '@breakpoint/shared/maps';
import { minimapImage } from '../game/rendering/minimap';

export const Minimap = memo(function Minimap({
  map,
  marker,
  opacity,
}: {
  map: ArenaId;
  marker?: Ref<HTMLSpanElement>;
  opacity: number;
}) {
  const image = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    if (image.current) image.current.src = minimapImage(map);
  }, [map]);

  return (
    <span
      className="tactical-minimap"
      style={{ opacity: opacity / 100 }}
      role="img"
      aria-label={`${arenas[map].name} minimap`}
      data-testid="minimap"
      data-map={map}
    >
      <img ref={image} alt="" draggable={false} />
      <span className="minimap-north" aria-hidden="true">
        N
      </span>
      <span
        ref={marker}
        className="minimap-marker"
        data-testid="minimap-player"
        aria-hidden="true"
      />
    </span>
  );
});
