import { app, port } from './app.js';

app.listen(port, () => {
  console.log(`Event service running on http://localhost:${port}`);
});