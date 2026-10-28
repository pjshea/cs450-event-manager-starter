import { app, port } from './app.js';

app.listen(port, () => {
  console.log(`Event Manager backend running on http://localhost:${port}`);
});