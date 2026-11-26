import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initializePwa } from './app/installGame';
import './app/styles.css';
import './app/interface.css';
import './app/mobile.css';
import './app/multiplayerHud.css';
import './app/minimap.css';
import './app/loadout.css';

initializePwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
