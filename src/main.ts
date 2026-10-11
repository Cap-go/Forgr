import { Shell } from './ui/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root');

void new Shell(root).init();
