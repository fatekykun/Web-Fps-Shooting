import type { GameTelemetry } from '../game/core/Game';

export function Telemetry({
  stats,
  multiplayer = false,
}: {
  stats: GameTelemetry | null;
  multiplayer?: boolean;
}) {
  return (
    <aside
      className="telemetry"
      aria-label="Live performance metrics"
      data-fps={stats?.fps}
      data-frame-ms={stats?.frameMs}
      data-low-fps={stats?.lowFps}
      data-cpu-ms={stats?.cpuMs}
      data-draws={stats?.drawCalls}
      data-triangles={stats?.triangles}
      data-heap-mb={stats?.heapMb}
      data-trails={stats?.trails.active}
      data-trails-emitted={stats?.trails.emitted}
      data-trail-opacity={stats?.trails.opacity}
      data-trail-thickness={stats?.trails.thickness}
      data-trail-length={stats?.trails.length}
    >
      <div className="fps-line">
        <span className="perf-icon">▥</span>
        <strong data-testid="fps">{stats ? Math.round(stats.fps) : '—'}</strong>
        <span>FPS</span>
        <span className="perf-badge">LIVE</span>
        {multiplayer && (
          <span
            className="match-connection"
            data-connected={Boolean(stats?.network)}
          >
            <i aria-hidden="true" />
            {stats?.network ? 'CONNECTED' : 'CONNECTING'}
          </span>
        )}
      </div>
      <dl>
        <div>
          <dt>FRAME / 1% LOW</dt>
          <dd>
            {stats
              ? `${stats.frameMs.toFixed(1)} ms / ${Math.round(stats.lowFps)}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>CPU SUBMIT</dt>
          <dd>{stats ? `${stats.cpuMs.toFixed(2)} ms` : '—'}</dd>
        </div>
        <div>
          <dt>DRAWS / TRIS</dt>
          <dd>
            {stats
              ? `${stats.drawCalls} / ${stats.triangles.toLocaleString()}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>JS HEAP</dt>
          <dd>
            {stats?.heapMb != null ? `${stats.heapMb.toFixed(1)} MB` : 'N/A'}
          </dd>
        </div>
      </dl>
      {stats?.network && (
        <div
          className="render-readout"
          data-testid="network-status"
          data-peers={stats.network.peers}
          data-ack={stats.network.ack}
        >
          <span>
            {stats.network.peers} PEERS / ACK {stats.network.ack}
          </span>
          <span>NET 60 / 20</span>
        </div>
      )}
      <div
        className="render-readout"
        data-testid="render-resolution"
        data-width={stats?.renderWidth}
        data-height={stats?.renderHeight}
        data-output-width={stats?.outputWidth}
        data-output-height={stats?.outputHeight}
        data-preset={stats?.graphicsPreset}
        data-world-draws={stats?.worldDrawCalls}
        data-texture-quality={stats?.graphics.textureQuality}
        data-texture-tile-size={stats?.textureTileSize}
        data-shadow-quality={stats?.graphics.shadowQuality}
        data-shadow-map-size={stats?.shadowMapSize}
        data-view-distance={stats?.graphics.viewDistance}
        data-camera-far={stats?.cameraFar}
        data-render-scale={stats?.graphics.renderScale}
        data-aa-requested={stats?.antiAliasing.requested}
        data-aa-active={stats?.antiAliasing.active}
        data-aa-samples={stats?.antiAliasing.samples}
        data-aa-passes={stats?.antiAliasing.passes}
        data-aa-loading={stats?.antiAliasing.loading}
        data-aa-supported={stats?.antiAliasing.supported.join(',')}
        data-draws={stats?.drawCalls}
      >
        <span>
          WORLD {stats ? `${stats.renderWidth} × ${stats.renderHeight}` : '—'}
        </span>
        <span>{stats?.adaptiveResolution ? 'AUTO' : 'FIXED'} / NEAREST</span>
      </div>
      <div
        className="position-readout"
        data-testid="position"
        data-x={stats?.x}
        data-y={stats?.y}
        data-z={stats?.z}
        data-state={stats?.movementState}
        data-half-height={stats?.halfHeight}
      >
        XYZ{' '}
        {stats
          ? `${stats.x.toFixed(1)} / ${stats.y.toFixed(1)} / ${stats.z.toFixed(1)}`
          : '—'}
        <br />
        <span data-testid="speed">
          {stats ? stats.speed.toFixed(1) : '0.0'}
        </span>{' '}
        M/S{' '}
        <span className="ground-label">
          {stats?.grounded ? 'GROUNDED' : 'AIR'}
        </span>
        <br />
        <span data-testid="movement-state">
          {stats?.movementState.toUpperCase() ?? 'STANDBY'}
        </span>
      </div>
    </aside>
  );
}
