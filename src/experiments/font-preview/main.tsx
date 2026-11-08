import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '../../index.css';
import { Experiment } from './Experiment';

createRoot(document.getElementById('root')!).render(<StrictMode><Experiment /></StrictMode>);
