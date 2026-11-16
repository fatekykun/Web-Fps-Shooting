import { TacticalDialog } from './TacticalDialog';

export function PlayPanel({
  ready,
  onClose,
  onTraining,
  onCreate,
  onJoin,
}: {
  ready: boolean;
  onClose(): void;
  onTraining(): void;
  onCreate(): void;
  onJoin(): void;
}) {
  return (
    <TacticalDialog
      title="CHOOSE YOUR OPERATION"
      eyebrow="DEPLOYMENT / THE DEPOT"
      name="Play"
      onClose={onClose}
      className="play-panel"
    >
      <div className="operation-list">
        <button disabled={!ready} onClick={onTraining}>
          <span className="operation-number">01</span>
          <div>
            <h3>TRAINING GROUND</h3>
            <p>Move. Aim. Find your rhythm.</p>
            <small>OFFLINE · SOLO · INSTANT DEPLOY</small>
          </div>
          <span>↗</span>
        </button>
        <button disabled={!ready} onClick={onCreate}>
          <span className="operation-number">02</span>
          <div>
            <h3>CREATE A PRIVATE MATCH</h3>
            <p>Your squad. Your rules.</p>
            <small>FFA / TDM · UP TO 8 PLAYERS</small>
          </div>
          <span>↗</span>
        </button>
        <button disabled={!ready} onClick={onJoin}>
          <span className="operation-number">03</span>
          <div>
            <h3>JOIN YOUR SQUAD</h3>
            <p>Use a six-character room code.</p>
            <small>PRIVATE COMMS · JOIN BY CODE</small>
          </div>
          <span>↗</span>
        </button>
      </div>
    </TacticalDialog>
  );
}
export function CreditsPanel({ onClose }: { onClose(): void }) {
  return (
    <TacticalDialog
      title="BUILT FOR THE NEXT ROUND"
      eyebrow="BREAKPOINT / FIELD NOTES"
      name="Credits"
      onClose={onClose}
      className="credits-panel"
    >
      <div className="credits-brand">
        <span aria-hidden="true">▰</span> BREAKPOINT
        <small>THE DEPOT / 001</small>
      </div>
      <p>
        A browser FPS built around momentum, deliberate gunplay and sharp
        pixels. Eight players. One compact arena. Room to improve every round.
      </p>
      <div className="section-heading">
        <h3>OPEN-SOURCE EQUIPMENT</h3>
        <span>ACKNOWLEDGEMENTS</span>
      </div>
      <ul className="credits-list">
        <li>
          <a href="https://react.dev/" target="_blank" rel="noreferrer">
            React
          </a>
          <span>Interface · MIT</span>
        </li>
        <li>
          <a href="https://threejs.org/" target="_blank" rel="noreferrer">
            Three.js
          </a>
          <span>Renderer · MIT</span>
        </li>
        <li>
          <a href="https://rapier.rs/" target="_blank" rel="noreferrer">
            Rapier
          </a>
          <span>Physics · Apache-2.0</span>
        </li>
        <li>
          <a href="https://colyseus.io/" target="_blank" rel="noreferrer">
            Colyseus
          </a>
          <span>Multiplayer · MIT</span>
        </li>
      </ul>
      <p className="settings-note">
        Interface and arena built for BREAKPOINT. Sound effects and ambient
        tones are procedurally synthesized. Keyboard and mouse required.
      </p>
      <div className="credits-signoff">
        WALK. LEARN. GO AGAIN.<span>END OF TRANSMISSION ■</span>
      </div>
    </TacticalDialog>
  );
}
