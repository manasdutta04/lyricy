import '@/ui/lyrics.css';
import './style.css';
import { render } from 'preact';
import { App } from './App';

const root = document.getElementById('app');
if (root) render(<App />, root);
