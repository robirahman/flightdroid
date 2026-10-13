import 'leaflet/dist/leaflet.css';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import './styles.css';

render(<App />, document.getElementById('app')!);
if (import.meta.env.PROD) registerSW({ immediate: true });
